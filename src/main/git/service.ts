import { execFile, spawn } from 'node:child_process'
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
  ChangelistState,
  CommitInfo,
  DiffRequest,
  ExternalDiffRequest,
  ExternalDiffSource,
  GitHealth,
  LocalChangelist,
  RepositorySummary,
  ReflogEntry,
  ResetMode,
  RevisionFile,
  StashEntry,
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

  async abort(repoPath: string, operation: AbortOperation): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    if (!['merge', 'rebase', 'cherry-pick'].includes(operation)) throw new Error('Git 操作类型无效。')
    await this.run(root, [operation, '--abort'])
  }

  async commit(repoPath: string, message: string): Promise<string> {
    const root = await this.repositoryRoot(repoPath)
    const trimmed = message.trim()
    if (!trimmed) throw new Error('提交说明不能为空。')
    return this.run(root, ['commit', '-m', trimmed])
  }

  async history(repoPath: string, limit = 100): Promise<CommitInfo[]> {
    const root = await this.repositoryRoot(repoPath)
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

  async pull(repoPath: string): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    await this.run(root, ['pull', '--ff-only'])
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

  private async repositoryRoot(repoPath: string): Promise<string> {
    if (!repoPath || !isAbsolute(repoPath)) throw new Error('仓库路径必须是绝对路径。')
    const root = (await this.run(resolve(repoPath), ['rev-parse', '--show-toplevel'])).trim()
    return normalize(root)
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
      return { changelists, assignments }
    } catch {
      return { changelists: [], assignments: {} }
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
      execFile(gitPath, ['-c', 'core.quotepath=false', ...args], {
        cwd,
        encoding: 'buffer',
        windowsHide: true,
        maxBuffer,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      }, (error, stdout, stderr) => {
        if (!error) {
          resolveOutput(stdout)
          return
        }
        const detail = stderr?.toString().trim() || stdout?.toString().trim() || error.message
        rejectOutput(new Error(detail))
      })
    })
  }

  private async runRaw(executable: string, args: string[], cwd?: string): Promise<string> {
    try {
      const result = await execFileAsync(executable, args, {
        cwd,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      return result.stdout
    } catch (error) {
      const failure = error as Error & { stderr?: string; stdout?: string }
      const detail = failure.stderr?.trim() || failure.stdout?.trim() || failure.message
      throw new Error(detail)
    }
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
