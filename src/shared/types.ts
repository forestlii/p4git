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

export interface ShelfInfo {
  hash: string
  name: string
  description: string
  changelistId?: string
  paths: string[]
  createdAt: string
}

export interface RemoteInfo {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface BranchComparison {
  current: string
  selected: string
  incoming: CommitInfo[]
  outgoing: CommitInfo[]
}

export interface PushRequest {
  repoPath: string
  remote: string
  localBranch: string
  remoteBranch: string
  setUpstream: boolean
}

export interface PushPreview extends PushRequest {
  commits: CommitInfo[]
  remoteUrl: string
}

export interface OperationState {
  operation?: 'merge' | 'rebase' | 'cherry-pick' | 'revert'
  conflicts: number
  canContinue: boolean
  canAbort: boolean
}

export interface ReflogEntry {
  hash: string
  shortHash: string
  selector: string
  date: string
  subject: string
}

export interface GraphCommit extends CommitInfo {
  parents: string[]
}

export interface ConflictFile {
  path: string
  base: string
  ours: string
  theirs: string
  result: string
  binary: boolean
}

export type ConflictResolution = 'ours' | 'theirs' | 'manual'

export interface GitLabConfig {
  baseUrl: string
  projectPath: string
  tokenConfigured: boolean
}

export interface GitLabIssue {
  iid: number
  title: string
  state: string
  webUrl: string
  labels: string[]
  assignees: string[]
}

export interface GitLabMergeRequest {
  iid: number
  title: string
  state: string
  sourceBranch: string
  targetBranch: string
  author: string
  webUrl: string
  draft: boolean
  pipelineStatus?: string
}

export interface GitLabPipeline {
  id: number
  iid: number
  ref: string
  sha: string
  status: string
  webUrl: string
  updatedAt: string
}

export interface GitLabOverview {
  config: GitLabConfig
  issues: GitLabIssue[]
  mergeRequests: GitLabMergeRequest[]
  pipelines: GitLabPipeline[]
}

export interface CloneRequest {
  url: string
  parentDirectory: string
  folderName?: string
}

export interface InitRequest {
  directory: string
  initialBranch: string
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
  shelves: ShelfInfo[]
}

export type ResetMode = 'soft' | 'mixed' | 'hard'
export type AbortOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert'
export type PullOutcome = 'up-to-date' | 'fast-forwarded' | 'ahead' | 'diverged'
export type DivergenceChoice = 'merge' | 'rebase' | 'cancel'

export interface PullResult {
  outcome: PullOutcome
  upstream: string
  ahead: number
  behind: number
}

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
  | 'git-rename-branch'
  | 'git-compare-branch'
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
  | 'shelve-changelist'
  | 'stage-changelist'
  | 'submit-changelist'
  | 'get-revision'
  | 'diff-previous'
  | 'diff-head'
  | 'show-submitted'
  | 'revert-commit'
  | 'lfs-lock'
  | 'lfs-unlock'
  | 'lfs-locks'
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
  | 'git-abort-revert'
  | 'git-remotes'
  | 'git-shelves'
  | 'git-amend'
  | 'gitlab'
  | 'resolve-conflicts'
  | 'clone'
  | 'init'
  | 'new-changelist'
  | 'history'
  | 'lfs-locks'

export interface AppSettings {
  gitPath?: string
  diffToolPath?: string
  diffToolArguments?: string
  recentRepositories: string[]
  lastRepository?: string
  bookmarks?: string[]
  locationHistory?: string[]
  mergeToolPath?: string
  mergeToolArguments?: string
  appearance?: AppearanceSettings
}

export type ColorTheme = 'classic' | 'light' | 'dark'

export interface AppearanceSettings {
  theme: ColorTheme
  density: 'compact' | 'comfortable'
  fontScale: number
  showToolbarLabels: boolean
  workspacePaneWidth: number
  detailPaneHeight: number
  logPaneHeight: number
  tableColumnWidths: Record<string, number[]>
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'classic',
  density: 'compact',
  fontScale: 1,
  showToolbarLabels: true,
  workspacePaneWidth: 292,
  detailPaneHeight: 260,
  logPaneHeight: 140,
  tableColumnWidths: {}
}

export const DEFAULT_DIFF_TOOL_ARGUMENTS = '/solo /readonly /lefttitle={leftTitle} /righttitle={rightTitle} "{left}" "{right}"'
export const DEFAULT_MERGE_TOOL_ARGUMENTS = '"{theirs}" "{ours}" "{base}" "{result}" /lefttitle="Theirs" /righttitle="Ours" /centertitle="Base" /outputtitle="Result"'

export interface RevisionResolution {
  input: string
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  refs: string[]
  files: RevisionFile[]
}

export interface LfsStatus {
  installed: boolean
  repositoryEnabled: boolean
  version?: string
  error?: string
  locks: LfsLock[]
}

export interface LfsLock {
  id: string
  path: string
  owner: string
  lockedAt?: string
  mine: boolean
}

export interface TaskProgress {
  id: string
  label: string
  command: string
  state: 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress?: number
  startedAt: string
  finishedAt?: string
  message?: string
}

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
  chooseDivergenceStrategy(result: PullResult): Promise<DivergenceChoice>
  chooseCloneParent(): Promise<string | undefined>
  chooseInitDirectory(): Promise<string | undefined>
  getSettings(): Promise<AppSettings>
  saveDiffSettings(executable?: string, argumentsTemplate?: string): Promise<AppSettings>
  savePreferences(diffExecutable: string | undefined, diffArguments: string | undefined, mergeExecutable: string | undefined, mergeArguments: string | undefined, appearance: AppearanceSettings): Promise<AppSettings>
  getGitHealth(): Promise<GitHealth>
  openRepository(repoPath: string): Promise<RepositorySummary>
  getStatus(repoPath: string): Promise<RepositorySummary>
  getDiff(request: DiffRequest): Promise<string>
  stage(repoPath: string, paths: string[]): Promise<void>
  unstage(repoPath: string, paths: string[]): Promise<void>
  discard(repoPath: string, paths: string[]): Promise<void>
  commit(repoPath: string, message: string, amend?: boolean): Promise<string>
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
  getGraph(repoPath: string, limit?: number): Promise<GraphCommit[]>
  getConflicts(repoPath: string): Promise<ConflictFile[]>
  resolveConflict(repoPath: string, filePath: string, resolution: ConflictResolution, content?: string): Promise<void>
  launchExternalMerge(repoPath: string, filePath: string): Promise<boolean>
  continueOperation(repoPath: string): Promise<string>
  revertCommits(repoPath: string, refs: string[]): Promise<string>
  markDelete(repoPath: string, paths: string[]): Promise<void>
  revert(repoPath: string, paths: string[]): Promise<void>
  restoreFromRef(repoPath: string, ref: string, paths: string[]): Promise<void>
  resolveRevision(repoPath: string, input: string): Promise<RevisionResolution>
  getLfsStatus(repoPath: string): Promise<LfsStatus>
  lockLfsFiles(repoPath: string, paths: string[]): Promise<LfsStatus>
  unlockLfsFiles(repoPath: string, paths: string[], force?: boolean): Promise<LfsStatus>
  getChangelists(repoPath: string): Promise<ChangelistState>
  createChangelist(repoPath: string, name: string, description?: string): Promise<ChangelistState>
  updateChangelist(repoPath: string, id: string, name: string, description?: string): Promise<ChangelistState>
  deleteChangelist(repoPath: string, id: string): Promise<ChangelistState>
  assignChangelist(repoPath: string, paths: string[], id?: string): Promise<ChangelistState>
  prepareChangelist(repoPath: string, paths: string[]): Promise<void>
  shelveChangelist(repoPath: string, id: string | undefined, name: string, description: string, paths: string[]): Promise<ChangelistState>
  unshelve(repoPath: string, hash: string): Promise<ChangelistState>
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
  renameBranch(repoPath: string, oldName: string, newName: string): Promise<void>
  compareBranch(repoPath: string, branch: string): Promise<BranchComparison>
  abort(repoPath: string, operation: AbortOperation): Promise<void>
  checkout(request: CheckoutRequest): Promise<void>
  fetch(repoPath: string): Promise<void>
  pull(repoPath: string): Promise<PullResult>
  push(repoPath: string): Promise<void>
  getRemotes(repoPath: string): Promise<RemoteInfo[]>
  saveRemote(repoPath: string, previousName: string | undefined, name: string, fetchUrl: string, pushUrl?: string): Promise<RemoteInfo[]>
  deleteRemote(repoPath: string, name: string): Promise<RemoteInfo[]>
  getPushPreview(request: PushRequest): Promise<PushPreview>
  pushTo(request: PushRequest): Promise<void>
  getOperationState(repoPath: string): Promise<OperationState>
  cancelOperations(): Promise<number>
  cloneRepository(request: CloneRequest): Promise<string>
  initRepository(request: InitRequest): Promise<string>
  saveNavigation(bookmarks: string[], locationHistory: string[]): Promise<AppSettings>
  getGitLabConfig(repoPath: string): Promise<GitLabConfig>
  saveGitLabConfig(repoPath: string, baseUrl: string, projectPath: string, token?: string, clearToken?: boolean): Promise<GitLabConfig>
  getGitLabOverview(repoPath: string): Promise<GitLabOverview>
  createGitLabMergeRequest(repoPath: string, title: string, sourceBranch: string, targetBranch: string, description?: string): Promise<GitLabMergeRequest>
  openExternal(url: string): Promise<void>
  revealRepository(repoPath: string): Promise<void>
  revealPath(repoPath: string, filePath: string): Promise<void>
  openFile(repoPath: string, filePath: string): Promise<string | undefined>
  showContextMenu(request: ContextMenuRequest): Promise<ContextMenuAction | undefined>
  onMenuAction(callback: (action: MenuAction) => void): () => void
}
