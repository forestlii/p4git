import { execFile } from 'node:child_process'
import { access, readFile, readdir } from 'node:fs/promises'
import { basename, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type {
  BranchInfo,
  CommitInfo,
  DiffRequest,
  GitHealth,
  RepositorySummary,
  WorkspaceEntry
} from '../../shared/types'
import { SettingsStore } from '../settings'
import { parseBranches, parseLog, parsePorcelainV2 } from './parsers'

const execFileAsync = promisify(execFile)
const maxBuffer = 16 * 1024 * 1024

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
    return entries
      .filter((entry) => entry.name !== '.git' && (entry.isDirectory() || entry.isFile()))
      .map((entry) => ({
        name: entry.name,
        path: join(fromRoot, entry.name).replaceAll('\\', '/'),
        isDirectory: entry.isDirectory()
      }))
      .sort((left, right) => {
        if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })
  }

  async checkout(repoPath: string, branch: string, create = false): Promise<void> {
    const root = await this.repositoryRoot(repoPath)
    const trimmed = branch.trim()
    if (!trimmed || trimmed.startsWith('-')) throw new Error('分支名称无效。')
    await this.run(root, create ? ['switch', '-c', trimmed] : ['switch', trimmed])
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

  private async run(cwd: string, args: string[]): Promise<string> {
    const gitPath = await this.resolveGitPath()
    return this.runRaw(gitPath, ['-c', 'core.quotepath=false', ...args], cwd)
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
    if (this.gitPath && (await canExecute(this.gitPath))) return this.gitPath
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
