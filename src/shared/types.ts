export type ChangeKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted'

export interface FileChange {
  path: string
  oldPath?: string
  kind: ChangeKind
  staged: boolean
  unstaged: boolean
  conflicted: boolean
}

export interface RepositorySummary {
  root: string
  name: string
  branch: string
  detached: boolean
  upstream?: string
  ahead: number
  behind: number
  remoteUrl?: string
  changes: FileChange[]
}

export interface CommitInfo {
  hash: string
  shortHash: string
  author: string
  email: string
  date: string
  subject: string
  refs: string[]
}

export interface BranchInfo {
  name: string
  current: boolean
  remote: boolean
  upstream?: string
  hash: string
  subject: string
}

export interface AppSettings {
  gitPath?: string
  recentRepositories: string[]
  lastRepository?: string
}

export interface GitHealth {
  available: boolean
  path?: string
  version?: string
  error?: string
}

export interface DiffRequest {
  repoPath: string
  filePath: string
  staged: boolean
  untracked?: boolean
}

export interface CheckoutRequest {
  repoPath: string
  branch: string
  create?: boolean
}

export interface P4GitApi {
  chooseRepository(): Promise<string | undefined>
  chooseGitExecutable(): Promise<GitHealth | undefined>
  getSettings(): Promise<AppSettings>
  getGitHealth(): Promise<GitHealth>
  openRepository(repoPath: string): Promise<RepositorySummary>
  getStatus(repoPath: string): Promise<RepositorySummary>
  getDiff(request: DiffRequest): Promise<string>
  stage(repoPath: string, paths: string[]): Promise<void>
  unstage(repoPath: string, paths: string[]): Promise<void>
  discard(repoPath: string, paths: string[]): Promise<void>
  commit(repoPath: string, message: string): Promise<string>
  getHistory(repoPath: string, limit?: number): Promise<CommitInfo[]>
  getBranches(repoPath: string): Promise<BranchInfo[]>
  checkout(request: CheckoutRequest): Promise<void>
  fetch(repoPath: string): Promise<void>
  pull(repoPath: string): Promise<void>
  push(repoPath: string): Promise<void>
  revealRepository(repoPath: string): Promise<void>
}
