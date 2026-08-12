import { contextBridge, ipcRenderer } from 'electron'
import type { AbortOperation, AppearanceSettings, CheckoutRequest, CloneRequest, ConflictResolution, ContextMenuRequest, DiffRequest, ExternalDiffRequest, InitRequest, MenuAction, P4GitApi, PullResult, PushRequest, ResetMode, SelectiveMergeRequest, StrictSubmitRequest, ViewTab } from '../shared/types'

const api: P4GitApi = {
  chooseRepository: () => ipcRenderer.invoke('dialog:choose-repository'),
  openWorkspaceWindow: (repoPath?: string) => ipcRenderer.invoke('window:new-workspace', repoPath),
  chooseGitExecutable: () => ipcRenderer.invoke('dialog:choose-git'),
  chooseDiffExecutable: () => ipcRenderer.invoke('dialog:choose-diff-tool'),
  chooseDivergenceStrategy: (result: PullResult) => ipcRenderer.invoke('dialog:choose-divergence-strategy', result),
  chooseCloneParent: () => ipcRenderer.invoke('dialog:choose-clone-parent'),
  chooseInitDirectory: () => ipcRenderer.invoke('dialog:choose-init-directory'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveDiffSettings: (executable?: string, argumentsTemplate?: string) =>
    ipcRenderer.invoke('settings:save-diff-tool', executable, argumentsTemplate),
  savePreferences: (diffExecutable: string | undefined, diffArguments: string | undefined, mergeExecutable: string | undefined, mergeArguments: string | undefined, appearance: AppearanceSettings) =>
    ipcRenderer.invoke('settings:save-preferences', diffExecutable, diffArguments, mergeExecutable, mergeArguments, appearance),
  getGitHealth: () => ipcRenderer.invoke('git:health'),
  openRepository: (repoPath: string) => ipcRenderer.invoke('git:open', repoPath),
  getStatus: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
  getDiff: (request: DiffRequest) => ipcRenderer.invoke('git:diff', request),
  stage: (repoPath: string, paths: string[]) => ipcRenderer.invoke('git:stage', repoPath, paths),
  unstage: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:unstage', repoPath, paths),
  discard: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:discard', repoPath, paths),
  commit: (repoPath: string, message: string, amend?: boolean) =>
    ipcRenderer.invoke('git:commit', repoPath, message, amend),
  strictSubmit: (request: StrictSubmitRequest) => ipcRenderer.invoke('git:strict-submit', request),
  resumeSubmit: (repoPath: string) => ipcRenderer.invoke('git:resume-submit', repoPath),
  prepareSubmitMergeRequest: (repoPath: string) => ipcRenderer.invoke('git:prepare-submit-mr', repoPath),
  completeSubmitMergeRequest: (repoPath: string) => ipcRenderer.invoke('git:complete-submit-mr', repoPath),
  getHistory: (repoPath: string, limit?: number) =>
    ipcRenderer.invoke('git:history', repoPath, limit),
  getBranches: (repoPath: string) => ipcRenderer.invoke('git:branches', repoPath),
  listDirectory: (repoPath: string, relativePath = '') =>
    ipcRenderer.invoke('git:list-directory', repoPath, relativePath),
  listTree: (repoPath: string, ref: string, relativePath = '') =>
    ipcRenderer.invoke('git:list-tree', repoPath, ref, relativePath),
  getFileHistory: (repoPath: string, filePath: string, limit?: number, ref?: string) =>
    ipcRenderer.invoke('git:file-history', repoPath, filePath, limit, ref),
  getFileRevisionDiff: (repoPath: string, filePath: string, ref: string, compareRef?: string) =>
    ipcRenderer.invoke('git:file-revision-diff', repoPath, filePath, ref, compareRef),
  getDiffDocument: (request: ExternalDiffRequest) => ipcRenderer.invoke('git:diff-document', request),
  launchExternalDiff: (request: ExternalDiffRequest) => ipcRenderer.invoke('git:external-diff', request),
  getBlame: (repoPath: string, filePath: string, ref?: string) =>
    ipcRenderer.invoke('git:blame', repoPath, filePath, ref),
  getCommitFiles: (repoPath: string, hash: string) =>
    ipcRenderer.invoke('git:commit-files', repoPath, hash),
  getCommitDetails: (repoPath: string, hash: string) =>
    ipcRenderer.invoke('git:commit-details', repoPath, hash),
  getCommitDiff: (repoPath: string, hash: string) =>
    ipcRenderer.invoke('git:commit-diff', repoPath, hash),
  getGraph: (repoPath: string, limit?: number) => ipcRenderer.invoke('git:graph', repoPath, limit),
  getConflicts: (repoPath: string) => ipcRenderer.invoke('git:conflicts', repoPath),
  resolveConflict: (repoPath: string, filePath: string, resolution: ConflictResolution, content?: string) =>
    ipcRenderer.invoke('git:resolve-conflict', repoPath, filePath, resolution, content),
  launchExternalMerge: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:external-merge', repoPath, filePath),
  continueOperation: (repoPath: string) => ipcRenderer.invoke('git:continue-operation', repoPath),
  revertCommits: (repoPath: string, refs: string[]) => ipcRenderer.invoke('git:revert-commits', repoPath, refs),
  markDelete: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:mark-delete', repoPath, paths),
  revert: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:revert', repoPath, paths),
  restoreFromRef: (repoPath: string, ref: string, paths: string[]) =>
    ipcRenderer.invoke('git:restore-from-ref', repoPath, ref, paths),
  resolveRevision: (repoPath: string, input: string) => ipcRenderer.invoke('git:resolve-revision', repoPath, input),
  getLfsStatus: (repoPath: string) => ipcRenderer.invoke('git:lfs-status', repoPath),
  lockLfsFiles: (repoPath: string, paths: string[]) => ipcRenderer.invoke('git:lfs-lock', repoPath, paths),
  unlockLfsFiles: (repoPath: string, paths: string[], force?: boolean) => ipcRenderer.invoke('git:lfs-unlock', repoPath, paths, force),
  getChangelists: (repoPath: string) => ipcRenderer.invoke('git:changelists', repoPath),
  createChangelist: (repoPath: string, name: string, description?: string) =>
    ipcRenderer.invoke('git:changelist-create', repoPath, name, description),
  updateChangelist: (repoPath: string, id: string, name: string, description?: string) =>
    ipcRenderer.invoke('git:changelist-update', repoPath, id, name, description),
  deleteChangelist: (repoPath: string, id: string) =>
    ipcRenderer.invoke('git:changelist-delete', repoPath, id),
  assignChangelist: (repoPath: string, paths: string[], id?: string) =>
    ipcRenderer.invoke('git:changelist-assign', repoPath, paths, id),
  prepareChangelist: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:changelist-prepare', repoPath, paths),
  shelveChangelist: (repoPath: string, id: string | undefined, name: string, description: string, paths: string[]) =>
    ipcRenderer.invoke('git:changelist-shelve', repoPath, id, name, description, paths),
  unshelve: (repoPath: string, hash: string) => ipcRenderer.invoke('git:changelist-unshelve', repoPath, hash),
  getStashes: (repoPath: string) => ipcRenderer.invoke('git:stashes', repoPath),
  stash: (repoPath: string, message: string, paths?: string[]) =>
    ipcRenderer.invoke('git:stash', repoPath, message, paths),
  applyStash: (repoPath: string, ref: string, pop?: boolean) =>
    ipcRenderer.invoke('git:stash-apply', repoPath, ref, pop),
  dropStash: (repoPath: string, ref: string) =>
    ipcRenderer.invoke('git:stash-drop', repoPath, ref),
  getReflog: (repoPath: string, limit?: number) =>
    ipcRenderer.invoke('git:reflog', repoPath, limit),
  cherryPick: (repoPath: string, ref: string) =>
    ipcRenderer.invoke('git:cherry-pick', repoPath, ref),
  cherryPickCommits: (repoPath: string, refs: string[]) =>
    ipcRenderer.invoke('git:cherry-pick-commits', repoPath, refs),
  selectiveMergeCommits: (request: SelectiveMergeRequest) =>
    ipcRenderer.invoke('git:selective-merge-commits', request),
  merge: (repoPath: string, ref: string) => ipcRenderer.invoke('git:merge', repoPath, ref),
  rebase: (repoPath: string, ref: string) => ipcRenderer.invoke('git:rebase', repoPath, ref),
  createTag: (repoPath: string, name: string, ref: string) =>
    ipcRenderer.invoke('git:create-tag', repoPath, name, ref),
  reset: (repoPath: string, ref: string, mode: ResetMode) =>
    ipcRenderer.invoke('git:reset', repoPath, ref, mode),
  deleteBranch: (repoPath: string, branch: string) =>
    ipcRenderer.invoke('git:delete-branch', repoPath, branch),
  renameBranch: (repoPath: string, oldName: string, newName: string) => ipcRenderer.invoke('git:rename-branch', repoPath, oldName, newName),
  compareBranch: (repoPath: string, branch: string) => ipcRenderer.invoke('git:compare-branch', repoPath, branch),
  abort: (repoPath: string, operation: AbortOperation) =>
    ipcRenderer.invoke('git:abort', repoPath, operation),
  checkout: (request: CheckoutRequest) => ipcRenderer.invoke('git:checkout', request),
  fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
  pull: (repoPath: string) => ipcRenderer.invoke('git:pull', repoPath),
  push: (repoPath: string) => ipcRenderer.invoke('git:push', repoPath),
  getRemotes: (repoPath: string) => ipcRenderer.invoke('git:remotes', repoPath),
  saveRemote: (repoPath: string, previousName: string | undefined, name: string, fetchUrl: string, pushUrl?: string) => ipcRenderer.invoke('git:remote-save', repoPath, previousName, name, fetchUrl, pushUrl),
  deleteRemote: (repoPath: string, name: string) => ipcRenderer.invoke('git:remote-delete', repoPath, name),
  getPushPreview: (request: PushRequest) => ipcRenderer.invoke('git:push-preview', request),
  pushTo: (request: PushRequest) => ipcRenderer.invoke('git:push-to', request),
  getOperationState: (repoPath: string) => ipcRenderer.invoke('git:operation-state', repoPath),
  cancelOperations: (repoPath?: string) => ipcRenderer.invoke('git:cancel', repoPath),
  cloneRepository: (request: CloneRequest) => ipcRenderer.invoke('git:clone', request),
  initRepository: (request: InitRequest) => ipcRenderer.invoke('git:init', request),
  saveNavigation: (bookmarks: string[], locationHistory: string[]) =>
    ipcRenderer.invoke('settings:save-navigation', bookmarks, locationHistory),
  getGitLabConfig: (repoPath: string) => ipcRenderer.invoke('gitlab:config', repoPath),
  saveGitLabConfig: (repoPath: string, baseUrl: string, projectPath: string, token?: string, clearToken?: boolean) =>
    ipcRenderer.invoke('gitlab:save-config', repoPath, baseUrl, projectPath, token, clearToken),
  getGitLabOverview: (repoPath: string) => ipcRenderer.invoke('gitlab:overview', repoPath),
  createGitLabMergeRequest: (repoPath: string, title: string, sourceBranch: string, targetBranch: string, description?: string) =>
    ipcRenderer.invoke('gitlab:create-mr', repoPath, title, sourceBranch, targetBranch, description),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  revealRepository: (repoPath: string) => ipcRenderer.invoke('shell:reveal-repository', repoPath),
  revealPath: (repoPath: string, filePath: string) =>
    ipcRenderer.invoke('shell:reveal-path', repoPath, filePath),
  openFile: (repoPath: string, filePath: string) =>
    ipcRenderer.invoke('shell:open-file', repoPath, filePath),
  showContextMenu: (request: ContextMenuRequest) =>
    ipcRenderer.invoke('menu:context', request),
  updateViewTabs: (visible: ViewTab[], active: ViewTab) =>
    ipcRenderer.invoke('menu:update-view-tabs', visible, active),
  onMenuAction: (callback: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void => callback(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  }
}

contextBridge.exposeInMainWorld('p4git', api)
