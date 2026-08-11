import { contextBridge, ipcRenderer } from 'electron'
import type { AbortOperation, CheckoutRequest, ContextMenuRequest, DiffRequest, ExternalDiffRequest, MenuAction, P4GitApi, ResetMode } from '../shared/types'

const api: P4GitApi = {
  chooseRepository: () => ipcRenderer.invoke('dialog:choose-repository'),
  chooseGitExecutable: () => ipcRenderer.invoke('dialog:choose-git'),
  chooseDiffExecutable: () => ipcRenderer.invoke('dialog:choose-diff-tool'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveDiffSettings: (executable?: string, argumentsTemplate?: string) =>
    ipcRenderer.invoke('settings:save-diff-tool', executable, argumentsTemplate),
  getGitHealth: () => ipcRenderer.invoke('git:health'),
  openRepository: (repoPath: string) => ipcRenderer.invoke('git:open', repoPath),
  getStatus: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
  getDiff: (request: DiffRequest) => ipcRenderer.invoke('git:diff', request),
  stage: (repoPath: string, paths: string[]) => ipcRenderer.invoke('git:stage', repoPath, paths),
  unstage: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:unstage', repoPath, paths),
  discard: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:discard', repoPath, paths),
  commit: (repoPath: string, message: string) =>
    ipcRenderer.invoke('git:commit', repoPath, message),
  getHistory: (repoPath: string, limit?: number) =>
    ipcRenderer.invoke('git:history', repoPath, limit),
  getBranches: (repoPath: string) => ipcRenderer.invoke('git:branches', repoPath),
  listDirectory: (repoPath: string, relativePath = '') =>
    ipcRenderer.invoke('git:list-directory', repoPath, relativePath),
  listTree: (repoPath: string, ref: string, relativePath = '') =>
    ipcRenderer.invoke('git:list-tree', repoPath, ref, relativePath),
  getFileHistory: (repoPath: string, filePath: string, limit?: number) =>
    ipcRenderer.invoke('git:file-history', repoPath, filePath, limit),
  getFileRevisionDiff: (repoPath: string, filePath: string, ref: string, compareRef?: string) =>
    ipcRenderer.invoke('git:file-revision-diff', repoPath, filePath, ref, compareRef),
  launchExternalDiff: (request: ExternalDiffRequest) => ipcRenderer.invoke('git:external-diff', request),
  getBlame: (repoPath: string, filePath: string, ref?: string) =>
    ipcRenderer.invoke('git:blame', repoPath, filePath, ref),
  getCommitFiles: (repoPath: string, hash: string) =>
    ipcRenderer.invoke('git:commit-files', repoPath, hash),
  getCommitDiff: (repoPath: string, hash: string) =>
    ipcRenderer.invoke('git:commit-diff', repoPath, hash),
  markDelete: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:mark-delete', repoPath, paths),
  revert: (repoPath: string, paths: string[]) =>
    ipcRenderer.invoke('git:revert', repoPath, paths),
  restoreFromRef: (repoPath: string, ref: string, paths: string[]) =>
    ipcRenderer.invoke('git:restore-from-ref', repoPath, ref, paths),
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
  merge: (repoPath: string, ref: string) => ipcRenderer.invoke('git:merge', repoPath, ref),
  rebase: (repoPath: string, ref: string) => ipcRenderer.invoke('git:rebase', repoPath, ref),
  createTag: (repoPath: string, name: string, ref: string) =>
    ipcRenderer.invoke('git:create-tag', repoPath, name, ref),
  reset: (repoPath: string, ref: string, mode: ResetMode) =>
    ipcRenderer.invoke('git:reset', repoPath, ref, mode),
  deleteBranch: (repoPath: string, branch: string) =>
    ipcRenderer.invoke('git:delete-branch', repoPath, branch),
  abort: (repoPath: string, operation: AbortOperation) =>
    ipcRenderer.invoke('git:abort', repoPath, operation),
  checkout: (request: CheckoutRequest) => ipcRenderer.invoke('git:checkout', request),
  fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
  pull: (repoPath: string) => ipcRenderer.invoke('git:pull', repoPath),
  push: (repoPath: string) => ipcRenderer.invoke('git:push', repoPath),
  revealRepository: (repoPath: string) => ipcRenderer.invoke('shell:reveal-repository', repoPath),
  revealPath: (repoPath: string, filePath: string) =>
    ipcRenderer.invoke('shell:reveal-path', repoPath, filePath),
  openFile: (repoPath: string, filePath: string) =>
    ipcRenderer.invoke('shell:open-file', repoPath, filePath),
  showContextMenu: (request: ContextMenuRequest) =>
    ipcRenderer.invoke('menu:context', request),
  onMenuAction: (callback: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void => callback(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  }
}

contextBridge.exposeInMainWorld('p4git', api)
