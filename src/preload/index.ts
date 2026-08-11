import { contextBridge, ipcRenderer } from 'electron'
import type { CheckoutRequest, DiffRequest, MenuAction, P4GitApi } from '../shared/types'

const api: P4GitApi = {
  chooseRepository: () => ipcRenderer.invoke('dialog:choose-repository'),
  chooseGitExecutable: () => ipcRenderer.invoke('dialog:choose-git'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
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
  checkout: (request: CheckoutRequest) => ipcRenderer.invoke('git:checkout', request),
  fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
  pull: (repoPath: string) => ipcRenderer.invoke('git:pull', repoPath),
  push: (repoPath: string) => ipcRenderer.invoke('git:push', repoPath),
  revealRepository: (repoPath: string) => ipcRenderer.invoke('shell:reveal-repository', repoPath),
  onMenuAction: (callback: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void => callback(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  }
}

contextBridge.exposeInMainWorld('p4git', api)
