import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions, OpenDialogOptions } from 'electron'
import { access } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type {
  AbortOperation,
  CloneRequest,
  ConflictResolution,
  CheckoutRequest,
  ContextMenuAction,
  ContextMenuRequest,
  DiffRequest,
  ExternalDiffRequest,
  MenuAction,
  PullResult,
  PushRequest,
  InitRequest,
  ResetMode
} from '../shared/types'
import { GitService } from './git/service'
import { SettingsStore } from './settings'
import { GitLabService } from './gitlab'

let git: GitService
let settings: SettingsStore
let gitlab: GitLabService

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    autoHideMenuBar: false,
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

function sendMenuAction(action: MenuAction): void {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('menu:action', action)
}

function createApplicationMenu(): void {
  const action = (label: string, id: MenuAction, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => sendMenuAction(id)
  })
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        action('Open Workspace...', 'open-workspace', 'CmdOrCtrl+O'),
        action('Clone Repository...', 'clone'),
        action('Init Repository...', 'init'),
        { type: 'separator' }, { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]
    },
    { label: 'Search', submenu: [action('Filter...', 'focus-filter', 'CmdOrCtrl+F')] },
    { label: 'View', submenu: [action('Refresh', 'refresh', 'F5'), { type: 'separator' }, action('History', 'history')] },
    {
      label: 'Actions',
      submenu: [
        action('Get Latest', 'get-latest', 'CmdOrCtrl+G'),
        action('Submit...', 'submit', 'CmdOrCtrl+Enter'),
        action('New Changelist...', 'new-changelist', 'CmdOrCtrl+N'),
        { type: 'separator' },
        action('Checkout', 'checkout-file', 'CmdOrCtrl+E'),
        action('Add', 'add-file'),
        action('Delete', 'delete-file'),
        action('Revert...', 'revert'),
        { type: 'separator' },
        action('Diff', 'diff', 'CmdOrCtrl+D'),
        action('Time-lapse View', 'timelapse', 'CmdOrCtrl+Shift+T'),
        action('Revision Graph', 'revgraph')
      ]
    },
    {
      label: 'Connection',
      submenu: [action('Fetch', 'fetch'), action('Push', 'push')]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Git',
          submenu: [
            action('Stash Changes...', 'git-stash'),
            action('Pop Latest Stash', 'git-stash-pop'),
            action('View Stashes...', 'git-stashes'),
            action('View Shelves...', 'git-shelves'),
            { type: 'separator' },
            action('View Reflog...', 'git-reflog'),
            action('GitLab...', 'gitlab'),
            action('Resolve Conflicts...', 'resolve-conflicts'),
            action('Manage Remotes...', 'git-remotes'),
            { type: 'separator' },
            action('Merge Branch...', 'git-merge'),
            action('Rebase onto Branch...', 'git-rebase'),
            action('Create Tag...', 'git-tag'),
            action('Amend Last Commit...', 'git-amend'),
            { type: 'separator' },
            {
              label: 'Abort Operation',
              submenu: [
                action('Abort Merge', 'git-abort-merge'),
                action('Abort Rebase', 'git-abort-rebase'),
                action('Abort Cherry-pick', 'git-abort-cherry-pick'),
                action('Abort Revert', 'git-abort-revert')
              ]
            }
          ]
        },
        { type: 'separator' },
        action('Preferences...', 'settings')
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    { label: 'Help', submenu: [action('About P4Git', 'about')] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function contextMenuTemplate(
  request: ContextMenuRequest,
  choose: (action: ContextMenuAction) => void
): MenuItemConstructorOptions[] {
  const item = (label: string, id: ContextMenuAction, enabled = true): MenuItemConstructorOptions => ({
    label,
    enabled,
    click: () => choose(id)
  })
  const separator: MenuItemConstructorOptions = { type: 'separator' }
  const gitMenu = (submenu: MenuItemConstructorOptions[]): MenuItemConstructorOptions => ({
    label: 'Git',
    submenu
  })
  const moveChangelistMenu = (): MenuItemConstructorOptions => ({
    label: 'Move to Changelist',
    submenu: [
      item('Default changelist', 'move-changelist:__default__', Boolean(request.changed) && request.currentChangelistId !== '__default__'),
      ...(request.changelists ?? []).map((changelist) => item(
        changelist.name,
        `move-changelist:${changelist.id}`,
        Boolean(request.changed) && request.currentChangelistId !== changelist.id
      )),
      separator,
      item('New Changelist...', 'new-changelist-with-selection', Boolean(request.changed))
    ]
  })
  switch (request.kind) {
    case 'workspace-file':
      return [
        item('Get Latest Revision', 'get-latest', Boolean(request.tracked)),
        separator,
        item('Checkout', 'checkout', Boolean(request.tracked)),
        item('Checkout and Open', 'checkout-open', Boolean(request.tracked)),
        item('Mark for Add', 'add', Boolean(request.untracked)),
        item('Mark for Delete', 'delete', Boolean(request.tracked)),
        item('Revert...', 'revert', Boolean(request.changed)),
        moveChangelistMenu(),
        separator,
        item('Diff Against Head', 'diff', Boolean(request.tracked || request.changed)),
        item('File History', 'file-history', Boolean(request.tracked) && !request.empty),
        item('Time-lapse View', 'timelapse', Boolean(request.tracked)),
        separator,
        item('Show in Depot Tree', 'show-depot', Boolean(request.tracked)),
        item('Show in Explorer', 'show-explorer'),
        item('Copy Workspace Path', 'copy-path'),
        separator,
        gitMenu([
          item('Stage', 'git-stage', Boolean(request.changed && request.unstaged)),
          item('Unstage', 'git-unstage', Boolean(request.staged)),
          item('Stash This File...', 'git-stash-path', Boolean(request.changed))
        ])
      ]
    case 'workspace-folder':
      return [
        item('Get Latest Revision', 'get-latest', Boolean(request.tracked)),
        item('File History', 'file-history', Boolean(request.tracked)),
        item('Show in Depot Tree', 'show-depot', Boolean(request.tracked)),
        separator,
        item('Show in Explorer', 'show-explorer'),
        item('Copy Workspace Path', 'copy-path'),
        separator,
        gitMenu([item('Stash Changes in This Folder...', 'git-stash-path', Boolean(request.changed))])
      ]
    case 'depot-file':
      return [
        item('Get Latest Revision', 'get-latest'),
        separator,
        item('Checkout', 'checkout'),
        item('Checkout and Open', 'checkout-open'),
        item('Diff Against Workspace', 'diff'),
        item('File History', 'file-history', !request.empty),
        item('Time-lapse View', 'timelapse'),
        separator,
        item('Show in Workspace Tree', 'show-workspace'),
        item('Copy Depot Path', 'copy-path'),
        separator,
        gitMenu([item('New Branch from This Ref...', 'git-branch-from-ref')])
      ]
    case 'depot-folder':
      return [
        item('Get Latest Revision', 'get-latest'),
        item('File History', 'file-history'),
        item('Show in Workspace Tree', 'show-workspace'),
        separator,
        item('Copy Depot Path', 'copy-path'),
        separator,
        gitMenu([item('New Branch from This Ref...', 'git-branch-from-ref')])
      ]
    case 'pending-file':
      return [
        item('Submit Changelist...', 'submit'),
        separator,
        item('Move to Ready to submit', 'stage', request.currentChangelistId !== '__ready__'),
        item('Move to Default changelist', 'unstage', request.currentChangelistId !== '__default__'),
        moveChangelistMenu(),
        item('Revert...', 'revert'),
        separator,
        item('Diff', 'diff'),
        item('File History', 'file-history', !request.untracked),
        item('Time-lapse View', 'timelapse', !request.untracked),
        separator,
        item('Show in Workspace Tree', 'show-workspace'),
        item('Copy Workspace Path', 'copy-path'),
        separator,
        gitMenu([
          item('Stage', 'git-stage', !request.staged),
          item('Unstage', 'git-unstage', Boolean(request.staged)),
          item('Stash This File...', 'git-stash-path')
        ])
      ]
    case 'submitted-change':
      return [
        item('View Files', 'commit-files'),
        item('Diff Against Previous Revision', 'commit-diff'),
        separator,
        item('Copy Commit Hash', 'copy-hash'),
        item('Revert This Commit...', 'revert-commit'),
        separator,
        gitMenu([
          item('Cherry-pick', 'git-cherry-pick'),
          item('New Branch from Commit...', 'git-branch-from-commit'),
          item('Create Tag...', 'git-tag'),
          separator,
          {
            label: 'Reset Current Branch to Here',
            submenu: [
              item('Soft — keep index and files', 'git-reset-soft'),
              item('Mixed — keep files', 'git-reset-mixed'),
              item('Hard — discard files', 'git-reset-hard')
            ]
          }
        ])
      ]
    case 'branch':
      return [
        item('Work in this Stream', 'switch-branch', !request.current && !request.remote),
        item('New Branch from Here...', 'new-branch'),
        separator,
        item('Copy Branch Name', 'copy-path'),
        separator,
        gitMenu([
          item('Merge into Current Branch...', 'git-merge', !request.current),
          item('Rebase Current Branch onto This...', 'git-rebase', !request.current),
          item('Create Tag at Branch...', 'git-tag'),
          item('Compare with Current...', 'git-compare-branch', !request.current),
          item('Rename Local Branch...', 'git-rename-branch', !request.remote),
          item('Delete Local Branch...', 'git-delete-branch', !request.current && !request.remote)
        ])
      ]
    case 'workspace':
      return [
        item('Switch to Workspace', 'open-workspace', !request.current),
        item('Show in Explorer', 'show-explorer'),
        item('Copy Workspace Root', 'copy-path'),
        separator,
        gitMenu([
          item('Fetch', 'git-fetch'),
          item('Get Latest...', 'git-pull'),
          item('Push', 'git-push'),
          separator,
          item('Stash Changes...', 'git-stash'),
          item('View Stashes...', 'git-stashes'),
          item('View Reflog...', 'git-reflog')
        ])
      ]
    case 'log':
      return [item('Clear Log', 'clear-log')]
    case 'changelist': {
      const id = request.currentChangelistId
      const custom = Boolean(id && id !== '__default__' && id !== '__ready__')
      return [
        item('Submit Changelist...', 'submit-changelist', !request.empty),
        item('Move All to Ready to submit', 'stage-changelist', id !== '__ready__' && !request.empty),
        separator,
        item('New Changelist...', 'new-changelist'),
        item('Edit Changelist...', 'edit-changelist', custom),
        item('Shelve Changelist...', 'shelve-changelist', !request.empty && id !== '__ready__'),
        item('Delete Changelist...', 'delete-changelist', custom)
      ]
    }
    case 'history-revision':
      return [
        item('Get This Revision...', 'get-revision'),
        separator,
        item('Diff Against Previous Revision', 'diff-previous'),
        item('Diff Against Head', 'diff-head'),
        separator,
        item('View Submitted Change', 'show-submitted'),
        item('Copy Commit Hash', 'copy-hash')
      ]
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

  ipcMain.handle('dialog:choose-diff-tool', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: '选择外部 Diff 工具',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['exe', 'com'] }]
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  })

  ipcMain.handle('dialog:choose-divergence-strategy', async (event, result: PullResult) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'warning' as const,
      title: 'Remote changes require a decision',
      message: `Current branch and ${result.upstream} have diverged.`,
      detail: `Local has ${result.ahead} commit(s) not on the remote; the remote has ${result.behind} commit(s) not local.\n\nMerge preserves both histories and may create a merge commit. Rebase replays local commits on the remote and rewrites their commit IDs. Uncommitted changes may need to be stashed first.`,
      buttons: ['Merge', 'Rebase', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    }
    const selection = owner
      ? await dialog.showMessageBox(owner, options)
      : await dialog.showMessageBox(options)
    return selection.response === 0 ? 'merge' : selection.response === 1 ? 'rebase' : 'cancel'
  })
  ipcMain.handle('dialog:choose-clone-parent', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = { title: '选择 Clone 的父目录', properties: ['openDirectory', 'createDirectory'] }
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  })
  ipcMain.handle('dialog:choose-init-directory', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = { title: '选择或创建 Git 仓库目录', properties: ['openDirectory', 'createDirectory'] }
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  })

  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:save-diff-tool', async (_event, executable?: string, argumentsTemplate?: string) => {
    const cleanPath = executable?.trim() || undefined
    if (cleanPath && !isAbsolute(cleanPath)) throw new Error('外部 Diff 工具路径必须是绝对路径。')
    if (cleanPath) await access(cleanPath).catch(() => { throw new Error(`找不到外部 Diff 工具：${cleanPath}`) })
    if (cleanPath && !cleanPath.toLowerCase().endsWith('.exe') && !cleanPath.toLowerCase().endsWith('.com')) {
      throw new Error('外部 Diff 工具必须是可执行文件。')
    }
    if (cleanPath && (!argumentsTemplate?.includes('{left}') || !argumentsTemplate.includes('{right}'))) {
      throw new Error('参数模板必须同时包含 {left} 和 {right}。')
    }
    return settings.update({ diffToolPath: cleanPath, diffToolArguments: cleanPath ? argumentsTemplate?.trim() : undefined })
  })
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
  ipcMain.handle('git:commit', (_event, repoPath: string, message: string, amend?: boolean) =>
    git.commit(repoPath, message, amend)
  )
  ipcMain.handle('git:history', (_event, repoPath: string, limit?: number) =>
    git.history(repoPath, limit)
  )
  ipcMain.handle('git:branches', (_event, repoPath: string) => git.branches(repoPath))
  ipcMain.handle('git:list-directory', (_event, repoPath: string, relativePath?: string) =>
    git.listDirectory(repoPath, relativePath)
  )
  ipcMain.handle('git:list-tree', (_event, repoPath: string, ref: string, relativePath?: string) =>
    git.listTree(repoPath, ref, relativePath)
  )
  ipcMain.handle('git:file-history', (_event, repoPath: string, filePath: string, limit?: number) =>
    git.fileHistory(repoPath, filePath, limit)
  )
  ipcMain.handle('git:file-revision-diff', (_event, repoPath: string, filePath: string, ref: string, compareRef?: string) =>
    git.fileRevisionDiff(repoPath, filePath, ref, compareRef)
  )
  ipcMain.handle('git:external-diff', (_event, request: ExternalDiffRequest) => git.launchExternalDiff(request))
  ipcMain.handle('git:blame', (_event, repoPath: string, filePath: string, ref?: string) =>
    git.blame(repoPath, filePath, ref)
  )
  ipcMain.handle('git:commit-files', (_event, repoPath: string, hash: string) =>
    git.commitFiles(repoPath, hash)
  )
  ipcMain.handle('git:commit-diff', (_event, repoPath: string, hash: string) =>
    git.commitDiff(repoPath, hash)
  )
  ipcMain.handle('git:graph', (_event, repoPath: string, limit?: number) => git.graph(repoPath, limit))
  ipcMain.handle('git:conflicts', (_event, repoPath: string) => git.conflicts(repoPath))
  ipcMain.handle('git:resolve-conflict', (_event, repoPath: string, filePath: string, resolution: ConflictResolution, content?: string) =>
    git.resolveConflict(repoPath, filePath, resolution, content)
  )
  ipcMain.handle('git:continue-operation', (_event, repoPath: string) => git.continueOperation(repoPath))
  ipcMain.handle('git:revert-commits', (_event, repoPath: string, refs: string[]) => git.revertCommits(repoPath, refs))
  ipcMain.handle('git:mark-delete', (_event, repoPath: string, paths: string[]) =>
    git.markDelete(repoPath, paths)
  )
  ipcMain.handle('git:revert', (_event, repoPath: string, paths: string[]) =>
    git.revert(repoPath, paths)
  )
  ipcMain.handle('git:restore-from-ref', (_event, repoPath: string, ref: string, paths: string[]) =>
    git.restoreFromRef(repoPath, ref, paths)
  )
  ipcMain.handle('git:changelists', (_event, repoPath: string) => git.changelists(repoPath))
  ipcMain.handle('git:changelist-create', (_event, repoPath: string, name: string, description?: string) =>
    git.createChangelist(repoPath, name, description)
  )
  ipcMain.handle('git:changelist-update', (_event, repoPath: string, id: string, name: string, description?: string) =>
    git.updateChangelist(repoPath, id, name, description)
  )
  ipcMain.handle('git:changelist-delete', (_event, repoPath: string, id: string) =>
    git.deleteChangelist(repoPath, id)
  )
  ipcMain.handle('git:changelist-assign', (_event, repoPath: string, paths: string[], id?: string) =>
    git.assignChangelist(repoPath, paths, id)
  )
  ipcMain.handle('git:changelist-prepare', (_event, repoPath: string, paths: string[]) =>
    git.prepareChangelist(repoPath, paths)
  )
  ipcMain.handle('git:changelist-shelve', (_event, repoPath: string, id: string | undefined, name: string, description: string, paths: string[]) =>
    git.shelveChangelist(repoPath, id, name, description, paths)
  )
  ipcMain.handle('git:changelist-unshelve', (_event, repoPath: string, hash: string) => git.unshelve(repoPath, hash))
  ipcMain.handle('git:stashes', (_event, repoPath: string) => git.stashes(repoPath))
  ipcMain.handle('git:stash', (_event, repoPath: string, message: string, paths?: string[]) =>
    git.stash(repoPath, message, paths)
  )
  ipcMain.handle('git:stash-apply', (_event, repoPath: string, ref: string, pop?: boolean) =>
    git.applyStash(repoPath, ref, pop)
  )
  ipcMain.handle('git:stash-drop', (_event, repoPath: string, ref: string) =>
    git.dropStash(repoPath, ref)
  )
  ipcMain.handle('git:reflog', (_event, repoPath: string, limit?: number) =>
    git.reflog(repoPath, limit)
  )
  ipcMain.handle('git:cherry-pick', (_event, repoPath: string, ref: string) =>
    git.cherryPick(repoPath, ref)
  )
  ipcMain.handle('git:merge', (_event, repoPath: string, ref: string) => git.merge(repoPath, ref))
  ipcMain.handle('git:rebase', (_event, repoPath: string, ref: string) => git.rebase(repoPath, ref))
  ipcMain.handle('git:create-tag', (_event, repoPath: string, name: string, ref: string) =>
    git.createTag(repoPath, name, ref)
  )
  ipcMain.handle('git:reset', (_event, repoPath: string, ref: string, mode: ResetMode) =>
    git.reset(repoPath, ref, mode)
  )
  ipcMain.handle('git:delete-branch', (_event, repoPath: string, branch: string) =>
    git.deleteBranch(repoPath, branch)
  )
  ipcMain.handle('git:rename-branch', (_event, repoPath: string, oldName: string, newName: string) => git.renameBranch(repoPath, oldName, newName))
  ipcMain.handle('git:compare-branch', (_event, repoPath: string, branch: string) => git.compareBranch(repoPath, branch))
  ipcMain.handle('git:abort', (_event, repoPath: string, operation: AbortOperation) =>
    git.abort(repoPath, operation)
  )
  ipcMain.handle('git:checkout', (_event, request: CheckoutRequest) =>
    git.checkout(request.repoPath, request.branch, request.create, request.startPoint)
  )
  ipcMain.handle('git:fetch', (_event, repoPath: string) => git.fetch(repoPath))
  ipcMain.handle('git:pull', (_event, repoPath: string) => git.pull(repoPath))
  ipcMain.handle('git:push', (_event, repoPath: string) => git.push(repoPath))
  ipcMain.handle('git:remotes', (_event, repoPath: string) => git.remotes(repoPath))
  ipcMain.handle('git:remote-save', (_event, repoPath: string, previousName: string | undefined, name: string, fetchUrl: string, pushUrl?: string) => git.saveRemote(repoPath, previousName, name, fetchUrl, pushUrl))
  ipcMain.handle('git:remote-delete', (_event, repoPath: string, name: string) => git.deleteRemote(repoPath, name))
  ipcMain.handle('git:push-preview', (_event, request: PushRequest) => git.pushPreview(request))
  ipcMain.handle('git:push-to', (_event, request: PushRequest) => git.pushTo(request))
  ipcMain.handle('git:operation-state', (_event, repoPath: string) => git.operationState(repoPath))
  ipcMain.handle('git:cancel', () => git.cancelOperations())
  ipcMain.handle('git:clone', (_event, request: CloneRequest) => git.cloneRepository(request))
  ipcMain.handle('git:init', (_event, request: InitRequest) => git.initRepository(request))
  ipcMain.handle('settings:save-navigation', (_event, bookmarks: string[], locationHistory: string[]) =>
    settings.update({ bookmarks: bookmarks.slice(0, 50), locationHistory: locationHistory.slice(0, 20) })
  )
  ipcMain.handle('gitlab:config', async (_event, repoPath: string) => {
    const summary = await git.summary(repoPath)
    return gitlab.config(summary.root, summary.remoteUrl)
  })
  ipcMain.handle('gitlab:save-config', async (_event, repoPath: string, baseUrl: string, projectPath: string, token?: string, clearToken?: boolean) => {
    const summary = await git.summary(repoPath)
    return gitlab.save(summary.root, baseUrl, projectPath, token, clearToken)
  })
  ipcMain.handle('gitlab:overview', async (_event, repoPath: string) => {
    const summary = await git.summary(repoPath)
    return gitlab.overview(summary.root, summary.remoteUrl)
  })
  ipcMain.handle('gitlab:create-mr', async (_event, repoPath: string, title: string, sourceBranch: string, targetBranch: string, description?: string) => {
    const summary = await git.summary(repoPath)
    return gitlab.createMergeRequest(summary.root, summary.remoteUrl, title, sourceBranch, targetBranch, description)
  })
  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('只允许打开 HTTP(S) 地址。')
    return shell.openExternal(url)
  })
  ipcMain.handle('shell:reveal-repository', async (_event, repoPath: string) => {
    const summary = await git.summary(repoPath)
    await shell.openPath(summary.root)
  })
  ipcMain.handle('shell:reveal-path', async (_event, repoPath: string, filePath: string) => {
    shell.showItemInFolder(await git.workspacePath(repoPath, filePath))
  })
  ipcMain.handle('shell:open-file', async (_event, repoPath: string, filePath: string) => {
    const result = await shell.openPath(await git.workspacePath(repoPath, filePath))
    return result || undefined
  })
  ipcMain.handle('menu:context', async (event, request: ContextMenuRequest) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return undefined
    return new Promise<ContextMenuAction | undefined>((resolve) => {
      let selected = false
      const choose = (action: ContextMenuAction): void => {
        selected = true
        resolve(action)
      }
      const menu = Menu.buildFromTemplate(contextMenuTemplate(request, choose))
      menu.popup({ window: owner, callback: () => { if (!selected) resolve(undefined) } })
    })
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('dev.p4git.client')
  settings = new SettingsStore()
  git = new GitService(settings)
  gitlab = new GitLabService()
  registerIpc()
  createApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
