import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { DEFAULT_DIFF_TOOL_ARGUMENTS, DEFAULT_MERGE_TOOL_ARGUMENTS } from '../../shared/types'
import type {
  AbortOperation,
  BlameLine,
  BranchInfo,
  BranchComparison,
  ChangelistState,
  CommitDetails,
  CommitInfo,
  DiffDocument,
  DiffRequest,
  ExternalDiffRequest,
  ExternalDiffSource,
  ConflictFile,
  ConflictResolution,
  CloneRequest,
  GraphCommit,
  GitHealth,
  InitRequest,
  LfsLock,
  LfsStatus,
  LocalChangelist,
  OperationState,
  PullResult,
  PushPreview,
  PushRequest,
  RemoteInfo,
  RepositorySummary,
  ReflogEntry,
  ResetMode,
  RevisionFile,
  RevisionResolution,
  SelectiveMergeRequest,
  SelectiveMergeResult,
  StrictSubmitRequest,
  StrictSubmitResult,
  SubmitMergeRequestTarget,
  StashEntry,
  ShelfInfo,
  WorkspaceEntry
} from '../../shared/types'
import { SettingsStore } from '../settings'
import { parseBlame, parseBranches, parseLog, parsePorcelainV2, parseReflog, parseRevisionFiles, parseStashes } from './parsers'

const execFileAsync = promisify(execFile)
const maxBuffer = 16 * 1024 * 1024

export function expandDiffToolArguments(template: string, values: Record<'left' | 'right' | 'leftTitle' | 'rightTitle', string>): string[] {
  const tokens: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < template.length; index += 1) {
    const character = template[index]
    if (character === '"') {
      quoted = !quoted
    } else if (/\s/.test(character) && !quoted) {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += character
    }
  }
  if (quoted) throw new Error('外部 Diff 参数模板中的引号没有闭合。')
  if (current) tokens.push(current)
  return tokens.map((token) => token.replace(/\{(left|right|leftTitle|rightTitle)\}/g, (_match, key: keyof typeof values) => values[key]))
}

export function expandMergeToolArguments(template: string, values: Record<'base' | 'ours' | 'theirs' | 'result', string>): string[] {
  const tokens: string[] = []
  let current = ''
  let quoted = false
  for (const character of template) {
    if (character === '"') quoted = !quoted
    else if (/\s/.test(character) && !quoted) {
      if (current) { tokens.push(current); current = '' }
    } else current += character
  }
  if (quoted) throw new Error('外部 Merge 参数模板中的引号没有闭合。')
  if (current) tokens.push(current)
  return tokens.map((token) => token.replace(/\{(base|ours|theirs|result)\}/g, (_match, key: keyof typeof values) => values[key]))
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

interface SelectiveMergeSession {
  version: 1
  head: string
  changelistId: string
  refs: string[]
  nextIndex: number
  paths: string[]
  createdAt: string
}

interface StrictSubmitSession {
  version: 1
  branch: string
  remote: string
  remoteBranch: string
  upstream: string
  commit: string
  paths: string[]
  attempts: number
  stashHash?: string
  createdAt: string
}

async function canExecute(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    await execFileAsync(filePath, ['--version'], { windowsHide: true, timeout: 8_000 })
    return true
  } catch {
    return false
  }
}

export class GitService {
  private gitPath?: string
  private readonly activeProcesses = new Map<ChildProcess, string | undefined>()

  constructor(private readonly settings: SettingsStore) {}

  async setGitPath(filePath: string): Promise<GitHealth> {
    const candidate = resolve(filePath)
    if (!(await canExecute(candidate))) {
      return { available: false, path: candidate, error: '选择的文件不是可用的 Git 可执行程序。' }
    }
    this.gitPath = candidate
    await this.settings.update({ gitPath: candidate })
    return this.health()
  }

  async health(): Promise<GitHealth> {
    try {
      const gitPath = await this.resolveGitPath()
      const version = (await this.runRaw(gitPath, ['--version'])).trim()
      return { available: true, path: gitPath, version }
    } catch (error) {
      return {
        available: false,
        error: `未找到 Git。请安装 Git for Windows，或在设置中选择 UGit 使用的 git.exe。${asErrorMessage(error)}`
      }
    }
  }

  async openRepository(repoPath: string): Promise<RepositorySummary> {
    const root = await this.repositoryRoot(repoPath)
    await this.settings.rememberRepository(root)
    return this.summary(root)
  }

  async summary(repoPath: string): Promise<RepositorySummary> {
    const root = await this.repositoryRoot(repoPath)
    const [branchResult, statusOutput, upstreamResult, remoteResult] = await Promise.all([
      this.run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => ''),
      this.run(root, ['status', '--porcelain=v2', '-z', '--untracked-files=all']),
      this.run(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(
        () => ''
      ),
      this.run(root, ['remote', 'get-url', 'origin']).catch(() => '')
    ])

    const branch = branchResult.trim()
    const upstream = upstreamResult.trim()
    let ahead = 0
    let behind = 0
    if (upstream) {
      const counts = (
        await this.run(root, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`])
      )
        .trim()
        .split(/\s+/)
      ahead = Number(counts[0] ?? 0)
      behind = Number(counts[1] ?? 0)
    }

    return {
      root,
      name: basename(root),
      branch: branch || (await this.run(root, ['rev-parse', '--short', 'HEAD'])).trim(),
      detached: !branch,
      upstream: upstream || undefined,
      ahead,
      behind,
      remoteUrl: remoteResult.trim() || undefined,
      changes: parsePorcelainV2(statusOutput)
    }
  }

  async diff(request: DiffRequest): Promise<string> {
    const root = await this.repositoryRoot(request.repoPath)
    const safePath = this.safeRelativePath(root, request.filePath)
    if (request.untracked) {
      const fullPath = join(root, safePath)
      const content = await readFile(fullPath)
      if (content.includes(0)) return 'Binary file — preview is not available.'
      if (content.byteLength > 2 * 1024 * 1024) return 'File is larger than 2 MB — preview is disabled.'
      const text = content.toString('utf8')
      const lines = text.split('\n')
      if (lines.at(-1) === '') lines.pop()
      if (!lines.length) return 'No textual differences to display.'
      return `--- /dev/null\n+++ b/${safePath}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}${text.endsWith('\n') ? '\n' : '\n\\ No newline at end of file\n'}`
    }
    const args = ['diff', '--no-ext-diff', '--no-color']
    if (request.staged) args.push('--cached')
    if (request.baseRef) args.push(this.safeRef(request.baseRef))
    args.push('--', safePath)
    return this.run(root, args)
  }

  async stage(repoPath: string, paths: string[]): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const safePaths = paths.map((item) => this.safeRelativePath(root, item))
    if (safePaths.length) await this.run(root, ['add', '--', ...safePaths])
  }

  async unstage(repoPath: string, paths: string[]): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const safePaths = paths.map((item) => this.safeRelativePath(root, item))
    if (safePaths.length) {
      await this.run(root, ['restore', '--staged', '--', ...safePaths]).catch(() =>
        this.run(root, ['reset', '--', ...safePaths])
      )
    }
  }

  async discard(repoPath: string, paths: string[]): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const safePaths = paths.map((item) => this.safeRelativePath(root, item))
    if (safePaths.length) await this.run(root, ['restore', '--worktree', '--', ...safePaths])
  }

  async markDelete(repoPath: string, paths: string[]): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    for (const item of paths) {
      const safePath = this.safeRelativePath(root, item)
      const exists = await access(join(root, safePath)).then(() => true).catch(() => false)
      await this.run(root, exists ? ['rm', '--', safePath] : ['add', '-u', '--', safePath])
    }
  }

  async revert(repoPath: string, paths: string[]): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    for (const item of paths) {
      const safePath = this.safeRelativePath(root, item)
      const existsInHead = await this.run(root, ['cat-file', '-e', `HEAD:${safePath}`])
        .then(() => true)
        .catch(() => false)
      if (existsInHead) {
        await this.run(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', safePath])
      } else {
        await this.run(root, ['restore', '--staged', '--', safePath]).catch(() =>
          this.run(root, ['reset', '--', safePath])
        )
        await rm(join(root, safePath), { force: true })
      }
    }
  }

  async restoreFromRef(repoPath: string, ref: string, paths: string[]): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const safeRef = this.safeRef(ref)
    await this.run(root, ['rev-parse', '--verify', `${safeRef}^{commit}`])
    const safePaths = paths.map((item) => item === '.' ? '.' : this.safeRelativePath(root, item))
    if (safePaths.length) {
      await this.run(root, ['restore', `--source=${safeRef}`, '--worktree', '--', ...safePaths])
    }
  }

  async resolveRevision(repoPath: string, input: string): Promise<RevisionResolution> {
    const root = await this.repositoryRoot(repoPath)
    const value = input.trim()
    if (!value || value.length > 1024 || /[\0\r\n]/.test(value)) throw new Error('请输入分支、Tag、提交哈希或日期。')
    const parsedDate = Date.parse(value)
    const hash = Number.isFinite(parsedDate) && !/^[0-9a-f]{7,40}$/i.test(value)
      ? (await this.run(root, ['rev-list', '-1', `--before=${new Date(parsedDate).toISOString()}`, '--all'])).trim()
      : (await this.run(root, ['rev-parse', '--verify', `${this.safeRef(value)}^{commit}`])).trim()
    if (!hash) throw new Error('找不到符合条件的提交。')
    const output = await this.run(root, ['show', '-s', '--date=iso-strict', '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f%D', hash])
    const [fullHash, shortHash, author, date, subject, decoration = ''] = output.trim().split('\x1f')
    return { input: value, hash: fullHash, shortHash, author, date, subject, refs: decoration.split(',').map((item) => item.trim()).filter(Boolean), files: await this.commitFiles(root, fullHash) }
  }

  async lfsStatus(repoPath: string): Promise<LfsStatus> {
    const root = await this.repositoryRoot(repoPath)
    const version = await this.run(root, ['lfs', 'version']).then((value) => value.trim()).catch(() => '')
    if (!version) return { installed: false, repositoryEnabled: false, error: 'Git LFS 未安装。请先安装 Git LFS。', locks: [] }
    const repositoryEnabled = await this.run(root, ['config', '--local', '--get-regexp', '^filter\\.lfs\\.']).then(() => true).catch(() => false)
    try {
      type RawLock = { id?: string; path?: string; owner?: { name?: string } | string; locked_at?: string }
      const [parsed, mine] = await Promise.all([
        this.run(root, ['lfs', 'locks', '--json']).then((value) => JSON.parse(value) as { locks?: RawLock[] }),
        this.run(root, ['lfs', 'locks', '--json', '--ours']).then((value) => JSON.parse(value) as { locks?: RawLock[] }).catch(() => ({ locks: [] as RawLock[] }))
      ])
      const ours = new Set((mine.locks ?? []).map((item) => item.id ?? item.path))
      const seen = new Set<string>()
      const locks: LfsLock[] = [...(parsed.locks ?? []), ...(mine.locks ?? [])].flatMap((item) => {
        const path = item.path ?? ''
        const id = item.id ?? path
        if (!path || seen.has(id)) return []
        seen.add(id)
        return [{ id, path, owner: typeof item.owner === 'string' ? item.owner : item.owner?.name ?? '', lockedAt: item.locked_at, mine: ours.has(id) }]
      })
      return { installed: true, repositoryEnabled, version, locks }
    } catch (error) {
      return { installed: true, repositoryEnabled, version, error: asErrorMessage(error), locks: [] }
    }
  }

  async lockLfsFiles(repoPath: string, paths: string[]): Promise<LfsStatus> {
    const root = await this.repositoryRoot(repoPath)
    for (const path of paths) await this.run(root, ['lfs', 'lock', '--', this.safeRelativePath(root, path)])
    return this.lfsStatus(root)
  }

  async unlockLfsFiles(repoPath: string, paths: string[], force = false): Promise<LfsStatus> {
    const root = await this.repositoryRoot(repoPath)
    for (const path of paths) await this.run(root, ['lfs', 'unlock', ...(force ? ['--force'] : []), '--', this.safeRelativePath(root, path)])
    return this.lfsStatus(root)
  }

  async changelists(repoPath: string): Promise<ChangelistState> {
    const root = await this.repositoryRoot(repoPath)
    return this.readChangelists(root)
  }

  async createChangelist(repoPath: string, name: string, description = ''): Promise<ChangelistState> {
    const root = await this.repositoryRoot(repoPath)
    const state = await this.readChangelists(root)
    const cleanName = this.changelistName(name)
    if (state.changelists.some((item) => item.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('已存在同名 Changelist。')
    }
    state.changelists.push({
      id: randomUUID(),
      name: cleanName,
      description: description.trim().slice(0, 2_000),
      createdAt: new Date().toISOString()
    })
    await this.writeChangelists(root, state)
    return state
  }

  async updateChangelist(repoPath: string, id: string, name: string, description = ''): Promise<ChangelistState> {
    const root = await this.repositoryRoot(repoPath)
    const state = await this.readChangelists(root)
    const target = state.changelists.find((item) => item.id === id)
    if (!target) throw new Error('Changelist 不存在。')
    const cleanName = this.changelistName(name)
    if (state.changelists.some((item) => item.id !== id && item.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('已存在同名 Changelist。')
    }
    target.name = cleanName
    target.description = description.trim().slice(0, 2_000)
    await this.writeChangelists(root, state)
    return state
  }

  async deleteChangelist(repoPath: string, id: string): Promise<ChangelistState> {
    const root = await this.repositoryRoot(repoPath)
    const state = await this.readChangelists(root)
    if (!state.changelists.some((item) => item.id === id)) throw new Error('Changelist 不存在。')
    state.changelists = state.changelists.filter((item) => item.id !== id)
    state.assignments = Object.fromEntries(Object.entries(state.assignments).filter(([, value]) => value !== id))
    await this.writeChangelists(root, state)
    return state
  }

  async assignChangelist(repoPath: string, paths: string[], id?: string): Promise<ChangelistState> {
    const root = await this.repositoryRoot(repoPath)
    const state = await this.readChangelists(root)
    if (id && !state.changelists.some((item) => item.id === id)) throw new Error('目标 Changelist 不存在。')
    for (const item of paths) {
      const safePath = this.safeRelativePath(root, item)
      if (id) state.assignments[safePath] = id
      else delete state.assignments[safePath]
    }
    await this.writeChangelists(root, state)
    return state
  }

  async prepareChangelist(repoPath: string, paths: string[]): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const safePaths = paths.map((item) => this.safeRelativePath(root, item))
    if (!safePaths.length) throw new Error('Changelist 中没有可提交文件。')
    await this.run(root, ['reset']).catch(() =>
      this.run(root, ['rm', '--cached', '-r', '--ignore-unmatch', '.'])
    )
    await this.run(root, ['add', '--', ...safePaths])
  }

  async shelveChangelist(repoPath: string, id: string | undefined, name: string, description: string, paths: string[]): Promise<ChangelistState> {
    const root = await this.repositoryRoot(repoPath)
    const safePaths = paths.map((item) => this.safeRelativePath(root, item))
    if (!safePaths.length) throw new Error('Changelist 中没有可 Shelve 的文件。')
    const before = await this.run(root, ['rev-parse', '--verify', 'refs/stash']).then((value) => value.trim()).catch(() => '')
    await this.run(root, ['stash', 'push', '--include-untracked', '-m', `P4Git shelf: ${name}`, '--', ...safePaths])
    const hash = (await this.run(root, ['rev-parse', '--verify', 'refs/stash'])).trim()
    if (!hash || hash === before) throw new Error('没有产生新的 Shelf；所选文件可能没有可保存的改动。')
    const state = await this.readChangelists(root)
    const shelf: ShelfInfo = { hash, name, description, changelistId: id, paths: safePaths, createdAt: new Date().toISOString() }
    state.shelves = [shelf, ...state.shelves.filter((item) => item.hash !== hash)]
    for (const path of safePaths) delete state.assignments[path]
    await this.writeChangelists(root, state)
    return state
  }

  async unshelve(repoPath: string, hash: string): Promise<ChangelistState> {
    const root = await this.repositoryRoot(repoPath)
    const safeHash = this.safeRef(hash)
    const state = await this.readChangelists(root)
    const shelf = state.shelves.find((item) => item.hash === safeHash)
    if (!shelf) throw new Error('Shelf 元数据不存在，可能已在其他 Git 客户端中删除。')
    await this.run(root, ['stash', 'apply', '--index', safeHash]).catch(() => this.run(root, ['stash', 'apply', safeHash]))
    const stash = (await this.stashes(root)).find((item) => item.hash === safeHash)
    if (stash) await this.run(root, ['stash', 'drop', stash.ref])
    if (shelf.changelistId && state.changelists.some((item) => item.id === shelf.changelistId)) {
      for (const path of shelf.paths) state.assignments[path] = shelf.changelistId
    }
    state.shelves = state.shelves.filter((item) => item.hash !== safeHash)
    await this.writeChangelists(root, state)
    return state
  }

  async stashes(repoPath: string): Promise<StashEntry[]> {
    const root = await this.repositoryRoot(repoPath)
    const output = await this.run(root, [
      'stash',
      'list',
      '--format=%gd%x1f%H%x1f%aI%x1f%gs%x1e'
    ])
    return parseStashes(output)
  }

  async stash(repoPath: string, message: string, paths: string[] = []): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const description = message.trim() || 'P4Git stash'
    const args = ['stash', 'push', '--include-untracked', '-m', description]
    const safePaths = paths.map((item) => this.safeRelativePath(root, item))
    if (safePaths.length) args.push('--', ...safePaths)
    return this.run(root, args)
  }

  async applyStash(repoPath: string, ref: string, pop = false): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    return this.run(root, ['stash', pop ? 'pop' : 'apply', this.safeRef(ref)])
  }

  async dropStash(repoPath: string, ref: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    return this.run(root, ['stash', 'drop', this.safeRef(ref)])
  }

  async reflog(repoPath: string, limit = 100): Promise<ReflogEntry[]> {
    const root = await this.repositoryRoot(repoPath)
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500)
    const output = await this.run(root, [
      'reflog',
      `-${safeLimit}`,
      '--format=%H%x1f%h%x1f%gd%x1f%aI%x1f%gs%x1e'
    ])
    return parseReflog(output)
  }

  async cherryPick(repoPath: string, ref: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    return this.run(root, ['cherry-pick', this.safeRef(ref)])
  }

  async cherryPickCommits(repoPath: string, refs: string[]): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const ordered = await this.orderedCherryPickRefs(root, refs)
    return this.run(root, ['cherry-pick', ...ordered])
  }

  async selectiveMergeCommits(request: SelectiveMergeRequest): Promise<SelectiveMergeResult> {
    const root = await this.repositoryRoot(request.repoPath)
    if (await this.readSelectiveMergeSession(root)) throw new Error('当前已有一个未完成的选择性合并，请先 Resolve、Continue 或 Abort。')
    const dirty = (await this.run(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).length > 0
    if (dirty) throw new Error('选择性合并要求工作区为空。请先提交或 Shelve 当前 Changelist，避免合并文件与现有改动混合。')
    const refs = await this.orderedCherryPickRefs(root, request.refs)
    const state = await this.readChangelists(root)
    const name = this.changelistName(request.changelistName)
    if (state.changelists.some((item) => item.name.toLowerCase() === name.toLowerCase())) throw new Error('已存在同名 Changelist。')
    const changelist: LocalChangelist = {
      id: randomUUID(),
      name,
      description: (request.description ?? '').trim().slice(0, 2_000),
      createdAt: new Date().toISOString()
    }
    state.changelists.push(changelist)
    await this.writeChangelists(root, state)
    const session: SelectiveMergeSession = {
      version: 1,
      head: (await this.run(root, ['rev-parse', 'HEAD'])).trim(),
      changelistId: changelist.id,
      refs,
      nextIndex: 0,
      paths: [],
      createdAt: new Date().toISOString()
    }
    await this.writeSelectiveMergeSession(root, session)
    try {
      return await this.applySelectiveMergeSession(root, session)
    } catch (error) {
      await this.rollbackSelectiveMerge(root, session)
      throw error
    }
  }

  async merge(repoPath: string, ref: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    return this.run(root, ['merge', '--no-edit', this.safeRef(ref)])
  }

  async rebase(repoPath: string, ref: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    return this.run(root, ['rebase', this.safeRef(ref)])
  }

  async createTag(repoPath: string, name: string, ref: string): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const tagName = this.safeRef(name)
    await this.run(root, ['check-ref-format', `refs/tags/${tagName}`])
    await this.run(root, ['tag', tagName, this.safeRef(ref)])
  }

  async reset(repoPath: string, ref: string, mode: ResetMode): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    if (!['soft', 'mixed', 'hard'].includes(mode)) throw new Error('Reset 模式无效。')
    await this.run(root, ['reset', `--${mode}`, this.safeRef(ref)])
  }

  async deleteBranch(repoPath: string, branch: string): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    await this.run(root, ['branch', '-d', '--', this.safeRef(branch)])
  }

  async renameBranch(repoPath: string, oldName: string, newName: string): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const previous = this.safeRef(oldName)
    const next = this.safeRef(newName)
    await this.run(root, ['check-ref-format', `refs/heads/${next}`])
    await this.run(root, ['branch', '-m', previous, next])
  }

  async compareBranch(repoPath: string, branch: string): Promise<BranchComparison> {
    const root = await this.repositoryRoot(repoPath)
    const selected = this.safeRef(branch)
    const current = (await this.run(root, ['branch', '--show-current'])).trim()
    if (!current) throw new Error('Detached HEAD 无法执行分支比较。')
    const [candidates, outgoing, cherry] = await Promise.all([
      this.logRange(root, `${current}..${selected}`),
      this.logRange(root, `${selected}..${current}`),
      this.run(root, ['cherry', current, selected]).catch(() => '')
    ])
    const equivalent = new Set(cherry.split(/\r?\n/).filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim()))
    const integrated = candidates.filter((commit) => equivalent.has(commit.hash))
    const incoming = candidates.filter((commit) => !equivalent.has(commit.hash))
    return { current, selected, incoming, integrated, outgoing }
  }

  async abort(repoPath: string, operation: AbortOperation): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    if (!['merge', 'rebase', 'cherry-pick', 'revert'].includes(operation)) throw new Error('Git 操作类型无效。')
    const session = operation === 'cherry-pick' ? await this.readSelectiveMergeSession(root) : undefined
    if (session) {
      await this.rollbackSelectiveMerge(root, session)
      return
    }
    await this.run(root, [operation, '--abort'])
  }

  async commit(repoPath: string, message: string, amend = false): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const trimmed = message.trim()
    if (!trimmed) throw new Error('提交说明不能为空。')
    return this.run(root, ['commit', ...(amend ? ['--amend'] : []), '-m', trimmed])
  }

  async strictSubmit(request: StrictSubmitRequest): Promise<StrictSubmitResult> {
    const root = await this.repositoryRoot(request.repoPath)
    if (await this.readStrictSubmitSession(root)) {
      throw new Error('已有一个本地提交正在等待服务器接收。请使用 Retry Submit，不能再次创建提交。')
    }
    const operation = await this.operationState(root)
    if (operation.operation || operation.conflicts) throw new Error('当前有未完成的 Git 操作或冲突，请先 Resolve 或 Abort。')
    const message = request.message.trim()
    if (!message) throw new Error('提交说明不能为空。')
    const branch = (await this.run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
    if (!branch) throw new Error('Detached HEAD 不能执行 P4V 严格提交，请先切换到本地分支。')
    const target = await this.strictSubmitTarget(root, branch)
    await this.run(root, ['fetch', target.remote, '--prune'])
    await this.run(root, ['commit', '-m', message])
    const commit = (await this.run(root, ['rev-parse', 'HEAD'])).trim()
    const session: StrictSubmitSession = {
      version: 1,
      branch,
      ...target,
      commit,
      paths: [...new Set(request.paths.map((item) => this.safeRelativePath(root, item)))],
      attempts: 0,
      createdAt: new Date().toISOString()
    }
    await this.writeStrictSubmitSession(root, session)
    try {
      return await this.finishStrictSubmit(root, session)
    } catch (error) {
      throw new Error(`本地提交 ${commit.slice(0, 10)} 已创建，但服务器尚未确认接收。请 Resolve 后 Continue，或使用 Retry Submit。\n\n${asErrorMessage(error)}`)
    }
  }

  async resumeSubmit(repoPath: string): Promise<StrictSubmitResult> {
    const root = await this.repositoryRoot(repoPath)
    const session = await this.readStrictSubmitSession(root)
    if (!session) throw new Error('当前没有等待上传服务器的本地提交。')
    const operation = await this.operationState(root)
    if (operation.operation || operation.conflicts) throw new Error('提交正在等待 Resolve。请解决冲突并点击 Continue Operation。')
    session.attempts = 0
    await this.writeStrictSubmitSession(root, session)
    try {
      return await this.finishStrictSubmit(root, session)
    } catch (error) {
      throw new Error(`本地提交 ${session.commit.slice(0, 10)} 仍未被服务器确认。\n\n${asErrorMessage(error)}`)
    }
  }

  async prepareSubmitMergeRequest(repoPath: string): Promise<SubmitMergeRequestTarget> {
    const root = await this.repositoryRoot(repoPath)
    const session = await this.readStrictSubmitSession(root)
    if (!session) throw new Error('当前没有等待服务器接收的提交。')
    const operation = await this.operationState(root)
    if (operation.operation || operation.conflicts) throw new Error('请先完成 Resolve，才能创建 Merge Request。')
    const safeBranch = session.branch.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/^[-/.]+|[-/.]+$/g, '') || 'submit'
    const sourceBranch = this.safeRef(`p4git/${safeBranch}/${session.commit.slice(0, 10)}`)
    await this.run(root, ['push', session.remote, `HEAD:refs/heads/${sourceBranch}`])
    const head = (await this.run(root, ['rev-parse', 'HEAD'])).trim()
    const advertised = (await this.run(root, ['ls-remote', '--heads', session.remote, `refs/heads/${sourceBranch}`])).trim().split(/\s+/)[0] ?? ''
    if (advertised !== head) throw new Error('备用分支 Push 后未通过服务器哈希验证，未创建 Merge Request。')
    return { commit: head, shortHash: head.slice(0, 10), remote: session.remote, sourceBranch, targetBranch: session.remoteBranch }
  }

  async completeSubmitMergeRequest(repoPath: string): Promise<string | undefined> {
    const root = await this.repositoryRoot(repoPath)
    const session = await this.readStrictSubmitSession(root)
    if (!session) throw new Error('当前没有等待完成的 Merge Request 提交流程。')
    const warning = await this.restoreStrictSubmitWorkspace(root, session)
    const state = await this.readChangelists(root)
    for (const path of session.paths) delete state.assignments[path]
    await Promise.all([this.writeChangelists(root, state), this.removeStrictSubmitSession(root)])
    return warning
  }

  async history(repoPath: string, limit = 100): Promise<CommitInfo[]> {
    const root = await this.repositoryRoot(repoPath)
    if (!await this.hasHead(root)) return []
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500)
    const output = await this.run(root, [
      'log',
      `-${safeLimit}`,
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e'
    ]).catch((error) => {
      if (error instanceof Error && error.message.includes('does not have any commits')) return ''
      throw error
    })
    return this.markLocalOnly(root, parseLog(output))
  }

  async fileHistory(repoPath: string, filePath: string, limit = 100, ref = 'HEAD'): Promise<CommitInfo[]> {
    const root = await this.repositoryRoot(repoPath)
    if (!await this.hasHead(root)) return []
    const safePath = filePath === '.' || !filePath ? '.' : this.safeRelativePath(root, filePath)
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500)
    const formatArgs = [
      `-${safeLimit}`,
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e',
      this.safeRef(ref)
    ]
    const output = safePath === '.'
      ? await this.run(root, ['log', ...formatArgs, '--', safePath])
      : await this.run(root, ['log', '--follow', ...formatArgs, '--', safePath]).catch(() =>
          this.run(root, ['log', ...formatArgs, '--', safePath])
        )
    return this.markLocalOnly(root, parseLog(output))
  }

  async fileRevisionDiff(repoPath: string, filePath: string, ref: string, compareRef?: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const safePath = filePath === '.' || !filePath ? '.' : this.safeRelativePath(root, filePath)
    const safeRef = this.safeRef(ref)
    if (compareRef) {
      return this.run(root, ['diff', '--no-ext-diff', '--no-color', safeRef, this.safeRef(compareRef), '--', safePath])
    }
    return this.run(root, ['show', '--format=', '--no-ext-diff', '--no-color', safeRef, '--', safePath])
  }

  async diffDocument(request: ExternalDiffRequest): Promise<DiffDocument> {
    const root = await this.repositoryRoot(request.repoPath)
    const safePath = this.safeRelativePath(root, request.filePath)
    const leftSafePath = request.leftFilePath ? this.safeRelativePath(root, request.leftFilePath) : safePath
    const rightSafePath = request.rightFilePath ? this.safeRelativePath(root, request.rightFilePath) : safePath
    const [left, right] = await Promise.all([
      this.readDiffSource(root, leftSafePath, request.left),
      this.readDiffSource(root, rightSafePath, request.right)
    ])
    const binary = left.includes(0) || right.includes(0)
    const sizeLimit = 8 * 1024 * 1024
    const tooLarge = left.byteLength > sizeLimit || right.byteLength > sizeLimit
    return {
      filePath: safePath,
      leftTitle: request.leftTitle,
      rightTitle: request.rightTitle,
      left: binary || tooLarge ? '' : left.toString('utf8'),
      right: binary || tooLarge ? '' : right.toString('utf8'),
      binary,
      message: binary
        ? 'Binary file comparison is not available in the built-in text Diff.'
        : tooLarge ? 'The built-in Diff is limited to 8 MB per side. Configure an external Diff tool for this file.' : undefined
    }
  }

  async launchExternalDiff(request: ExternalDiffRequest): Promise<boolean> {
    const configured = await this.settings.get()
    const executable = configured.diffToolPath?.trim()
    if (!executable) return false
    if (!isAbsolute(executable)) throw new Error('外部 Diff 工具路径必须是绝对路径。')
    await access(executable).catch(() => { throw new Error(`找不到外部 Diff 工具：${executable}`) })

    const root = await this.repositoryRoot(request.repoPath)
    const safePath = this.safeRelativePath(root, request.filePath)
    const leftSafePath = request.leftFilePath ? this.safeRelativePath(root, request.leftFilePath) : safePath
    const rightSafePath = request.rightFilePath ? this.safeRelativePath(root, request.rightFilePath) : safePath
    void this.cleanupDiffTemps()
    const temporary = await mkdtemp(join(tmpdir(), 'p4git-diff-'))
    const leftPath = join(temporary, 'left', basename(leftSafePath))
    const rightPath = join(temporary, 'right', basename(rightSafePath))
    await Promise.all([mkdir(dirname(leftPath), { recursive: true }), mkdir(dirname(rightPath), { recursive: true })])
    await Promise.all([
      this.materializeDiffSource(root, leftSafePath, request.left, leftPath),
      this.materializeDiffSource(root, rightSafePath, request.right, rightPath)
    ])

    const args = expandDiffToolArguments(configured.diffToolArguments?.trim() || DEFAULT_DIFF_TOOL_ARGUMENTS, {
      left: leftPath,
      right: rightPath,
      leftTitle: request.leftTitle,
      rightTitle: request.rightTitle
    })
    await new Promise<void>((resolveLaunch, rejectLaunch) => {
      const child = spawn(executable, args, { cwd: root, detached: true, stdio: 'ignore', windowsHide: false })
      child.once('error', (error) => rejectLaunch(new Error(`无法启动外部 Diff 工具：${error.message}`)))
      child.once('spawn', () => {
        child.unref()
        resolveLaunch()
      })
    })
    return true
  }

  async blame(repoPath: string, filePath: string, ref = 'HEAD'): Promise<BlameLine[]> {
    const root = await this.repositoryRoot(repoPath)
    const safePath = this.safeRelativePath(root, filePath)
    const output = await this.run(root, ['blame', '--line-porcelain', this.safeRef(ref), '--', safePath])
    return parseBlame(output)
  }

  async commitFiles(repoPath: string, hash: string): Promise<RevisionFile[]> {
    const root = await this.repositoryRoot(repoPath)
    const safeHash = this.safeRef(hash)
    const output = await this.run(root, [
      'diff-tree',
      '--root',
      '--no-commit-id',
      '--name-status',
      '-r',
      '-z',
      safeHash
    ])
    return parseRevisionFiles(output)
  }

  async commitDetails(repoPath: string, hash: string): Promise<CommitDetails> {
    const root = await this.repositoryRoot(repoPath)
    const safeHash = this.safeRef(hash)
    const output = await this.run(root, [
      'show', '-s', '--date=iso-strict',
      '--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%D%x00%P%x00%B',
      safeHash
    ])
    const [fullHash, shortHash, author, email, date, subject, decoration = '', parents = '', message = ''] = output.split('\0')
    return {
      hash: fullHash,
      shortHash,
      author,
      email,
      date,
      subject,
      refs: decoration.split(',').map((ref) => ref.trim()).filter(Boolean),
      parents: parents.split(/\s+/).filter(Boolean),
      message: message.trim(),
      files: await this.commitFiles(root, fullHash)
    }
  }

  async commitDiff(repoPath: string, hash: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    return this.run(root, ['show', '--format=', '--no-ext-diff', '--no-color', this.safeRef(hash)])
  }

  async graph(repoPath: string, limit = 300): Promise<GraphCommit[]> {
    const root = await this.repositoryRoot(repoPath)
    if (!await this.hasHead(root)) return []
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 2_000)
    const output = await this.run(root, [
      'log', '--all', '--topo-order', `-${safeLimit}`, '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1f%P%x1e'
    ])
    return output.split('\x1e').map((record) => record.trim()).filter(Boolean).map((record) => {
      const [hash, shortHash, author, email, date, subject, decoration = '', parents = ''] = record.split('\x1f')
      return {
        hash, shortHash, author, email, date, subject,
        refs: decoration.split(',').map((ref) => ref.trim()).filter(Boolean),
        parents: parents.split(' ').filter(Boolean)
      }
    })
  }

  async conflicts(repoPath: string): Promise<ConflictFile[]> {
    const root = await this.repositoryRoot(repoPath)
    const paths = (await this.run(root, ['diff', '--name-only', '--diff-filter=U', '-z']))
      .split('\0').filter(Boolean)
    return Promise.all(paths.map(async (filePath) => {
      const safePath = this.safeRelativePath(root, filePath)
      const [base, ours, theirs, result] = await Promise.all([
        ...[1, 2, 3].map((stage) => this.runBuffer(root, ['show', `:${stage}:${safePath}`]).catch(() => Buffer.alloc(0))),
        readFile(join(root, safePath)).catch(() => Buffer.alloc(0))
      ])
      const binary = [base, ours, theirs, result].some((content) => content.includes(0))
      return {
        path: safePath,
        base: binary ? '' : base.toString('utf8'),
        ours: binary ? '' : ours.toString('utf8'),
        theirs: binary ? '' : theirs.toString('utf8'),
        result: binary ? '' : result.toString('utf8'),
        binary
      }
    }))
  }

  async resolveConflict(repoPath: string, filePath: string, resolution: ConflictResolution, content?: string): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const safePath = this.safeRelativePath(root, filePath)
    if (resolution === 'ours' || resolution === 'theirs') {
      await this.run(root, ['checkout', `--${resolution}`, '--', safePath])
    } else if (resolution === 'manual') {
      await writeFile(join(root, safePath), content ?? '', 'utf8')
    } else {
      throw new Error('冲突解决方式无效。')
    }
    await this.run(root, ['add', '--', safePath])
  }

  async launchExternalMerge(repoPath: string, filePath: string): Promise<boolean> {
    const configured = await this.settings.get()
    const executable = configured.mergeToolPath?.trim()
    if (!executable) return false
    if (!isAbsolute(executable)) throw new Error('外部 Merge 工具路径必须是绝对路径。')
    await access(executable).catch(() => { throw new Error(`找不到外部 Merge 工具：${executable}`) })
    const root = await this.repositoryRoot(repoPath)
    const safePath = this.safeRelativePath(root, filePath)
    const temporary = await mkdtemp(join(tmpdir(), 'p4git-merge-'))
    const fileName = basename(safePath)
    const paths = { base: join(temporary, `base-${fileName}`), ours: join(temporary, `ours-${fileName}`), theirs: join(temporary, `theirs-${fileName}`), result: join(root, safePath) }
    await Promise.all([1, 2, 3].map(async (stage, index) => {
      const target = [paths.base, paths.ours, paths.theirs][index]
      await writeFile(target, await this.runBuffer(root, ['show', `:${stage}:${safePath}`]).catch(() => Buffer.alloc(0)))
      await chmod(target, 0o444).catch(() => undefined)
    }))
    const args = expandMergeToolArguments(configured.mergeToolArguments?.trim() || DEFAULT_MERGE_TOOL_ARGUMENTS, paths)
    await new Promise<void>((resolveLaunch, rejectLaunch) => {
      const child = spawn(executable, args, { cwd: root, windowsHide: false, stdio: 'ignore' })
      this.activeProcesses.set(child, root)
      child.once('error', (error) => { this.activeProcesses.delete(child); rejectLaunch(new Error(`无法启动外部 Merge 工具：${error.message}`)) })
      child.once('close', (code) => { this.activeProcesses.delete(child); code === 0 ? resolveLaunch() : rejectLaunch(new Error(`外部 Merge 工具退出，代码 ${code ?? 'unknown'}。`)) })
    })
    await this.run(root, ['add', '--', safePath])
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined)
    return true
  }

  async continueOperation(repoPath: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const gitPath = async (name: string): Promise<boolean> => {
      const target = (await this.run(root, ['rev-parse', '--git-path', name])).trim()
      return stat(isAbsolute(target) ? target : resolve(root, target)).then(() => true).catch(() => false)
    }
    const selective = await this.readSelectiveMergeSession(root)
    if (selective) {
      const conflicts = (await this.run(root, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean)
      if (conflicts.length) throw new Error(`仍有 ${conflicts.length} 个冲突文件没有解决。`)
      await this.run(root, ['cherry-pick', '--quit']).catch(() => undefined)
      const result = await this.applySelectiveMergeSession(root, selective)
      return result.conflicted
        ? `选择性合并在下一个冲突处暂停（${result.applied}/${result.total}）。`
        : `选择性合并完成；${result.paths.length} 个文件已放入 Changelist ${result.changelist.name}。`
    }
    if (await gitPath('rebase-merge') || await gitPath('rebase-apply')) {
      const output = await this.run(root, ['-c', 'core.editor=true', 'rebase', '--continue'])
      const pendingSubmit = await this.readStrictSubmitSession(root)
      if (pendingSubmit && !await gitPath('rebase-merge') && !await gitPath('rebase-apply')) {
        const result = await this.finishStrictSubmit(root, pendingSubmit)
        return `服务器已确认提交 ${result.shortHash} 到 ${result.upstream}。${result.warning ? ` ${result.warning}` : ''}`
      }
      return output
    }
    if (await gitPath('CHERRY_PICK_HEAD')) return this.run(root, ['-c', 'core.editor=true', 'cherry-pick', '--continue'])
    if (await gitPath('REVERT_HEAD')) return this.run(root, ['-c', 'core.editor=true', 'revert', '--continue'])
    if (await gitPath('MERGE_HEAD')) return this.run(root, ['-c', 'core.editor=true', 'merge', '--continue'])
    throw new Error('当前没有可继续的 Merge、Rebase 或 Cherry-pick。')
  }

  async revertCommits(repoPath: string, refs: string[]): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const safeRefs = refs.map((ref) => this.safeRef(ref))
    if (!safeRefs.length) throw new Error('请选择至少一个要撤销的提交。')
    return this.run(root, ['revert', '--no-edit', ...safeRefs])
  }

  async branches(repoPath: string): Promise<BranchInfo[]> {
    const root = await this.repositoryRoot(repoPath)
    const output = await this.run(root, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname:short)%1f%(refname)%1f%(HEAD)%1f%(upstream:short)%1f%(objectname:short)%1f%(subject)',
      'refs/heads',
      'refs/remotes'
    ])
    return parseBranches(output).filter((branch) => !branch.name.endsWith('/HEAD'))
  }

  async listDirectory(repoPath: string, relativePath = ''): Promise<WorkspaceEntry[]> {
    const root = await this.repositoryRoot(repoPath)
    const requested = resolve(root, relativePath || '.')
    const fromRoot = relative(root, requested)
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error('目录不在当前仓库中。')
    }

    const entries = await readdir(requested, { withFileTypes: true })
    const treeish = fromRoot ? `HEAD:${fromRoot.replaceAll('\\', '/')}` : 'HEAD'
    const [committedOutput, stagedOutput, unsyncedOutput, deletedOutput] = await Promise.all([
      this.run(root, ['ls-tree', '-z', treeish]).catch(() => ''),
      this.run(root, ['diff', '--cached', '--name-only', '-z', '--', fromRoot || '.']).catch(() => ''),
      this.run(root, ['diff', '--name-only', '-z', 'HEAD...@{upstream}', '--', fromRoot || '.']).catch(() => ''),
      this.run(root, ['diff', '--name-only', '--diff-filter=D', '-z', 'HEAD', '--', fromRoot || '.']).catch(() => '')
    ])
    const committedNames = new Set(committedOutput
      .split('\0')
      .filter(Boolean)
      .map((line) => line.slice(line.indexOf('\t') + 1)))
    const stagedPaths = stagedOutput.split('\0').filter(Boolean)
    const unsyncedPaths = unsyncedOutput.split('\0').filter(Boolean)
    const diskEntries: WorkspaceEntry[] = entries
      .filter((entry) => entry.name !== '.git' && (entry.isDirectory() || entry.isFile()))
      .map((entry) => ({
        name: entry.name,
        path: join(fromRoot, entry.name).replaceAll('\\', '/'),
        isDirectory: entry.isDirectory(),
        tracked: committedNames.has(entry.name) || (entry.isDirectory()
          ? stagedPaths.some((path) => path.startsWith(`${join(fromRoot, entry.name).replaceAll('\\', '/')}/`))
          : stagedPaths.includes(join(fromRoot, entry.name).replaceAll('\\', '/'))),
        unsynced: entry.isDirectory()
          ? unsyncedPaths.some((path) => path.startsWith(`${join(fromRoot, entry.name).replaceAll('\\', '/')}/`))
          : unsyncedPaths.includes(join(fromRoot, entry.name).replaceAll('\\', '/'))
      }))
    const present = new Set(diskEntries.map((entry) => entry.path))
    const deletedEntries: WorkspaceEntry[] = deletedOutput.split('\0').filter(Boolean).flatMap((path) => {
      const normalizedPath = path.replaceAll('\\', '/')
      const directory = dirname(normalizedPath).replaceAll('\\', '/')
      if ((directory === '.' ? '' : directory) !== fromRoot.replaceAll('\\', '/') || present.has(normalizedPath)) return []
      return [{ name: basename(normalizedPath), path: normalizedPath, isDirectory: false, tracked: true }]
    })
    return [...diskEntries, ...deletedEntries]
      .sort((left, right) => {
        if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })
  }

  async listTree(repoPath: string, ref: string, relativePath = ''): Promise<WorkspaceEntry[]> {
    const root = await this.repositoryRoot(repoPath)
    const safeRef = this.safeRef(ref)
    if (safeRef === 'HEAD' && !await this.hasHead(root)) return []
    const safeDirectory = relativePath
      ? this.safeRelativePath(root, relativePath)
      : ''
    const treeish = safeDirectory ? `${safeRef}:${safeDirectory}` : safeRef
    const output = await this.run(root, ['ls-tree', '-z', treeish])
    return output
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^\d+ (blob|tree) [0-9a-f]+\t([\s\S]+)$/)
        if (!match) throw new Error('无法解析 Git tree。')
        return {
          name: match[2],
          path: join(safeDirectory, match[2]).replaceAll('\\', '/'),
          isDirectory: match[1] === 'tree',
          tracked: true
        }
      })
      .sort((left, right) => {
        if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })
  }

  async workspacePath(repoPath: string, filePath: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    return join(root, this.safeRelativePath(root, filePath))
  }

  async checkout(repoPath: string, branch: string, create = false, startPoint?: string, track = false): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const trimmed = this.safeRef(branch)
    if (create) await this.run(root, ['check-ref-format', `refs/heads/${trimmed}`]).catch(() => { throw new Error(`分支名称无效：${trimmed}`) })
    const args = create ? ['switch', ...(track ? ['--track'] : []), '-c', trimmed] : ['switch', trimmed]
    if (create && startPoint) {
      const source = this.safeRef(startPoint)
      await this.run(root, ['rev-parse', '--verify', `${source}^{commit}`]).catch(() => { throw new Error(`找不到起始分支或提交：${source}`) })
      args.push(source)
    }
    await this.run(root, args)
  }

  async fetch(repoPath: string): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    await this.run(root, ['fetch', '--all', '--prune'])
  }

  async pull(repoPath: string): Promise<PullResult> {
    const root = await this.repositoryRoot(repoPath)
    await this.run(root, ['fetch', '--all', '--prune'])
    const upstream = (await this.run(root, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}'
    ]).catch(() => '')).trim()
    if (!upstream) throw new Error('当前分支没有 upstream。请先 Push 并设置远程跟踪分支。')

    const counts = (await this.run(root, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]))
      .trim()
      .split(/\s+/)
      .map(Number)
    const ahead = counts[0]
    const behind = counts[1]
    if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
      throw new Error('无法判断本地分支与远程分支的同步状态。')
    }
    if (ahead > 0 && behind > 0) return { outcome: 'diverged', upstream, ahead, behind }
    if (behind > 0) {
      await this.run(root, ['merge', '--ff-only', upstream])
      return { outcome: 'fast-forwarded', upstream, ahead, behind }
    }
    return { outcome: ahead > 0 ? 'ahead' : 'up-to-date', upstream, ahead, behind }
  }

  async push(repoPath: string): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const upstream = await this.run(root, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}'
    ]).catch(() => '')
    if (upstream.trim()) {
      await this.run(root, ['push'])
      return
    }
    const branch = (await this.run(root, ['symbolic-ref', '--short', 'HEAD'])).trim()
    await this.run(root, ['push', '--set-upstream', 'origin', branch])
  }

  async remotes(repoPath: string): Promise<RemoteInfo[]> {
    const root = await this.repositoryRoot(repoPath)
    const names = (await this.run(root, ['remote'])).split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    return Promise.all(names.map(async (name) => ({
      name,
      fetchUrl: (await this.run(root, ['remote', 'get-url', name])).trim(),
      pushUrl: (await this.run(root, ['remote', 'get-url', '--push', name]).catch(() => '')).trim()
    })))
  }

  async saveRemote(repoPath: string, previousName: string | undefined, name: string, fetchUrl: string, pushUrl?: string): Promise<RemoteInfo[]> {
    const root = await this.repositoryRoot(repoPath)
    const cleanName = this.safeRemoteName(name)
    const cleanFetch = this.safeRemoteUrl(fetchUrl)
    const cleanPush = pushUrl?.trim() ? this.safeRemoteUrl(pushUrl) : cleanFetch
    if (!previousName) {
      await this.run(root, ['remote', 'add', cleanName, cleanFetch])
    } else {
      const previous = this.safeRemoteName(previousName)
      if (previous !== cleanName) await this.run(root, ['remote', 'rename', previous, cleanName])
      await this.run(root, ['remote', 'set-url', cleanName, cleanFetch])
    }
    await this.run(root, ['remote', 'set-url', '--push', cleanName, cleanPush])
    return this.remotes(root)
  }

  async deleteRemote(repoPath: string, name: string): Promise<RemoteInfo[]> {
    const root = await this.repositoryRoot(repoPath)
    await this.run(root, ['remote', 'remove', this.safeRemoteName(name)])
    return this.remotes(root)
  }

  async pushPreview(request: PushRequest): Promise<PushPreview> {
    const root = await this.repositoryRoot(request.repoPath)
    const remote = this.safeRemoteName(request.remote)
    const localBranch = this.safeRef(request.localBranch)
    const remoteBranch = this.safeRef(request.remoteBranch)
    const remoteUrl = (await this.run(root, ['remote', 'get-url', '--push', remote])).trim()
    const remoteRef = `refs/remotes/${remote}/${remoteBranch}`
    const exists = await this.run(root, ['show-ref', '--verify', '--quiet', remoteRef]).then(() => true).catch(() => false)
    const commits = await this.logRange(root, exists ? `${remote}/${remoteBranch}..${localBranch}` : localBranch, 200)
    return { ...request, repoPath: root, remote, localBranch, remoteBranch, remoteUrl, commits }
  }

  async pushTo(request: PushRequest): Promise<void> {
    const root = await this.repositoryRoot(request.repoPath)
    const remote = this.safeRemoteName(request.remote)
    const localBranch = this.safeRef(request.localBranch)
    const remoteBranch = this.safeRef(request.remoteBranch)
    await this.run(root, ['push', ...(request.setUpstream ? ['--set-upstream'] : []), remote, `${localBranch}:${remoteBranch}`])
  }

  async operationState(repoPath: string): Promise<OperationState> {
    const root = await this.repositoryRoot(repoPath)
    const exists = async (name: string): Promise<boolean> => {
      const target = (await this.run(root, ['rev-parse', '--git-path', name])).trim()
      return stat(isAbsolute(target) ? target : resolve(root, target)).then(() => true).catch(() => false)
    }
    const selective = await this.readSelectiveMergeSession(root)
    let operation: OperationState['operation']
    if (selective) operation = 'cherry-pick'
    else if (await exists('rebase-merge') || await exists('rebase-apply')) operation = 'rebase'
    else if (await exists('CHERRY_PICK_HEAD')) operation = 'cherry-pick'
    else if (await exists('REVERT_HEAD')) operation = 'revert'
    else if (await exists('MERGE_HEAD')) operation = 'merge'
    const pendingSubmit = await this.readStrictSubmitSession(root)
    const conflicts = (await this.run(root, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean).length
    return { operation, conflicts, canContinue: Boolean(operation) && conflicts === 0, canAbort: Boolean(operation), changelistId: selective?.changelistId, submitPending: Boolean(pendingSubmit), submitCommit: pendingSubmit?.commit }
  }

  async cancelOperations(repoPath?: string): Promise<number> {
    const target = repoPath ? normalize(resolve(repoPath)).toLowerCase() : undefined
    const processes = [...this.activeProcesses].filter(([, cwd]) => !target || (cwd && normalize(resolve(cwd)).toLowerCase() === target)).map(([child]) => child)
    for (const child of processes) {
      if (!child.pid) continue
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
      } else {
        child.kill('SIGTERM')
      }
    }
    return processes.length
  }

  async cloneRepository(request: CloneRequest): Promise<string> {
    const parent = resolve(request.parentDirectory)
    if (!isAbsolute(parent)) throw new Error('Clone 目标必须是绝对路径。')
    const url = request.url.trim()
    if (!url || url.startsWith('-') || /[\0\r\n]/.test(url)) throw new Error('仓库 URL 无效。')
    const args = ['clone', '--progress', url]
    if (request.folderName?.trim()) {
      const folder = request.folderName.trim()
      if (folder.includes('/') || folder.includes('\\') || folder === '.' || folder === '..') throw new Error('目标文件夹名称无效。')
      args.push(folder)
    }
    await this.run(parent, args)
    const inferred = request.folderName?.trim() || basename(url.replace(/\/$/, '').replace(/\.git$/, ''))
    const root = resolve(parent, inferred)
    await this.settings.rememberRepository(root)
    return root
  }

  async initRepository(request: InitRequest): Promise<string> {
    const directory = resolve(request.directory)
    const branch = request.initialBranch.trim() || 'main'
    if (!isAbsolute(directory)) throw new Error('Init 目录必须是绝对路径。')
    if (branch.startsWith('-') || /[\0\r\n]/.test(branch)) throw new Error('初始分支名称无效。')
    await mkdir(directory, { recursive: true })
    const gitPath = await this.resolveGitPath()
    await this.runRaw(gitPath, ['init', '-b', branch, directory], directory)
    await this.settings.rememberRepository(directory)
    return directory
  }

  private async strictSubmitTarget(root: string, branch: string): Promise<Pick<StrictSubmitSession, 'remote' | 'remoteBranch' | 'upstream'>> {
    const configuredRemote = (await this.run(root, ['config', '--get', `branch.${branch}.remote`]).catch(() => '')).trim()
    const configuredMerge = (await this.run(root, ['config', '--get', `branch.${branch}.merge`]).catch(() => '')).trim()
    if (configuredRemote && configuredRemote !== '.' && configuredMerge.startsWith('refs/heads/')) {
      const remoteBranch = configuredMerge.slice('refs/heads/'.length)
      return { remote: this.safeRemoteName(configuredRemote), remoteBranch: this.safeRef(remoteBranch), upstream: `${configuredRemote}/${remoteBranch}` }
    }
    const remotes = (await this.run(root, ['remote'])).split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    const remote = remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : ''
    if (!remote) {
      throw new Error(remotes.length
        ? '当前分支没有 upstream，且仓库有多个 Remote。请先在 Push 窗口选择目标并设置 upstream。'
        : '仓库没有 Remote。P4V Submit 必须有可接收提交的服务器。')
    }
    return { remote: this.safeRemoteName(remote), remoteBranch: this.safeRef(branch), upstream: `${remote}/${branch}` }
  }

  private async finishStrictSubmit(root: string, session: StrictSubmitSession): Promise<StrictSubmitResult> {
    const branch = (await this.run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
    if (branch !== session.branch) throw new Error(`等待提交的是分支 ${session.branch}，请切回该分支后重试。`)

    if (!session.stashHash) {
      const dirty = (await this.run(root, ['status', '--porcelain=v2', '-z', '--untracked-files=all'])).length > 0
      if (dirty) {
        await this.run(root, ['stash', 'push', '--include-untracked', '-m', `P4Git strict submit ${session.commit.slice(0, 10)}`])
        session.stashHash = (await this.run(root, ['rev-parse', 'refs/stash'])).trim()
        await this.writeStrictSubmitSession(root, session)
      }
    }

    let attempts = session.attempts
    while (attempts < 3) {
      attempts += 1
      session.attempts = attempts
      await this.writeStrictSubmitSession(root, session)
      await this.run(root, ['fetch', session.remote, '--prune'])
      const remoteRef = `refs/remotes/${session.remote}/${session.remoteBranch}`
      const remoteExists = await this.run(root, ['show-ref', '--verify', '--quiet', remoteRef]).then(() => true).catch(() => false)
      if (remoteExists) {
        const containsRemote = await this.run(root, ['merge-base', '--is-ancestor', remoteRef, 'HEAD']).then(() => true).catch(() => false)
        if (!containsRemote) {
          await this.run(root, ['rebase', remoteRef])
          session.commit = (await this.run(root, ['rev-parse', 'HEAD'])).trim()
          await this.writeStrictSubmitSession(root, session)
        }
      }
      try {
        await this.run(root, ['push', '--set-upstream', session.remote, `HEAD:refs/heads/${session.remoteBranch}`])
      } catch (error) {
        if (attempts < 3 && /non-fast-forward|fetch first|rejected/i.test(asErrorMessage(error))) continue
        throw error
      }
      const head = (await this.run(root, ['rev-parse', 'HEAD'])).trim()
      const advertised = (await this.run(root, ['ls-remote', '--heads', session.remote, `refs/heads/${session.remoteBranch}`])).trim().split(/\s+/)[0] ?? ''
      if (advertised !== head) {
        if (attempts < 3) continue
        throw new Error(`Push 返回后服务器分支仍不是本地提交（local ${head.slice(0, 10)}, remote ${advertised.slice(0, 10) || 'missing'}）。`)
      }

      const warning = await this.restoreStrictSubmitWorkspace(root, session)
      const state = await this.readChangelists(root)
      for (const path of session.paths) delete state.assignments[path]
      await Promise.all([this.writeChangelists(root, state), this.removeStrictSubmitSession(root)])
      return { commit: head, shortHash: head.slice(0, 10), upstream: session.upstream, attempts, warning }
    }
    throw new Error('远端在提交期间持续更新，3 次安全重试仍未成功。没有使用 Force Push。')
  }

  private async markLocalOnly(root: string, commits: CommitInfo[]): Promise<CommitInfo[]> {
    const upstream = (await this.run(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => '')).trim()
    if (!upstream) return commits.map((commit) => ({ ...commit, localOnly: true }))
    const localHashes = new Set((await this.run(root, ['rev-list', 'HEAD', `^${upstream}`]).catch(() => '')).split(/\r?\n/).filter(Boolean))
    return commits.map((commit) => ({ ...commit, localOnly: localHashes.has(commit.hash) }))
  }

  private async restoreStrictSubmitWorkspace(root: string, session: StrictSubmitSession): Promise<string | undefined> {
    if (!session.stashHash) return undefined
    try {
      await this.run(root, ['stash', 'apply', '--index', session.stashHash])
      const stashList = (await this.run(root, ['stash', 'list', '--format=%H%x1f%gd'])).split(/\r?\n/)
      const match = stashList.map((line) => line.split('\x1f')).find(([hash]) => hash === session.stashHash)
      if (match?.[1]) await this.run(root, ['stash', 'drop', match[1]])
      return undefined
    } catch (error) {
      return `服务器已接收提交，但恢复其他本地 Changelist 时发生冲突；保护用 Stash ${session.stashHash.slice(0, 10)} 已保留。${asErrorMessage(error)}`
    }
  }

  private async strictSubmitPath(root: string): Promise<string> {
    const gitPath = (await this.run(root, ['rev-parse', '--git-path', 'p4git/strict-submit.json'])).trim()
    return isAbsolute(gitPath) ? normalize(gitPath) : resolve(root, gitPath)
  }

  private async readStrictSubmitSession(root: string): Promise<StrictSubmitSession | undefined> {
    try {
      const parsed = JSON.parse(await readFile(await this.strictSubmitPath(root), 'utf8')) as Partial<StrictSubmitSession>
      if (parsed.version !== 1 || typeof parsed.branch !== 'string' || typeof parsed.remote !== 'string' ||
          typeof parsed.remoteBranch !== 'string' || typeof parsed.upstream !== 'string' || typeof parsed.commit !== 'string' ||
          !Array.isArray(parsed.paths) || typeof parsed.attempts !== 'number' || typeof parsed.createdAt !== 'string') return undefined
      return parsed as StrictSubmitSession
    } catch {
      return undefined
    }
  }

  private async writeStrictSubmitSession(root: string, session: StrictSubmitSession): Promise<void> {
    const filePath = await this.strictSubmitPath(root)
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(session, null, 2), 'utf8')
    await rename(temporary, filePath)
  }

  private async removeStrictSubmitSession(root: string): Promise<void> {
    await rm(await this.strictSubmitPath(root), { force: true })
  }

  private async repositoryRoot(repoPath: string): Promise<string> {
    if (!repoPath || !isAbsolute(repoPath)) throw new Error('仓库路径必须是绝对路径。')
    const root = (await this.run(resolve(repoPath), ['rev-parse', '--show-toplevel'])).trim()
    return normalize(root)
  }

  private async hasHead(root: string): Promise<boolean> {
    return this.run(root, ['rev-parse', '--verify', 'HEAD']).then(() => true).catch(() => false)
  }

  private safeRelativePath(root: string, filePath: string): string {
    const candidate = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath)
    const result = relative(root, candidate)
    if (!result || result.startsWith('..') || isAbsolute(result)) {
      throw new Error('文件不在当前仓库中。')
    }
    return result.replaceAll('\\', '/')
  }

  private safeRef(ref: string): string {
    const trimmed = ref.trim()
    if (!trimmed || trimmed.length > 1024 || trimmed.startsWith('-') || /[\0\r\n]/.test(trimmed)) {
      throw new Error('Git 引用无效。')
    }
    return trimmed
  }

  private safeRemoteName(name: string): string {
    const value = name.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error('Remote 名称无效。')
    return value
  }

  private safeRemoteUrl(url: string): string {
    const value = url.trim()
    if (!value || value.startsWith('-') || /[\0\r\n]/.test(value)) throw new Error('Remote URL 无效。')
    return value
  }

  private async logRange(root: string, range: string, limit = 100): Promise<CommitInfo[]> {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500)
    const output = await this.run(root, [
      'log', `-${safeLimit}`, '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e',
      this.safeRef(range)
    ])
    return parseLog(output)
  }

  private async orderedCherryPickRefs(root: string, refs: string[]): Promise<string[]> {
    const safeRefs = [...new Set(refs.map((ref) => this.safeRef(ref)))]
    if (!safeRefs.length) throw new Error('请选择至少一个要合并的提交。')
    const commits: Array<{ hash: string; parents: string[] }> = []
    for (const ref of safeRefs) {
      const hash = (await this.run(root, ['rev-parse', '--verify', `${ref}^{commit}`]).catch(() => { throw new Error(`找不到提交：${ref}`) })).trim()
      const contained = await this.run(root, ['merge-base', '--is-ancestor', hash, 'HEAD']).then(() => true).catch(() => false)
      const equivalent = contained ? true : await this.run(root, ['cherry', 'HEAD', hash])
        .then((output) => output.split(/\r?\n/).some((line) => line === `- ${hash}`))
        .catch(() => false)
      if (equivalent) throw new Error(`提交 ${ref.slice(0, 10)} 已经包含在当前分支中，无需再次合并。请刷新 Compare with Current 列表。`)
      const parents = (await this.run(root, ['show', '-s', '--format=%P', hash])).trim().split(/\s+/).filter(Boolean)
      if (parents.length > 1) throw new Error(`提交 ${ref.slice(0, 10)} 是 Merge commit，选择性合并需要指定 mainline，当前版本暂不支持。`)
      commits.push({ hash, parents })
    }
    const selected = new Map(commits.map((commit) => [commit.hash, commit]))
    const ordered: string[] = []
    const visited = new Set<string>()
    const visit = (commit: { hash: string; parents: string[] }): void => {
      if (visited.has(commit.hash)) return
      visited.add(commit.hash)
      for (const parent of commit.parents) {
        const selectedParent = selected.get(parent)
        if (selectedParent) visit(selectedParent)
      }
      ordered.push(commit.hash)
    }
    for (const commit of commits) visit(commit)
    return ordered
  }

  private async applySelectiveMergeSession(root: string, session: SelectiveMergeSession): Promise<SelectiveMergeResult> {
    for (let index = session.nextIndex; index < session.refs.length; index += 1) {
      try {
        await this.run(root, ['cherry-pick', '--no-commit', session.refs[index]])
        session.nextIndex = index + 1
        await this.captureSelectiveMergePaths(root, session)
      } catch (error) {
        const conflicts = (await this.run(root, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean)
        if (!conflicts.length) throw error
        session.nextIndex = index + 1
        const state = await this.captureSelectiveMergePaths(root, session)
        const changelist = state.changelists.find((item) => item.id === session.changelistId)
        if (!changelist) throw new Error('选择性合并的目标 Changelist 已不存在。')
        return {
          state,
          changelist,
          paths: session.paths,
          applied: index,
          total: session.refs.length,
          conflicted: true
        }
      }
    }
    await this.run(root, ['cherry-pick', '--quit']).catch(() => undefined)
    await this.run(root, ['reset'])
    const state = await this.captureSelectiveMergePaths(root, session)
    const changelist = state.changelists.find((item) => item.id === session.changelistId)
    if (!changelist) throw new Error('选择性合并的目标 Changelist 已不存在。')
    await this.removeSelectiveMergeSession(root)
    return {
      state,
      changelist,
      paths: session.paths,
      applied: session.refs.length,
      total: session.refs.length,
      conflicted: false
    }
  }

  private async captureSelectiveMergePaths(root: string, session: SelectiveMergeSession): Promise<ChangelistState> {
    const output = await this.run(root, ['status', '--porcelain=v2', '-z', '--untracked-files=all'])
    const changes = parsePorcelainV2(output)
    const paths = [...new Set(changes.flatMap((change) => change.oldPath ? [change.path, change.oldPath] : [change.path]))]
    session.paths = [...new Set([...session.paths, ...paths])]
    const state = await this.readChangelists(root)
    if (!state.changelists.some((item) => item.id === session.changelistId)) throw new Error('选择性合并的目标 Changelist 已不存在。')
    for (const path of paths) state.assignments[path] = session.changelistId
    await Promise.all([this.writeChangelists(root, state), this.writeSelectiveMergeSession(root, session)])
    return state
  }

  private async rollbackSelectiveMerge(root: string, session: SelectiveMergeSession): Promise<void> {
    await this.run(root, ['cherry-pick', '--abort']).catch(() => undefined)
    await this.run(root, ['reset', '--hard', session.head])
    const state = await this.readChangelists(root)
    state.changelists = state.changelists.filter((item) => item.id !== session.changelistId)
    state.assignments = Object.fromEntries(Object.entries(state.assignments).filter(([, id]) => id !== session.changelistId))
    await this.writeChangelists(root, state)
    await this.removeSelectiveMergeSession(root)
  }

  private async selectiveMergePath(root: string): Promise<string> {
    const gitPath = (await this.run(root, ['rev-parse', '--git-path', 'p4git/selective-merge.json'])).trim()
    return isAbsolute(gitPath) ? normalize(gitPath) : resolve(root, gitPath)
  }

  private async readSelectiveMergeSession(root: string): Promise<SelectiveMergeSession | undefined> {
    try {
      const parsed = JSON.parse(await readFile(await this.selectiveMergePath(root), 'utf8')) as Partial<SelectiveMergeSession>
      if (parsed.version !== 1 || typeof parsed.head !== 'string' || typeof parsed.changelistId !== 'string' ||
          !Array.isArray(parsed.refs) || typeof parsed.nextIndex !== 'number' || !Array.isArray(parsed.paths) || typeof parsed.createdAt !== 'string') return undefined
      return parsed as SelectiveMergeSession
    } catch {
      return undefined
    }
  }

  private async writeSelectiveMergeSession(root: string, session: SelectiveMergeSession): Promise<void> {
    const filePath = await this.selectiveMergePath(root)
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(session, null, 2), 'utf8')
    await rename(temporary, filePath)
  }

  private async removeSelectiveMergeSession(root: string): Promise<void> {
    await rm(await this.selectiveMergePath(root), { force: true })
  }

  private changelistName(name: string): string {
    const clean = name.trim().replace(/[\0\r\n]/g, ' ').slice(0, 120)
    if (!clean) throw new Error('Changelist 名称不能为空。')
    return clean
  }

  private async changelistPath(root: string): Promise<string> {
    const gitPath = (await this.run(root, ['rev-parse', '--git-path', 'p4git/changelists.json'])).trim()
    return isAbsolute(gitPath) ? normalize(gitPath) : resolve(root, gitPath)
  }

  private async readChangelists(root: string): Promise<ChangelistState> {
    const filePath = await this.changelistPath(root)
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<ChangelistState>
      const changelists: LocalChangelist[] = Array.isArray(parsed.changelists)
        ? parsed.changelists.filter((item): item is LocalChangelist => Boolean(
            item && typeof item.id === 'string' && typeof item.name === 'string' &&
            typeof item.description === 'string' && typeof item.createdAt === 'string'
          ))
        : []
      const validIds = new Set(changelists.map((item) => item.id))
      const assignments = Object.fromEntries(Object.entries(parsed.assignments ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && validIds.has(entry[1])
      ))
      const shelves: ShelfInfo[] = Array.isArray(parsed.shelves)
        ? parsed.shelves.filter((item): item is ShelfInfo => Boolean(
            item && typeof item.hash === 'string' && typeof item.name === 'string' &&
            typeof item.description === 'string' && Array.isArray(item.paths) && typeof item.createdAt === 'string'
          ))
        : []
      return { changelists, assignments, shelves }
    } catch {
      return { changelists: [], assignments: {}, shelves: [] }
    }
  }

  private async writeChangelists(root: string, state: ChangelistState): Promise<void> {
    const filePath = await this.changelistPath(root)
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8')
    await rename(temporary, filePath)
  }

  private async materializeDiffSource(root: string, safePath: string, source: ExternalDiffSource, destination: string): Promise<void> {
    const content = await this.readDiffSource(root, safePath, source)
    await writeFile(destination, content)
    await chmod(destination, 0o444).catch(() => undefined)
  }

  private async readDiffSource(root: string, safePath: string, source: ExternalDiffSource): Promise<Buffer> {
    if (source.kind === 'empty') {
      return Buffer.alloc(0)
    } else if (source.kind === 'workspace') {
      return readFile(join(root, safePath)).catch(() => Buffer.alloc(0))
    } else {
      const object = source.kind === 'index'
        ? `:${safePath}`
        : `${this.safeRef(source.ref)}${source.kind === 'parent' ? '^' : ''}:${safePath}`
      return this.runBuffer(root, ['show', object]).catch(() => Buffer.alloc(0))
    }
  }

  private async cleanupDiffTemps(): Promise<void> {
    const root = tmpdir()
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    const cutoff = Date.now() - 24 * 60 * 60 * 1_000
    await Promise.allSettled(entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('p4git-diff-')).map(async (entry) => {
      const target = join(root, entry.name)
      if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true })
    }))
  }

  private async run(cwd: string, args: string[]): Promise<string> {
    const gitPath = await this.resolveGitPath()
    return this.runRaw(gitPath, ['-c', 'core.quotepath=false', ...args], cwd)
  }

  private async runBuffer(cwd: string, args: string[]): Promise<Buffer> {
    const gitPath = await this.resolveGitPath()
    return new Promise<Buffer>((resolveOutput, rejectOutput) => {
      const child = execFile(gitPath, ['-c', 'core.quotepath=false', ...args], {
        cwd,
        encoding: 'buffer',
        windowsHide: true,
        maxBuffer,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      }, (error, stdout, stderr) => {
        this.activeProcesses.delete(child)
        if (!error) {
          resolveOutput(stdout)
          return
        }
        const detail = stderr?.toString().trim() || stdout?.toString().trim() || error.message
        rejectOutput(new Error(detail))
      })
      this.activeProcesses.set(child, cwd)
    })
  }

  private async runRaw(executable: string, args: string[], cwd?: string): Promise<string> {
    return new Promise<string>((resolveOutput, rejectOutput) => {
      const child = spawn(executable, args, {
        cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      this.activeProcesses.set(child, cwd)
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let size = 0
      child.stdout?.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= maxBuffer) stdout.push(chunk) })
      child.stderr?.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= maxBuffer) stderr.push(chunk) })
      child.once('error', (error) => { this.activeProcesses.delete(child); rejectOutput(error) })
      child.once('close', (code, signal) => {
        this.activeProcesses.delete(child)
        const out = Buffer.concat(stdout).toString('utf8')
        const err = Buffer.concat(stderr).toString('utf8')
        if (size > maxBuffer) rejectOutput(new Error('Git 输出超过 16 MB 限制。'))
        else if (code === 0) resolveOutput(out)
        else rejectOutput(new Error((err.trim() || out.trim() || (signal ? `Git operation cancelled (${signal}).` : `Git exited with code ${code}.`))))
      })
    })
  }

  private async resolveGitPath(): Promise<string> {
    if (this.gitPath) return this.gitPath
    const stored = (await this.settings.get()).gitPath
    const candidates = [
      stored,
      'git',
      process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Git', 'cmd', 'git.exe') : undefined,
      process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe')
        : undefined
    ].filter((item): item is string => Boolean(item))

    for (const candidate of candidates) {
      if (candidate === 'git') {
        try {
          await this.runRaw(candidate, ['--version'])
          this.gitPath = candidate
          return candidate
        } catch {
          continue
        }
      }
      if (await canExecute(candidate)) {
        this.gitPath = candidate
        return candidate
      }
    }
    throw new Error('')
  }
}
