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

export interface WorkspaceEntry {
  name: string
  path: string
  isDirectory: boolean
  tracked: boolean
}

export interface RevisionFile {
  path: string
  kind: string
}

export interface BlameLine {
  hash: string
  author: string
  date: string
  lineNumber: number
  content: string
}

export interface StashEntry {
  ref: string
  hash: string
  date: string
  subject: string
}

export interface ReflogEntry {
  hash: string
  shortHash: string
  selector: string
  date: string
  subject: string
}

export interface LocalChangelist {
  id: string
  name: string
  description: string
  createdAt: string
}

export interface ChangelistState {
  changelists: LocalChangelist[]
  assignments: Record<string, string>
}

export type ResetMode = 'soft' | 'mixed' | 'hard'
export type AbortOperation = 'merge' | 'rebase' | 'cherry-pick'

export type ContextMenuKind =
  | 'workspace-file'
  | 'workspace-folder'
  | 'depot-file'
  | 'depot-folder'
  | 'pending-file'
  | 'submitted-change'
  | 'branch'
  | 'workspace'
  | 'log'
  | 'changelist'
  | 'history-revision'

export type ContextMenuAction =
  | 'get-latest'
  | 'checkout'
  | 'checkout-open'
  | 'add'
  | 'delete'
  | 'revert'
  | 'diff'
  | 'file-history'
  | 'timelapse'
  | 'show-workspace'
  | 'show-depot'
  | 'show-explorer'
  | 'copy-path'
  | 'submit'
  | 'stage'
  | 'unstage'
  | 'commit-files'
  | 'commit-diff'
  | 'copy-hash'
  | 'switch-branch'
  | 'new-branch'
  | 'open-workspace'
  | 'clear-log'
  | 'git-stage'
  | 'git-unstage'
  | 'git-stash-path'
  | 'git-cherry-pick'
  | 'git-branch-from-commit'
  | 'git-branch-from-ref'
  | 'git-tag'
  | 'git-reset-soft'
  | 'git-reset-mixed'
  | 'git-reset-hard'
  | 'git-merge'
  | 'git-rebase'
  | 'git-delete-branch'
  | 'git-fetch'
  | 'git-pull'
  | 'git-push'
  | 'git-stash'
  | 'git-stashes'
  | 'git-reflog'
  | 'new-changelist'
  | 'new-changelist-with-selection'
  | 'edit-changelist'
  | 'delete-changelist'
  | 'stage-changelist'
  | 'submit-changelist'
  | 'get-revision'
  | 'diff-previous'
  | 'diff-head'
  | 'show-submitted'
  | `move-changelist:${string}`

export interface ContextMenuRequest {
  kind: ContextMenuKind
  tracked?: boolean
  changed?: boolean
  staged?: boolean
  unstaged?: boolean
  untracked?: boolean
  current?: boolean
  remote?: boolean
  changelists?: Array<Pick<LocalChangelist, 'id' | 'name'>>
  currentChangelistId?: string
  empty?: boolean
  multiple?: boolean
}

export type MenuAction =
  | 'open-workspace'
  | 'focus-filter'
  | 'refresh'
  | 'get-latest'
  | 'submit'
  | 'checkout-file'
  | 'add-file'
  | 'delete-file'
  | 'revert'
  | 'diff'
  | 'timelapse'
  | 'revgraph'
  | 'fetch'
  | 'push'
  | 'settings'
  | 'about'
  | 'git-stash'
  | 'git-stash-pop'
  | 'git-stashes'
  | 'git-reflog'
  | 'git-merge'
  | 'git-rebase'
  | 'git-tag'
  | 'git-abort-merge'
  | 'git-abort-rebase'
  | 'git-abort-cherry-pick'
  | 'new-changelist'
  | 'history'

export interface AppSettings {
  gitPath?: string
  diffToolPath?: string
  diffToolArguments?: string
  recentRepositories: string[]
  lastRepository?: string
}

export const DEFAULT_DIFF_TOOL_ARGUMENTS = '/solo /readonly /lefttitle={leftTitle} /righttitle={rightTitle} "{left}" "{right}"'

export type ExternalDiffSource =
  | { kind: 'workspace' }
  | { kind: 'index' }
  | { kind: 'git'; ref: string }
  | { kind: 'parent'; ref: string }
  | { kind: 'empty' }

export interface ExternalDiffRequest {
  repoPath: string
  filePath: string
  left: ExternalDiffSource
  right: ExternalDiffSource
  leftTitle: string
  rightTitle: string
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
  baseRef?: string
}

export interface CheckoutRequest {
  repoPath: string
  branch: string
  create?: boolean
  startPoint?: string
}

export interface P4GitApi {
  chooseRepository(): Promise<string | undefined>
  chooseGitExecutable(): Promise<GitHealth | undefined>
  chooseDiffExecutable(): Promise<string | undefined>
  getSettings(): Promise<AppSettings>
  saveDiffSettings(executable?: string, argumentsTemplate?: string): Promise<AppSettings>
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
  listDirectory(repoPath: string, relativePath?: string): Promise<WorkspaceEntry[]>
  listTree(repoPath: string, ref: string, relativePath?: string): Promise<WorkspaceEntry[]>
  getFileHistory(repoPath: string, filePath: string, limit?: number): Promise<CommitInfo[]>
  getFileRevisionDiff(repoPath: string, filePath: string, ref: string, compareRef?: string): Promise<string>
  launchExternalDiff(request: ExternalDiffRequest): Promise<boolean>
  getBlame(repoPath: string, filePath: string, ref?: string): Promise<BlameLine[]>
  getCommitFiles(repoPath: string, hash: string): Promise<RevisionFile[]>
  getCommitDiff(repoPath: string, hash: string): Promise<string>
  markDelete(repoPath: string, paths: string[]): Promise<void>
  revert(repoPath: string, paths: string[]): Promise<void>
  restoreFromRef(repoPath: string, ref: string, paths: string[]): Promise<void>
  getChangelists(repoPath: string): Promise<ChangelistState>
  createChangelist(repoPath: string, name: string, description?: string): Promise<ChangelistState>
  updateChangelist(repoPath: string, id: string, name: string, description?: string): Promise<ChangelistState>
  deleteChangelist(repoPath: string, id: string): Promise<ChangelistState>
  assignChangelist(repoPath: string, paths: string[], id?: string): Promise<ChangelistState>
  prepareChangelist(repoPath: string, paths: string[]): Promise<void>
  getStashes(repoPath: string): Promise<StashEntry[]>
  stash(repoPath: string, message: string, paths?: string[]): Promise<string>
  applyStash(repoPath: string, ref: string, pop?: boolean): Promise<string>
  dropStash(repoPath: string, ref: string): Promise<string>
  getReflog(repoPath: string, limit?: number): Promise<ReflogEntry[]>
  cherryPick(repoPath: string, ref: string): Promise<string>
  merge(repoPath: string, ref: string): Promise<string>
  rebase(repoPath: string, ref: string): Promise<string>
  createTag(repoPath: string, name: string, ref: string): Promise<void>
  reset(repoPath: string, ref: string, mode: ResetMode): Promise<void>
  deleteBranch(repoPath: string, branch: string): Promise<void>
  abort(repoPath: string, operation: AbortOperation): Promise<void>
  checkout(request: CheckoutRequest): Promise<void>
  fetch(repoPath: string): Promise<void>
  pull(repoPath: string): Promise<void>
  push(repoPath: string): Promise<void>
  revealRepository(repoPath: string): Promise<void>
  revealPath(repoPath: string, filePath: string): Promise<void>
  openFile(repoPath: string, filePath: string): Promise<string | undefined>
  showContextMenu(request: ContextMenuRequest): Promise<ContextMenuAction | undefined>
  onMenuAction(callback: (action: MenuAction) => void): () => void
}
