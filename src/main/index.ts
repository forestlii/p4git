import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import type { CheckoutRequest, DiffRequest } from '../shared/types'
import { GitService } from './git/service'
import { SettingsStore } from './settings'

let git: GitService
let settings: SettingsStore

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f3f5f7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:choose-repository', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: '选择 Git 工作区',
      properties: ['openDirectory']
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  })

  ipcMain.handle('dialog:choose-git', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: '选择 git.exe',
      properties: ['openFile'],
      filters: [{ name: 'Git executable', extensions: ['exe'] }]
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : git.setGitPath(result.filePaths[0])
  })

  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('git:health', () => git.health())
  ipcMain.handle('git:open', (_event, repoPath: string) => git.openRepository(repoPath))
  ipcMain.handle('git:status', (_event, repoPath: string) => git.summary(repoPath))
  ipcMain.handle('git:diff', (_event, request: DiffRequest) => git.diff(request))
  ipcMain.handle('git:stage', (_event, repoPath: string, paths: string[]) =>
    git.stage(repoPath, paths)
  )
  ipcMain.handle('git:unstage', (_event, repoPath: string, paths: string[]) =>
    git.unstage(repoPath, paths)
  )
  ipcMain.handle('git:discard', (_event, repoPath: string, paths: string[]) =>
    git.discard(repoPath, paths)
  )
  ipcMain.handle('git:commit', (_event, repoPath: string, message: string) =>
    git.commit(repoPath, message)
  )
  ipcMain.handle('git:history', (_event, repoPath: string, limit?: number) =>
    git.history(repoPath, limit)
  )
  ipcMain.handle('git:branches', (_event, repoPath: string) => git.branches(repoPath))
  ipcMain.handle('git:checkout', (_event, request: CheckoutRequest) =>
    git.checkout(request.repoPath, request.branch, request.create)
  )
  ipcMain.handle('git:fetch', (_event, repoPath: string) => git.fetch(repoPath))
  ipcMain.handle('git:pull', (_event, repoPath: string) => git.pull(repoPath))
  ipcMain.handle('git:push', (_event, repoPath: string) => git.push(repoPath))
  ipcMain.handle('shell:reveal-repository', async (_event, repoPath: string) => {
    const summary = await git.summary(repoPath)
    await shell.openPath(summary.root)
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('dev.p4git.client')
  settings = new SettingsStore()
  git = new GitService(settings)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
