import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { DEFAULT_DIFF_TOOL_ARGUMENTS } from '../../shared/types'
import type {
  AbortOperation,
  BlameLine,
  BranchInfo,
  BranchComparison,
  ChangelistState,
  CommitInfo,
  DiffRequest,
  ExternalDiffRequest,
  ExternalDiffSource,
  ConflictFile,
  ConflictResolution,
  CloneRequest,
  GraphCommit,
  GitHealth,
  InitRequest,
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

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
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
  private readonly activeProcesses = new Set<ChildProcess>()

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
      return content
        .toString('utf8')
        .split('\n')
        .map((line) => `+${line}`)
        .join('\n')
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
    const [incoming, outgoing] = await Promise.all([
      this.logRange(root, `${current}..${selected}`),
      this.logRange(root, `${selected}..${current}`)
    ])
    return { current, selected, incoming, outgoing }
  }

  async abort(repoPath: string, operation: AbortOperation): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    if (!['merge', 'rebase', 'cherry-pick', 'revert'].includes(operation)) throw new Error('Git 操作类型无效。')
    await this.run(root, [operation, '--abort'])
  }

  async commit(repoPath: string, message: string, amend = false): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const trimmed = message.trim()
    if (!trimmed) throw new Error('提交说明不能为空。')
    return this.run(root, ['commit', ...(amend ? ['--amend'] : []), '-m', trimmed])
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
    return parseLog(output)
  }

  async fileHistory(repoPath: string, filePath: string, limit = 100): Promise<CommitInfo[]> {
    const root = await this.repositoryRoot(repoPath)
    if (!await this.hasHead(root)) return []
    const safePath = filePath === '.' || !filePath ? '.' : this.safeRelativePath(root, filePath)
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500)
    const formatArgs = [
      `-${safeLimit}`,
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e'
    ]
    const output = safePath === '.'
      ? await this.run(root, ['log', ...formatArgs, '--', safePath])
      : await this.run(root, ['log', '--follow', ...formatArgs, '--', safePath]).catch(() =>
          this.run(root, ['log', ...formatArgs, '--', safePath])
        )
    return parseLog(output)
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

  async launchExternalDiff(request: ExternalDiffRequest): Promise<boolean> {
    const configured = await this.settings.get()
    const executable = configured.diffToolPath?.trim()
    if (!executable) return false
    if (!isAbsolute(executable)) throw new Error('外部 Diff 工具路径必须是绝对路径。')
    await access(executable).catch(() => { throw new Error(`找不到外部 Diff 工具：${executable}`) })

    const root = await this.repositoryRoot(request.repoPath)
    const safePath = this.safeRelativePath(root, request.filePath)
    void this.cleanupDiffTemps()
    const temporary = await mkdtemp(join(tmpdir(), 'p4git-diff-'))
    const fileName = basename(safePath)
    const leftPath = join(temporary, 'left', fileName)
    const rightPath = join(temporary, 'right', fileName)
    await Promise.all([mkdir(dirname(leftPath), { recursive: true }), mkdir(dirname(rightPath), { recursive: true })])
    await Promise.all([
      this.materializeDiffSource(root, safePath, request.left, leftPath),
      this.materializeDiffSource(root, safePath, request.right, rightPath)
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
      const [base, ours, theirs] = await Promise.all([1, 2, 3].map((stage) =>
        this.runBuffer(root, ['show', `:${stage}:${safePath}`]).catch(() => Buffer.alloc(0))
      ))
      const binary = [base, ours, theirs].some((content) => content.includes(0))
      return {
        path: safePath,
        base: binary ? '' : base.toString('utf8'),
        ours: binary ? '' : ours.toString('utf8'),
        theirs: binary ? '' : theirs.toString('utf8'),
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

  async continueOperation(repoPath: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const gitPath = async (name: string): Promise<boolean> => {
      const target = (await this.run(root, ['rev-parse', '--git-path', name])).trim()
      return stat(isAbsolute(target) ? target : resolve(root, target)).then(() => true).catch(() => false)
    }
    if (await gitPath('rebase-merge') || await gitPath('rebase-apply')) {
      return this.run(root, ['-c', 'core.editor=true', 'rebase', '--continue'])
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
    const [committedOutput, stagedOutput] = await Promise.all([
      this.run(root, ['ls-tree', '-z', treeish]).catch(() => ''),
      this.run(root, ['diff', '--cached', '--name-only', '-z', '--', fromRoot || '.']).catch(() => '')
    ])
    const committedNames = new Set(committedOutput
      .split('\0')
      .filter(Boolean)
      .map((line) => line.slice(line.indexOf('\t') + 1)))
    const stagedPaths = stagedOutput.split('\0').filter(Boolean)
    return entries
      .filter((entry) => entry.name !== '.git' && (entry.isDirectory() || entry.isFile()))
      .map((entry) => ({
        name: entry.name,
        path: join(fromRoot, entry.name).replaceAll('\\', '/'),
        isDirectory: entry.isDirectory(),
        tracked: committedNames.has(entry.name) || (entry.isDirectory()
          ? stagedPaths.some((path) => path.startsWith(`${join(fromRoot, entry.name).replaceAll('\\', '/')}/`))
          : stagedPaths.includes(join(fromRoot, entry.name).replaceAll('\\', '/')))
      }))
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

  async checkout(repoPath: string, branch: string, create = false, startPoint?: string): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const trimmed = branch.trim()
    if (!trimmed || trimmed.startsWith('-')) throw new Error('分支名称无效。')
    const args = create ? ['switch', '-c', trimmed] : ['switch', trimmed]
    if (create && startPoint) args.push(this.safeRef(startPoint))
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
    let operation: OperationState['operation']
    if (await exists('rebase-merge') || await exists('rebase-apply')) operation = 'rebase'
    else if (await exists('CHERRY_PICK_HEAD')) operation = 'cherry-pick'
    else if (await exists('REVERT_HEAD')) operation = 'revert'
    else if (await exists('MERGE_HEAD')) operation = 'merge'
    const conflicts = (await this.run(root, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean).length
    return { operation, conflicts, canContinue: Boolean(operation) && conflicts === 0, canAbort: Boolean(operation) }
  }

  async cancelOperations(): Promise<number> {
    const processes = [...this.activeProcesses]
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
    let content: Buffer
    if (source.kind === 'empty') {
      content = Buffer.alloc(0)
    } else if (source.kind === 'workspace') {
      content = await readFile(join(root, safePath)).catch(() => Buffer.alloc(0))
    } else {
      const object = source.kind === 'index'
        ? `:${safePath}`
        : `${this.safeRef(source.ref)}${source.kind === 'parent' ? '^' : ''}:${safePath}`
      content = await this.runBuffer(root, ['show', object]).catch(() => Buffer.alloc(0))
    }
    await writeFile(destination, content)
    await chmod(destination, 0o444).catch(() => undefined)
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
      this.activeProcesses.add(child)
    })
  }

  private async runRaw(executable: string, args: string[], cwd?: string): Promise<string> {
    return new Promise<string>((resolveOutput, rejectOutput) => {
      const child = spawn(executable, args, {
        cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      this.activeProcesses.add(child)
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
