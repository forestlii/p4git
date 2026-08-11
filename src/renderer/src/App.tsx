import {
  AlertTriangle,
  Ban,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Columns3,
  Download,
  File,
  FileDiff,
  FileText,
  Filter,
  Folder,
  FolderGit2,
  GitBranch,
  GitGraph,
  HardDrive,
  LoaderCircle,
  Minus,
  Monitor,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Upload,
  X,
  XCircle
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_DIFF_TOOL_ARGUMENTS } from '../../shared/types'
import type {
  AppSettings,
  BlameLine,
  BranchInfo,
  ChangelistState,
  CommitInfo,
  ContextMenuRequest,
  ExternalDiffRequest,
  FileChange,
  GitHealth,
  MenuAction,
  LocalChangelist,
  ReflogEntry,
  RepositorySummary,
  RevisionFile,
  StashEntry,
  WorkspaceEntry
} from '../../shared/types'

type MainTab = 'files' | 'history' | 'pending' | 'submitted' | 'stream' | 'workspaces'
type DetailTab = 'details' | 'files' | 'jobs' | 'diff'
type TreeMode = 'depot' | 'workspace'

interface PendingSelection {
  change: FileChange
  staged: boolean
  changelistId?: string
}

interface ChangelistEditorState {
  id?: string
  name: string
  description: string
  moveSelections?: PendingSelection[]
}

interface LogEntry {
  id: number
  time: string
  text: string
  kind: 'command' | 'success' | 'error'
}

const tabLabels: Record<MainTab, string> = {
  files: 'Files',
  history: 'History',
  pending: 'Pending',
  submitted: 'Submitted',
  stream: 'Stream Graph',
  workspaces: 'Workspaces'
}

function friendlyError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '')
    .trim()
}

function parts(filePath: string): { name: string; directory: string } {
  const normalized = filePath.replaceAll('\\', '/')
  const index = normalized.lastIndexOf('/')
  return index < 0
    ? { name: normalized, directory: '' }
    : { name: normalized.slice(index + 1), directory: normalized.slice(0, index) }
}

function changeCode(change: FileChange): string {
  if (change.conflicted) return '!'
  switch (change.kind) {
    case 'added': return 'A'
    case 'deleted': return 'D'
    case 'renamed': return 'R'
    case 'copied': return 'C'
    case 'untracked': return '?'
    default: return 'M'
  }
}

function changeLabel(change: FileChange): string {
  switch (change.kind) {
    case 'added': return 'add'
    case 'deleted': return 'delete'
    case 'renamed': return 'move'
    case 'copied': return 'copy'
    case 'untracked': return 'untracked'
    case 'conflicted': return 'conflict'
    default: return 'edit'
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function BrandIcon(): React.JSX.Element {
  return <span className="brand-icon">P4<span>G</span></span>
}

export default function App(): React.JSX.Element {
  const [health, setHealth] = useState<GitHealth>({ available: false })
  const [settings, setSettings] = useState<AppSettings>({ recentRepositories: [] })
  const [repository, setRepository] = useState<RepositorySummary>()
  const [history, setHistory] = useState<CommitInfo[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [entriesByPath, setEntriesByPath] = useState<Record<string, WorkspaceEntry[]>>({})
  const [depotEntriesByPath, setDepotEntriesByPath] = useState<Record<string, WorkspaceEntry[]>>({})
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']))
  const [treeMode, setTreeMode] = useState<TreeMode>('workspace')
  const [depotRef, setDepotRef] = useState('HEAD')
  const [currentDirectory, setCurrentDirectory] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceEntry>()
  const [pendingSelection, setPendingSelection] = useState<PendingSelection>()
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo>()
  const [selectedBranch, setSelectedBranch] = useState<BranchInfo>()
  const [changelistState, setChangelistState] = useState<ChangelistState>({ changelists: [], assignments: {} })
  const [commitFiles, setCommitFiles] = useState<RevisionFile[]>([])
  const [fileHistoryView, setFileHistoryView] = useState<{ path: string; commits: CommitInfo[]; isDirectory: boolean }>()
  const [timelapseView, setTimelapseView] = useState<{ path: string; lines: BlameLine[] }>()
  const [stashesView, setStashesView] = useState<{ repoPath: string; entries: StashEntry[] }>()
  const [reflogView, setReflogView] = useState<{ repoPath: string; entries: ReflogEntry[] }>()
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [diffToolDraft, setDiffToolDraft] = useState({ path: '', argumentsTemplate: DEFAULT_DIFF_TOOL_ARGUMENTS })
  const [mainTab, setMainTab] = useState<MainTab>('submitted')
  const [detailTab, setDetailTab] = useState<DetailTab>('details')
  const [filter, setFilter] = useState('')
  const [diff, setDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitChangelist, setSubmitChangelist] = useState<{ id?: string; name: string; paths: string[]; preparePaths?: string[]; changes: FileChange[] }>()
  const [changelistEditor, setChangelistEditor] = useState<ChangelistEditorState>()
  const [commitMessage, setCommitMessage] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [logCollapsed, setLogCollapsed] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, time: new Date().toLocaleTimeString(), text: 'P4Git started.', kind: 'success' }
  ])
  const [error, setError] = useState<string>()
  const filterRef = useRef<HTMLInputElement>(null)
  const logId = useRef(2)
  const initialized = useRef(false)

  const appendLog = useCallback((text: string, kind: LogEntry['kind'] = 'command') => {
    setLogs((current) => [...current.slice(-199), {
      id: logId.current++,
      time: new Date().toLocaleTimeString(),
      text,
      kind
    }])
  }, [])

  const loadDirectory = useCallback(async (root: string, relativePath: string) => {
    const entries = await window.p4git.listDirectory(root, relativePath)
    setEntriesByPath((current) => ({ ...current, [relativePath]: entries }))
    return entries
  }, [])

  const loadTree = useCallback(async (root: string, ref: string, relativePath: string) => {
    const entries = await window.p4git.listTree(root, ref, relativePath)
    setDepotEntriesByPath((current) => ({ ...current, [relativePath]: entries }))
    return entries
  }, [])

  const loadSupplemental = useCallback(async (root: string) => {
    const [nextHistory, nextBranches] = await Promise.all([
      window.p4git.getHistory(root),
      window.p4git.getBranches(root)
    ])
    setHistory(nextHistory)
    setBranches(nextBranches)
  }, [])

  const loadChangelists = useCallback(async (root: string) => {
    const state = await window.p4git.getChangelists(root)
    setChangelistState(state)
    return state
  }, [])

  const openRepository = useCallback(async (repoPath: string) => {
    setBusy('open')
    setError(undefined)
    try {
      appendLog(`git -C "${repoPath}" status`, 'command')
      const summary = await window.p4git.openRepository(repoPath)
      setRepository(summary)
      setCurrentDirectory('')
      setSelectedEntry(undefined)
      setPendingSelection(undefined)
      setSelectedCommit(undefined)
      setFileHistoryView(undefined)
      setChangelistState({ changelists: [], assignments: {} })
      setEntriesByPath({})
      setDepotEntriesByPath({})
      setExpandedPaths(new Set(['']))
      setTreeMode('workspace')
      const initialDepotRef = summary.upstream ?? 'HEAD'
      setDepotRef(initialDepotRef)
      setMainTab('submitted')
      await Promise.all([
        loadDirectory(summary.root, ''),
        loadTree(summary.root, initialDepotRef, ''),
        loadSupplemental(summary.root),
        loadChangelists(summary.root)
      ])
      setSettings(await window.p4git.getSettings())
      appendLog(`Workspace opened: ${summary.root}`, 'success')
    } catch (reason) {
      const message = friendlyError(reason)
      setError(message)
      appendLog(message, 'error')
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, loadChangelists, loadDirectory, loadSupplemental, loadTree])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    void (async () => {
      const [nextHealth, nextSettings] = await Promise.all([
        window.p4git.getGitHealth(),
        window.p4git.getSettings()
      ])
      setHealth(nextHealth)
      setSettings(nextSettings)
      if (nextHealth.available && nextSettings.lastRepository) {
        await openRepository(nextSettings.lastRepository)
      }
    })()
  }, [openRepository])

  useEffect(() => {
    document.title = repository
      ? `${repository.name}, ${repository.branch} - P4Git`
      : 'P4Git - Git client with a P4V workflow'
  }, [repository])

  const refresh = useCallback(async () => {
    if (!repository) return
    const [summary] = await Promise.all([
      window.p4git.getStatus(repository.root),
      treeMode === 'depot'
        ? loadTree(repository.root, depotRef, currentDirectory)
        : loadDirectory(repository.root, currentDirectory),
      loadSupplemental(repository.root),
      loadChangelists(repository.root)
    ])
    setRepository(summary)
  }, [currentDirectory, depotRef, loadChangelists, loadDirectory, loadSupplemental, loadTree, repository, treeMode])

  const perform = useCallback(async (
    label: string,
    command: string,
    action: () => Promise<unknown>,
    success: string,
    refreshAfter = true
  ) => {
    setBusy(label)
    setError(undefined)
    appendLog(command, 'command')
    try {
      await action()
      if (refreshAfter) await refresh()
      appendLog(success, 'success')
      return true
    } catch (reason) {
      const message = friendlyError(reason)
      if (refreshAfter) await refresh().catch(() => undefined)
      setError(message)
      appendLog(message, 'error')
      return false
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, refresh])

  const performGitAt = useCallback(async (
    repoPath: string,
    label: string,
    command: string,
    action: () => Promise<unknown>,
    success: string
  ) => {
    setBusy(label)
    setError(undefined)
    appendLog(`git -C "${repoPath}" ${command}`, 'command')
    try {
      await action()
      if (repository && repository.root.toLowerCase() === repoPath.toLowerCase()) await refresh()
      appendLog(success, 'success')
      return true
    } catch (reason) {
      const message = friendlyError(reason)
      if (repository && repository.root.toLowerCase() === repoPath.toLowerCase()) await refresh().catch(() => undefined)
      setError(message)
      appendLog(message, 'error')
      return false
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, refresh, repository])

  const staged = useMemo(
    () => repository?.changes.filter((change) => change.staged) ?? [],
    [repository]
  )
  const unstaged = useMemo(
    () => repository?.changes.filter((change) => change.unstaged) ?? [],
    [repository]
  )
  const selectedChange = pendingSelection?.change ?? (
    selectedEntry
      ? repository?.changes.find((change) => change.path === selectedEntry.path)
      : undefined
  )
  const selectedPath = pendingSelection?.change.path ?? selectedEntry?.path

  const launchConfiguredDiff = useCallback(async (request: ExternalDiffRequest) => {
    if (!settings.diffToolPath) return false
    try {
      const launched = await window.p4git.launchExternalDiff(request)
      if (launched) appendLog(`External Diff: ${request.leftTitle} ↔ ${request.rightTitle} — ${request.filePath}`, 'success')
      return launched
    } catch (reason) {
      const message = `${friendlyError(reason)} Falling back to the built-in Diff Summary.`
      setError(message)
      appendLog(message, 'error')
      return false
    }
  }, [appendLog, settings.diffToolPath])

  const showDiff = useCallback(async (change: FileChange, stagedVersion: boolean, changelistId?: string) => {
    if (!repository) return
    setPendingSelection({ change, staged: stagedVersion, changelistId })
    if (!change.conflicted) {
      const launched = await launchConfiguredDiff({
        repoPath: repository.root,
        filePath: change.path,
        left: stagedVersion ? { kind: 'git', ref: 'HEAD' } : change.kind === 'untracked' ? { kind: 'empty' } : change.staged ? { kind: 'index' } : { kind: 'git', ref: 'HEAD' },
        right: stagedVersion ? { kind: 'index' } : { kind: 'workspace' },
        leftTitle: stagedVersion ? 'HEAD' : change.kind === 'untracked' ? 'Empty' : change.staged ? 'Git index' : 'HEAD',
        rightTitle: stagedVersion ? 'Git index' : 'Workspace'
      })
      if (launched) return
    }
    setDetailTab('diff')
    setDiffLoading(true)
    setDiff('')
    try {
      const content = await window.p4git.getDiff({
        repoPath: repository.root,
        filePath: change.path,
        staged: stagedVersion,
        untracked: change.kind === 'untracked'
      })
      setDiff(content || 'No textual differences to display.')
    } catch (reason) {
      const message = friendlyError(reason)
      setDiff(message)
      setError(message)
    } finally {
      setDiffLoading(false)
    }
  }, [launchConfiguredDiff, repository])

  const showPathDiff = useCallback(async (filePath: string, baseRef?: string) => {
    if (!repository) return
    const ref = baseRef ?? 'HEAD'
    if (await launchConfiguredDiff({ repoPath: repository.root, filePath, left: { kind: 'git', ref }, right: { kind: 'workspace' }, leftTitle: ref, rightTitle: 'Workspace' })) return
    setDetailTab('diff')
    setDiffLoading(true)
    setDiff('')
    try {
      const content = await window.p4git.getDiff({
        repoPath: repository.root,
        filePath,
        staged: false,
        baseRef
      })
      setDiff(content || 'The workspace file matches the selected revision.')
    } catch (reason) {
      const message = friendlyError(reason)
      setDiff(message)
      setError(message)
    } finally {
      setDiffLoading(false)
    }
  }, [launchConfiguredDiff, repository])

  const showFileHistory = useCallback(async (filePath: string, isDirectory = false) => {
    if (!repository) return
    setBusy('history')
    try {
      appendLog(`git log --follow -- ${filePath}`)
      const commits = await window.p4git.getFileHistory(repository.root, filePath)
      setFileHistoryView({ path: filePath, commits, isDirectory })
      setPendingSelection(undefined)
      setSelectedCommit(commits[0])
      setDetailTab('details')
      setMainTab('history')
    } catch (reason) {
      const message = friendlyError(reason)
      setError(message)
      appendLog(message, 'error')
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, repository])

  const showSelectedHistory = useCallback(async () => {
    await showFileHistory((selectedPath ?? currentDirectory) || '.', selectedEntry?.isDirectory ?? !selectedPath)
  }, [currentDirectory, selectedEntry?.isDirectory, selectedPath, showFileHistory])

  const showTimelapse = useCallback(async (filePath: string, ref = 'HEAD') => {
    if (!repository) return
    setBusy('timelapse')
    try {
      appendLog(`git blame ${ref} -- ${filePath}`)
      const lines = await window.p4git.getBlame(repository.root, filePath, ref)
      setTimelapseView({ path: filePath, lines })
    } catch (reason) {
      const message = friendlyError(reason)
      setError(message)
      appendLog(message, 'error')
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, repository])

  const chooseRepository = useCallback(async () => {
    const repoPath = await window.p4git.chooseRepository()
    if (repoPath) await openRepository(repoPath)
  }, [openRepository])

  const chooseGit = useCallback(async () => {
    const next = await window.p4git.chooseGitExecutable()
    if (!next) return
    setHealth(next)
    setSettings(await window.p4git.getSettings())
    appendLog(next.available ? `Git configured: ${next.path}` : next.error || 'Git unavailable', next.available ? 'success' : 'error')
  }, [appendLog])

  const openPreferences = useCallback(() => {
    setDiffToolDraft({
      path: settings.diffToolPath ?? '',
      argumentsTemplate: settings.diffToolArguments ?? DEFAULT_DIFF_TOOL_ARGUMENTS
    })
    setPreferencesOpen(true)
  }, [settings.diffToolArguments, settings.diffToolPath])

  const chooseDiffTool = useCallback(async () => {
    const executable = await window.p4git.chooseDiffExecutable()
    if (executable) setDiffToolDraft((current) => ({ ...current, path: executable }))
  }, [])

  const savePreferences = useCallback(async () => {
    setBusy('preferences')
    setError(undefined)
    try {
      const next = await window.p4git.saveDiffSettings(diffToolDraft.path || undefined, diffToolDraft.argumentsTemplate)
      setSettings(next)
      setPreferencesOpen(false)
      appendLog(next.diffToolPath ? `External Diff configured: ${next.diffToolPath}` : 'External Diff disabled; using the built-in Diff Summary.', 'success')
    } catch (reason) {
      setError(friendlyError(reason))
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, diffToolDraft])

  const stageSelected = useCallback(async () => {
    if (!repository || !selectedChange) return
    const paths = selectedChange.oldPath ? [selectedChange.path, selectedChange.oldPath] : [selectedChange.path]
    await perform('stage', `git add -- ${paths.join(' ')}`, () => window.p4git.stage(repository.root, paths), `${selectedChange.path} opened for submit.`)
  }, [perform, repository, selectedChange])

  const checkoutSelected = useCallback(async (openAfter = false, targetPath = selectedPath, sourceMode = treeMode) => {
    if (!repository || !targetPath) return
    if (sourceMode === 'depot') {
      const confirmed = window.confirm(`Get ${targetPath} from ${depotRef} into the workspace${openAfter ? ' and open it for editing' : ''}?`)
      if (!confirmed) return
      await perform('checkout-file', `git restore --source=${depotRef} --worktree -- ${targetPath} && git add -- ${targetPath}`, async () => {
        await window.p4git.restoreFromRef(repository.root, depotRef, [targetPath])
        await window.p4git.stage(repository.root, [targetPath])
      }, `${targetPath} retrieved from ${depotRef} and opened in Ready to submit.`)
    } else {
      const change = repository.changes.find((item) => item.path === targetPath)
      if (change && change.kind !== 'untracked' && change.unstaged) {
        const paths = change.oldPath ? [change.path, change.oldPath] : [change.path]
        await perform('checkout-file', `git add -- ${paths.join(' ')}`, () => window.p4git.stage(repository.root, paths), `${targetPath} opened in Ready to submit.`)
      } else {
        appendLog(`Checkout: Git files do not require a lock; ${targetPath} is ready to edit.`, 'success')
      }
    }
    if (openAfter) {
      const openError = await window.p4git.openFile(repository.root, targetPath)
      if (openError) setError(openError)
      else appendLog(`Opened for editing: ${targetPath}`, 'success')
    }
  }, [appendLog, depotRef, perform, repository, selectedPath, treeMode])

  const deleteSelected = useCallback(async (targetPath = selectedPath) => {
    if (!repository || !targetPath) return
    if (!window.confirm(`Mark ${targetPath} for delete?\n\nThe file will be removed from the workspace and staged for the next submit.`)) return
    await perform('delete', `git rm -- ${targetPath}`, () => window.p4git.markDelete(repository.root, [targetPath]), `${targetPath} marked for delete.`)
    setSelectedEntry(undefined)
    setPendingSelection(undefined)
  }, [perform, repository, selectedPath])

  const stageChange = useCallback(async (change: FileChange) => {
    if (!repository) return
    const paths = change.oldPath ? [change.path, change.oldPath] : [change.path]
    await perform('stage', `git add -- ${paths.join(' ')}`, () => window.p4git.stage(repository.root, paths), `${change.path} moved to Ready to submit.`)
    setPendingSelection(undefined)
  }, [perform, repository])

  const unstageChange = useCallback(async (change: FileChange) => {
    if (!repository) return
    const paths = change.oldPath ? [change.path, change.oldPath] : [change.path]
    await perform('unstage', `git restore --staged -- ${paths.join(' ')}`, () => window.p4git.unstage(repository.root, paths), `${change.path} moved to Default changelist.`)
    setPendingSelection(undefined)
  }, [perform, repository])

  const revertSelected = useCallback(async (targetChange = selectedChange) => {
    if (!repository || !targetChange || (targetChange.kind === 'untracked' && !targetChange.staged)) return
    if (!window.confirm(`Revert all pending changes to ${targetChange.path}?\n\nTracked edits will be restored to HEAD. A file marked for add will remain on disk but leave the submit list. This cannot be undone by P4Git.`)) return
    await perform('revert', `git restore --source=HEAD --staged --worktree -- ${targetChange.path}`, () => window.p4git.revert(repository.root, [targetChange.path]), `${targetChange.path} reverted.`)
    setPendingSelection(undefined)
  }, [perform, repository, selectedChange])

  const showSelectedDiff = useCallback(async () => {
    if (!selectedPath) return
    if (selectedChange) {
      await showDiff(selectedChange, pendingSelection?.staged ?? (selectedChange.staged && !selectedChange.unstaged))
    } else {
      await showPathDiff(selectedPath, treeMode === 'depot' ? depotRef : repository?.upstream ?? 'HEAD')
    }
  }, [depotRef, pendingSelection?.staged, repository?.upstream, selectedChange, selectedPath, showDiff, showPathDiff, treeMode])

  const getLatest = useCallback(async () => {
    if (!repository) return
    await perform('pull', 'git pull --ff-only', () => window.p4git.pull(repository.root), 'Workspace updated to the latest remote revision.')
  }, [perform, repository])

  const push = useCallback(async () => {
    if (!repository) return
    await perform('push', 'git push', () => window.p4git.push(repository.root), 'Local commits pushed.')
  }, [perform, repository])

  const fetchRemote = useCallback(async () => {
    if (!repository) return
    await perform('fetch', 'git fetch --all --prune', () => window.p4git.fetch(repository.root), 'Remote references refreshed.')
  }, [perform, repository])

  const copyText = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value)
    appendLog(`Copied: ${value}`, 'success')
  }, [appendLog])

  const showHistoryDiff = useCallback(async (commit: CommitInfo, compareRef?: string) => {
    if (!repository || !fileHistoryView) return
    setSelectedCommit(commit)
    const launched = !fileHistoryView.isDirectory && await launchConfiguredDiff({
      repoPath: repository.root,
      filePath: fileHistoryView.path,
      left: compareRef ? { kind: 'git', ref: commit.hash } : { kind: 'parent', ref: commit.hash },
      right: compareRef ? { kind: 'git', ref: compareRef } : { kind: 'git', ref: commit.hash },
      leftTitle: compareRef ? commit.shortHash : `${commit.shortHash} previous`,
      rightTitle: compareRef ?? commit.shortHash
    })
    if (launched) {
      setDetailTab('details')
      return
    }
    setDetailTab('diff')
    setDiffLoading(true)
    setDiff('')
    try {
      appendLog(`git ${compareRef ? `diff ${commit.shortHash} ${compareRef}` : `show ${commit.shortHash}`} -- ${fileHistoryView.path}`)
      const content = await window.p4git.getFileRevisionDiff(repository.root, fileHistoryView.path, commit.hash, compareRef)
      setDiff(content || 'No textual differences to display for this revision.')
    } catch (reason) {
      const message = friendlyError(reason)
      setDiff(message)
      setError(message)
    } finally {
      setDiffLoading(false)
    }
  }, [appendLog, fileHistoryView, launchConfiguredDiff, repository])

  const handleHistoryContext = useCallback(async (commit: CommitInfo) => {
    if (!repository || !fileHistoryView) return
    setSelectedCommit(commit)
    const action = await window.p4git.showContextMenu({ kind: 'history-revision' })
    if (action === 'get-revision') {
      const label = fileHistoryView.path === '.' ? 'the repository tree' : fileHistoryView.path
      if (window.confirm(`Replace the workspace copy of ${label} with revision ${commit.shortHash}?\n\nUncommitted content in the selected path can be overwritten.`)) {
        await perform('get-revision', `git restore --source=${commit.hash} --worktree -- ${fileHistoryView.path}`, () => window.p4git.restoreFromRef(repository.root, commit.hash, [fileHistoryView.path]), `${label} restored from ${commit.shortHash}.`)
      }
    } else if (action === 'diff-previous') {
      await showHistoryDiff(commit)
    } else if (action === 'diff-head') {
      await showHistoryDiff(commit, 'HEAD')
    } else if (action === 'show-submitted') {
      setMainTab('submitted')
      setDetailTab('details')
    } else if (action === 'copy-hash') {
      await copyText(commit.hash)
    }
  }, [copyText, fileHistoryView, perform, repository, showHistoryDiff])

  const openNewChangelist = useCallback((moveSelections?: PendingSelection[]) => {
    setChangelistEditor({ name: '', description: '', moveSelections })
  }, [])

  const saveChangelist = useCallback(async () => {
    if (!repository || !changelistEditor?.name.trim()) return
    let next: ChangelistState | undefined
    const editing = Boolean(changelistEditor.id)
    const moving = changelistEditor.moveSelections ?? []
    const success = await performGitAt(repository.root, editing ? 'edit-changelist' : 'new-changelist', editing ? `p4git changelist edit "${changelistEditor.name.trim()}"` : `p4git changelist new "${changelistEditor.name.trim()}"${moving.length ? `; move ${moving.length} selected file${moving.length === 1 ? '' : 's'}` : ''}`, async () => {
      if (changelistEditor.id) {
        next = await window.p4git.updateChangelist(repository.root, changelistEditor.id, changelistEditor.name, changelistEditor.description)
        return
      }
      const previousIds = new Set(changelistState.changelists.map((item) => item.id))
      next = await window.p4git.createChangelist(repository.root, changelistEditor.name, changelistEditor.description)
      const created = next.changelists.find((item) => !previousIds.has(item.id))
      if (!created || moving.length === 0) return
      const stagedPaths = [...new Set(moving.filter((selection) => selection.staged).flatMap(({ change }) => change.oldPath ? [change.path, change.oldPath] : [change.path]))]
      if (stagedPaths.length) await window.p4git.unstage(repository.root, stagedPaths)
      const selectedPaths = [...new Set(moving.map(({ change }) => change.path))]
      next = await window.p4git.assignChangelist(repository.root, selectedPaths, created.id)
    }, `${editing ? 'Updated' : 'Created'} changelist ${changelistEditor.name.trim()}${moving.length ? ` and moved ${moving.length} selected file${moving.length === 1 ? '' : 's'}` : ''}.`)
    if (success) {
      if (next) setChangelistState(next)
      setChangelistEditor(undefined)
      setMainTab('pending')
    }
  }, [changelistEditor, changelistState.changelists, performGitAt, repository])

  const deleteLocalChangelist = useCallback(async (changelist: LocalChangelist) => {
    if (!repository || !window.confirm(`Delete local changelist "${changelist.name}"?\n\nIts files will move to Default changelist. No file content will be deleted.`)) return
    let next: ChangelistState | undefined
    const success = await performGitAt(repository.root, 'delete-changelist', `p4git changelist delete ${changelist.id}`, async () => {
      next = await window.p4git.deleteChangelist(repository.root, changelist.id)
    }, `Deleted changelist ${changelist.name}; its files moved to Default changelist.`)
    if (success && next) setChangelistState(next)
  }, [performGitAt, repository])

  const moveChangesToChangelist = useCallback(async (selections: PendingSelection[], targetId?: string) => {
    if (!repository || selections.length === 0) return
    const uniqueSelections = [...new Map(selections.map((selection) => [`${selection.staged ? 'ready' : 'local'}:${selection.change.path}`, selection])).values()]
    const selectedPaths = [...new Set(uniqueSelections.map(({ change }) => change.path))]
    const stagedPaths = [...new Set(uniqueSelections.filter((selection) => selection.staged).flatMap(({ change }) => change.oldPath ? [change.path, change.oldPath] : [change.path]))]
    let next: ChangelistState | undefined
    const targetName = targetId
      ? changelistState.changelists.find((item) => item.id === targetId)?.name ?? 'Changelist'
      : 'Default changelist'
    const success = await performGitAt(repository.root, 'move-changelist', `${stagedPaths.length ? `restore --staged -- ${stagedPaths.join(' ')} && ` : ''}p4git changelist move ${selectedPaths.length} file${selectedPaths.length === 1 ? '' : 's'}`, async () => {
      if (stagedPaths.length) await window.p4git.unstage(repository.root, stagedPaths)
      next = await window.p4git.assignChangelist(repository.root, selectedPaths, targetId)
    }, `Moved ${selectedPaths.length} file${selectedPaths.length === 1 ? '' : 's'} to ${targetName}.`)
    if (success && next) {
      setChangelistState(next)
      const first = uniqueSelections[0].change
      setPendingSelection({ change: { ...first, staged: false }, staged: false, changelistId: targetId })
    }
  }, [changelistState.changelists, performGitAt, repository])

  const moveChangesToReady = useCallback(async (selections: PendingSelection[]) => {
    if (!repository || selections.length === 0) return
    const changes = [...new Map(selections.map((selection) => [selection.change.path, selection.change])).values()]
    const paths = [...new Set(changes.flatMap((change) => change.oldPath ? [change.path, change.oldPath] : [change.path]))]
    const success = await performGitAt(repository.root, 'stage', `add -- ${paths.join(' ')}`, () => window.p4git.stage(repository.root, paths), `${changes.length} file${changes.length === 1 ? '' : 's'} moved to Ready to submit.`)
    if (success) {
      const first = changes[0]
      setPendingSelection({ change: { ...first, staged: true }, staged: true, changelistId: changelistState.assignments[first.path] })
    }
  }, [changelistState.assignments, performGitAt, repository])

  const openSubmitForChangelist = useCallback(async (id: string, name: string) => {
    if (!repository) return
    const validIds = new Set(changelistState.changelists.map((item) => item.id))
    const targetChanges = id === '__ready__'
      ? repository.changes.filter((change) => change.staged)
      : repository.changes.filter((change) => change.unstaged && (id === '__default__'
          ? !validIds.has(changelistState.assignments[change.path])
          : changelistState.assignments[change.path] === id))
    if (targetChanges.length === 0) {
      setError(`${name} has no files to submit.`)
      return
    }
    const targetPaths = [...new Set(targetChanges.flatMap((change) => change.oldPath ? [change.path, change.oldPath] : [change.path]))]
    const description = changelistState.changelists.find((item) => item.id === id)?.description
    if (!commitMessage.trim() && description) setCommitMessage(description)
    setSubmitChangelist({
      id: id === '__default__' || id === '__ready__' ? undefined : id,
      name,
      paths: targetChanges.map((change) => change.path),
      preparePaths: id === '__ready__' ? undefined : targetPaths,
      changes: targetChanges
    })
    setSubmitOpen(true)
    setMainTab('pending')
  }, [changelistState.assignments, changelistState.changelists, commitMessage, repository])

  const stashChanges = useCallback(async (repoPath = repository?.root, paths?: string[]) => {
    if (!repoPath) return
    const message = window.prompt('Stash description:', `P4Git ${new Date().toLocaleString()}`)?.trim()
    if (message === undefined) return
    await performGitAt(repoPath, 'git-stash', `stash push --include-untracked -m "${message}"${paths?.length ? ` -- ${paths.join(' ')}` : ''}`, () => window.p4git.stash(repoPath, message, paths), 'Git changes stashed.')
  }, [performGitAt, repository?.root])

  const showStashes = useCallback(async (repoPath = repository?.root) => {
    if (!repoPath) return
    setBusy('git-stashes')
    try {
      setStashesView({ repoPath, entries: await window.p4git.getStashes(repoPath) })
    } catch (reason) {
      setError(friendlyError(reason))
    } finally {
      setBusy(undefined)
    }
  }, [repository?.root])

  const showReflog = useCallback(async (repoPath = repository?.root) => {
    if (!repoPath) return
    setBusy('git-reflog')
    try {
      setReflogView({ repoPath, entries: await window.p4git.getReflog(repoPath) })
    } catch (reason) {
      setError(friendlyError(reason))
    } finally {
      setBusy(undefined)
    }
  }, [repository?.root])

  const applyStashEntry = useCallback(async (entry: StashEntry, pop: boolean) => {
    if (!stashesView || !window.confirm(`${pop ? 'Pop' : 'Apply'} ${entry.ref}?\n\nExisting workspace changes can cause conflicts.`)) return
    await performGitAt(stashesView.repoPath, pop ? 'git-stash-pop' : 'git-stash-apply', `stash ${pop ? 'pop' : 'apply'} ${entry.ref}`, () => window.p4git.applyStash(stashesView.repoPath, entry.ref, pop), `${pop ? 'Popped' : 'Applied'} ${entry.ref}.`)
    setStashesView({ repoPath: stashesView.repoPath, entries: await window.p4git.getStashes(stashesView.repoPath) })
  }, [performGitAt, stashesView])

  const dropStashEntry = useCallback(async (entry: StashEntry) => {
    if (!stashesView || window.prompt(`Dropping ${entry.ref} cannot be undone.\n\nType DROP to continue:`, '') !== 'DROP') return
    await performGitAt(stashesView.repoPath, 'git-stash-drop', `stash drop ${entry.ref}`, () => window.p4git.dropStash(stashesView.repoPath, entry.ref), `Dropped ${entry.ref}.`)
    setStashesView({ repoPath: stashesView.repoPath, entries: await window.p4git.getStashes(stashesView.repoPath) })
  }, [performGitAt, stashesView])

  const mergeRef = useCallback(async (ref?: string, repoPath = repository?.root) => {
    if (!repoPath) return
    const target = (ref ?? window.prompt('Merge which branch or ref into the current branch?', '') ?? '').trim()
    if (!target || !window.confirm(`Merge ${target} into the current branch?\n\nIf conflicts occur, use Tools > Git > Abort Operation or resolve them before continuing.`)) return
    await performGitAt(repoPath, 'git-merge', `merge --no-edit ${target}`, () => window.p4git.merge(repoPath, target), `Merged ${target} into the current branch.`)
  }, [performGitAt, repository?.root])

  const rebaseOnto = useCallback(async (ref?: string, repoPath = repository?.root) => {
    if (!repoPath) return
    const target = (ref ?? window.prompt('Rebase the current branch onto which branch or ref?', '') ?? '').trim()
    if (!target || !window.confirm(`Rebase the current branch onto ${target}?\n\nThis rewrites local commit history. If conflicts occur, use Tools > Git > Abort Operation or resolve them before continuing.`)) return
    await performGitAt(repoPath, 'git-rebase', `rebase ${target}`, () => window.p4git.rebase(repoPath, target), `Rebased the current branch onto ${target}.`)
  }, [performGitAt, repository?.root])

  const createTagAt = useCallback(async (ref = 'HEAD', repoPath = repository?.root) => {
    if (!repoPath) return
    const name = window.prompt(`Create a lightweight Git tag at ${ref}:`, '')?.trim()
    if (!name) return
    await performGitAt(repoPath, 'git-tag', `tag ${name} ${ref}`, () => window.p4git.createTag(repoPath, name, ref), `Created tag ${name} at ${ref}.`)
  }, [performGitAt, repository?.root])

  const createBranchFromRef = useCallback(async (ref: string) => {
    if (!repository) return
    const name = window.prompt(`New branch from ${ref}:`, '')?.trim()
    if (!name) return
    await perform('branch', `git switch -c ${name} ${ref}`, () => window.p4git.checkout({ repoPath: repository.root, branch: name, create: true, startPoint: ref }), `Created ${name} from ${ref}.`)
  }, [perform, repository])

  const abortGitOperation = useCallback(async (operation: 'merge' | 'rebase' | 'cherry-pick') => {
    if (!repository || !window.confirm(`Abort the current Git ${operation} operation?`)) return
    await performGitAt(repository.root, `git-abort-${operation}`, `${operation} --abort`, () => window.p4git.abort(repository.root, operation), `Aborted Git ${operation}.`)
  }, [performGitAt, repository])

  const focusPath = useCallback(async (entry: WorkspaceEntry, mode: TreeMode) => {
    if (!repository) return
    const directory = entry.isDirectory ? entry.path : parts(entry.path).directory
    const segments = directory.split('/').filter(Boolean)
    const ancestors = ['']
    for (let index = 0; index < segments.length; index += 1) {
      ancestors.push(segments.slice(0, index + 1).join('/'))
    }
    setTreeMode(mode)
    setExpandedPaths(new Set(ancestors))
    setCurrentDirectory(directory)
    const rows = mode === 'depot'
      ? await loadTree(repository.root, depotRef, directory)
      : await loadDirectory(repository.root, directory)
    setSelectedEntry(rows.find((row) => row.path === entry.path) ?? entry)
    setMainTab('files')
  }, [depotRef, loadDirectory, loadTree, repository])

  const getEntryRevision = useCallback(async (entry: WorkspaceEntry, source: TreeMode) => {
    if (!repository) return
    const ref = source === 'depot' ? depotRef : repository.upstream ?? 'HEAD'
    if (!window.confirm(`Replace the workspace copy of ${entry.path} with ${ref}?\n\nUncommitted content in the selected path can be overwritten.`)) return
    await perform('get-revision', `git restore --source=${ref} --worktree -- ${entry.path}`, () => window.p4git.restoreFromRef(repository.root, ref, [entry.path]), `${entry.path} updated from ${ref}.`)
  }, [depotRef, perform, repository])

  const handleEntryContext = useCallback(async (entry: WorkspaceEntry, source: TreeMode) => {
    if (!repository) return
    setSelectedEntry(entry)
    const change = repository.changes.find((item) => item.path === entry.path)
    const relatedChanges = entry.isDirectory
      ? repository.changes.filter((item) => !entry.path || item.path.startsWith(`${entry.path}/`))
      : change ? [change] : []
    setPendingSelection(change ? { change, staged: change.staged && !change.unstaged, changelistId: change.unstaged ? changelistState.assignments[change.path] : undefined } : undefined)
    const request: ContextMenuRequest = {
      kind: `${source}-${entry.isDirectory ? 'folder' : 'file'}` as ContextMenuRequest['kind'],
      tracked: entry.tracked,
      changed: relatedChanges.length > 0,
      staged: relatedChanges.some((item) => item.staged),
      unstaged: relatedChanges.some((item) => item.unstaged),
      untracked: change?.kind === 'untracked',
      empty: !entry.path,
      changelists: changelistState.changelists.map(({ id, name }) => ({ id, name })),
      currentChangelistId: change?.staged && !change.unstaged ? '__ready__' : change ? changelistState.assignments[change.path] ?? '__default__' : undefined
    }
    const action = await window.p4git.showContextMenu(request)
    if (!action) return
    if (action.startsWith('move-changelist:') && change) {
      const target = action.slice('move-changelist:'.length)
      await moveChangesToChangelist([{ change, staged: Boolean(change.staged), changelistId: changelistState.assignments[change.path] }], target === '__default__' ? undefined : target)
      return
    }
    if (action === 'new-changelist-with-selection' && change) {
      openNewChangelist([{ change, staged: Boolean(change.staged), changelistId: changelistState.assignments[change.path] }])
      return
    }
    if (!entry.path) {
      if (action === 'get-latest') {
        if (source === 'workspace') await getLatest()
        else if (window.confirm(`Replace the workspace tree with ${depotRef}?\n\nUncommitted tracked content can be overwritten.`)) {
          await perform('get-revision', `git restore --source=${depotRef} --worktree -- .`, () => window.p4git.restoreFromRef(repository.root, depotRef, ['.']), `Workspace tree updated from ${depotRef}.`)
        }
      } else if (action === 'show-workspace') {
        await focusPath(entry, 'workspace')
      } else if (action === 'show-depot') {
        await focusPath(entry, 'depot')
      } else if (action === 'show-explorer') {
        await window.p4git.revealRepository(repository.root)
      } else if (action === 'copy-path') {
        await copyText(source === 'depot' ? `${depotRef}:/` : repository.root)
      } else if (action === 'git-stash-path') {
        await stashChanges(repository.root)
      } else if (action === 'git-branch-from-ref') {
        await createBranchFromRef(depotRef)
      }
      return
    }
    switch (action) {
      case 'get-latest': await getEntryRevision(entry, source); break
      case 'checkout': await checkoutSelected(false, entry.path, source); break
      case 'checkout-open': await checkoutSelected(true, entry.path, source); break
      case 'add': if (change) await stageChange(change); break
      case 'delete': await deleteSelected(entry.path); break
      case 'revert': await revertSelected(change); break
      case 'diff': change ? await showDiff(change, change.staged && !change.unstaged) : await showPathDiff(entry.path, source === 'depot' ? depotRef : repository.upstream ?? 'HEAD'); break
      case 'file-history': await showFileHistory(entry.path, entry.isDirectory); break
      case 'timelapse': await showTimelapse(entry.path, source === 'depot' ? depotRef : 'HEAD'); break
      case 'show-workspace': await focusPath(entry, 'workspace'); break
      case 'show-depot': await focusPath(entry, 'depot'); break
      case 'show-explorer': await window.p4git.revealPath(repository.root, entry.path); break
      case 'copy-path': await copyText(source === 'depot' ? `${depotRef}:${entry.path}` : `${repository.root}\\${entry.path.replaceAll('/', '\\')}`); break
      case 'git-stage': if (change) await stageChange(change); break
      case 'git-unstage': if (change) await unstageChange(change); break
      case 'git-stash-path': await stashChanges(repository.root, entry.path ? [entry.path] : undefined); break
      case 'git-branch-from-ref': await createBranchFromRef(depotRef); break
    }
  }, [changelistState.assignments, changelistState.changelists, checkoutSelected, copyText, createBranchFromRef, deleteSelected, depotRef, focusPath, getEntryRevision, getLatest, moveChangesToChangelist, openNewChangelist, perform, repository, revertSelected, showDiff, showFileHistory, showPathDiff, showTimelapse, stageChange, stashChanges, unstageChange])

  const handlePendingContext = useCallback(async (change: FileChange, isStaged: boolean, changelistId: string | undefined, selections: PendingSelection[]) => {
    if (!repository) return
    const effectiveSelections = selections.length > 0 ? selections : [{ change, staged: isStaged, changelistId }]
    const selectionLocations = new Set(effectiveSelections.map((selection) => selection.staged ? '__ready__' : selection.changelistId ?? '__default__'))
    setPendingSelection({ change, staged: isStaged, changelistId })
    setSelectedEntry(undefined)
    const action = await window.p4git.showContextMenu({
      kind: 'pending-file',
      staged: effectiveSelections.every((selection) => selection.staged),
      changed: true,
      untracked: change.kind === 'untracked',
      changelists: changelistState.changelists.map(({ id, name }) => ({ id, name })),
      currentChangelistId: selectionLocations.size === 1 ? [...selectionLocations][0] : undefined,
      multiple: effectiveSelections.length > 1
    })
    if (action?.startsWith('move-changelist:')) {
      const target = action.slice('move-changelist:'.length)
      await moveChangesToChangelist(effectiveSelections, target === '__default__' ? undefined : target)
      return
    }
    if (action === 'new-changelist-with-selection') {
      openNewChangelist(effectiveSelections)
      return
    }
    switch (action) {
      case 'submit': {
        const id = isStaged ? '__ready__' : changelistId ?? '__default__'
        const name = id === '__ready__' ? 'Ready to submit' : id === '__default__' ? 'Default changelist' : changelistState.changelists.find((item) => item.id === id)?.name ?? 'Changelist'
        await openSubmitForChangelist(id, name)
        break
      }
      case 'stage': await moveChangesToReady(effectiveSelections); break
      case 'unstage': await moveChangesToChangelist(effectiveSelections); break
      case 'revert': await revertSelected(change); break
      case 'diff': await showDiff(change, isStaged, changelistId); break
      case 'file-history': await showFileHistory(change.path); break
      case 'timelapse': await showTimelapse(change.path); break
      case 'show-workspace': await focusPath({ name: parts(change.path).name, path: change.path, isDirectory: false, tracked: change.kind !== 'untracked' }, 'workspace'); break
      case 'copy-path': await copyText(`${repository.root}\\${change.path.replaceAll('/', '\\')}`); break
      case 'git-stage': await moveChangesToReady(effectiveSelections); break
      case 'git-unstage': await moveChangesToChangelist(effectiveSelections); break
      case 'git-stash-path': await stashChanges(repository.root, [...new Set(effectiveSelections.map((selection) => selection.change.path))]); break
    }
  }, [changelistState.changelists, copyText, focusPath, moveChangesToChangelist, moveChangesToReady, openNewChangelist, openSubmitForChangelist, repository, revertSelected, showDiff, showFileHistory, showTimelapse, stashChanges])

  const handleChangelistContext = useCallback(async (id: string, name: string, rows: FileChange[]) => {
    if (!repository) return
    const action = await window.p4git.showContextMenu({ kind: 'changelist', currentChangelistId: id, empty: rows.length === 0 })
    if (action === 'new-changelist') openNewChangelist()
    else if (action === 'submit-changelist') await openSubmitForChangelist(id, name)
    else if (action === 'stage-changelist') {
      const paths = [...new Set(rows.flatMap((change) => change.oldPath ? [change.path, change.oldPath] : [change.path]))]
      await performGitAt(repository.root, 'stage-changelist', `add -- ${paths.join(' ')}`, () => window.p4git.stage(repository.root, paths), `${name} moved to Ready to submit.`)
    } else if (action === 'edit-changelist') {
      const changelist = changelistState.changelists.find((item) => item.id === id)
      if (changelist) setChangelistEditor({ id: changelist.id, name: changelist.name, description: changelist.description })
    } else if (action === 'delete-changelist') {
      const changelist = changelistState.changelists.find((item) => item.id === id)
      if (changelist) await deleteLocalChangelist(changelist)
    }
  }, [changelistState.changelists, deleteLocalChangelist, openNewChangelist, openSubmitForChangelist, performGitAt, repository])

  const handleCommitContext = useCallback(async (commit: CommitInfo) => {
    if (!repository) return
    setSelectedCommit(commit)
    const action = await window.p4git.showContextMenu({ kind: 'submitted-change' })
    if (action === 'commit-files') {
      setCommitFiles(await window.p4git.getCommitFiles(repository.root, commit.hash))
      setDetailTab('files')
    } else if (action === 'commit-diff') {
      setDiffLoading(true)
      setDetailTab('diff')
      try { setDiff(await window.p4git.getCommitDiff(repository.root, commit.hash)) }
      finally { setDiffLoading(false) }
    } else if (action === 'copy-hash') {
      await copyText(commit.hash)
    } else if (action === 'git-cherry-pick') {
      if (window.confirm(`Cherry-pick ${commit.shortHash} onto the current branch?\n\nIf conflicts occur, use Tools > Git > Abort Operation or resolve them before continuing.`)) {
        await performGitAt(repository.root, 'git-cherry-pick', `cherry-pick ${commit.hash}`, () => window.p4git.cherryPick(repository.root, commit.hash), `Cherry-picked ${commit.shortHash}.`)
      }
    } else if (action === 'git-branch-from-commit') {
      await createBranchFromRef(commit.hash)
    } else if (action === 'git-tag') {
      await createTagAt(commit.hash)
    } else if (action === 'git-reset-soft' || action === 'git-reset-mixed' || action === 'git-reset-hard') {
      const mode = action.slice('git-reset-'.length) as 'soft' | 'mixed' | 'hard'
      const accepted = mode === 'hard'
        ? window.prompt(`HARD RESET to ${commit.shortHash} discards index and working-tree changes.\n\nType RESET to continue:`, '') === 'RESET'
        : window.confirm(`${mode === 'soft' ? 'Soft' : 'Mixed'} reset the current branch to ${commit.shortHash}?\n\n${mode === 'soft' ? 'Index and files will be kept.' : 'Working files will be kept, but the index will be reset.'}`)
      if (accepted) await performGitAt(repository.root, `git-reset-${mode}`, `reset --${mode} ${commit.hash}`, () => window.p4git.reset(repository.root, commit.hash, mode), `Reset current branch to ${commit.shortHash} (${mode}).`)
    }
  }, [copyText, createBranchFromRef, createTagAt, performGitAt, repository])

  const handleBranchContext = useCallback(async (branch: BranchInfo) => {
    if (!repository) return
    setSelectedBranch(branch)
    const action = await window.p4git.showContextMenu({ kind: 'branch', current: branch.current, remote: branch.remote })
    if (action === 'switch-branch') {
      await perform('checkout', `git switch ${branch.name}`, () => window.p4git.checkout({ repoPath: repository.root, branch: branch.name }), `Switched to ${branch.name}.`)
    } else if (action === 'new-branch') {
      const name = window.prompt(`New branch from ${branch.name}:`, '')?.trim()
      if (name) await perform('branch', `git switch -c ${name} ${branch.name}`, () => window.p4git.checkout({ repoPath: repository.root, branch: name, create: true, startPoint: branch.name }), `Created ${name} from ${branch.name}.`)
    } else if (action === 'copy-path') {
      await copyText(branch.name)
    } else if (action === 'git-merge') {
      await mergeRef(branch.name)
    } else if (action === 'git-rebase') {
      await rebaseOnto(branch.name)
    } else if (action === 'git-tag') {
      await createTagAt(branch.name)
    } else if (action === 'git-delete-branch') {
      if (window.confirm(`Delete local branch ${branch.name}?\n\nGit will refuse if the branch is not fully merged.`)) {
        await performGitAt(repository.root, 'git-delete-branch', `branch -d -- ${branch.name}`, () => window.p4git.deleteBranch(repository.root, branch.name), `Deleted branch ${branch.name}.`)
      }
    }
  }, [copyText, createTagAt, mergeRef, perform, performGitAt, rebaseOnto, repository])

  const handleWorkspaceContext = useCallback(async (path: string) => {
    if (!repository) return
    const action = await window.p4git.showContextMenu({ kind: 'workspace', current: path === repository.root })
    if (action === 'open-workspace') await openRepository(path)
    else if (action === 'show-explorer') await window.p4git.revealRepository(path)
    else if (action === 'copy-path') await copyText(path)
    else if (action === 'git-fetch') await performGitAt(path, 'git-fetch', 'fetch --all --prune', () => window.p4git.fetch(path), `Fetched ${path}.`)
    else if (action === 'git-pull') await performGitAt(path, 'git-pull', 'pull --ff-only', () => window.p4git.pull(path), `Updated ${path}.`)
    else if (action === 'git-push') await performGitAt(path, 'git-push', 'push', () => window.p4git.push(path), `Pushed ${path}.`)
    else if (action === 'git-stash') await stashChanges(path)
    else if (action === 'git-stashes') await showStashes(path)
    else if (action === 'git-reflog') await showReflog(path)
  }, [copyText, openRepository, performGitAt, repository, showReflog, showStashes, stashChanges])

  const openSelectedSubmit = useCallback(async () => {
    if (pendingSelection) {
      const id = pendingSelection.staged ? '__ready__' : pendingSelection.changelistId ?? '__default__'
      const name = id === '__ready__' ? 'Ready to submit' : id === '__default__' ? 'Default changelist' : changelistState.changelists.find((item) => item.id === id)?.name ?? 'Changelist'
      await openSubmitForChangelist(id, name)
      return
    }
    await openSubmitForChangelist('__ready__', 'Ready to submit')
  }, [changelistState.changelists, openSubmitForChangelist, pendingSelection])

  const handleMenuAction = useCallback((action: MenuAction) => {
    switch (action) {
      case 'open-workspace': void chooseRepository(); break
      case 'focus-filter': filterRef.current?.focus(); break
      case 'refresh': if (repository) void perform('refresh', 'git status', refresh, 'Workspace refreshed.', false); break
      case 'get-latest': void getLatest(); break
      case 'submit': setMainTab('pending'); void openSelectedSubmit(); break
      case 'new-changelist': setMainTab('pending'); openNewChangelist(); break
      case 'history': void showSelectedHistory(); break
      case 'checkout-file': void checkoutSelected(false); break
      case 'add-file': void stageSelected(); break
      case 'delete-file': void deleteSelected(); break
      case 'revert': void revertSelected(); break
      case 'diff': void showSelectedDiff(); break
      case 'timelapse': if (selectedPath) void showTimelapse(selectedPath, treeMode === 'depot' ? depotRef : 'HEAD'); break
      case 'revgraph': setMainTab('stream'); break
      case 'fetch': void fetchRemote(); break
      case 'push': void push(); break
      case 'settings': openPreferences(); break
      case 'about': window.alert('P4Git 0.1.3\nA P4V-style desktop workflow for Git.\nMIT License'); break
      case 'git-stash': void stashChanges(); break
      case 'git-stash-pop': if (repository && window.confirm('Pop the latest Git stash into the current workspace?')) void performGitAt(repository.root, 'git-stash-pop', 'stash pop stash@{0}', () => window.p4git.applyStash(repository.root, 'stash@{0}', true), 'Popped the latest Git stash.'); break
      case 'git-stashes': void showStashes(); break
      case 'git-reflog': void showReflog(); break
      case 'git-merge': void mergeRef(); break
      case 'git-rebase': void rebaseOnto(); break
      case 'git-tag': void createTagAt(); break
      case 'git-abort-merge': void abortGitOperation('merge'); break
      case 'git-abort-rebase': void abortGitOperation('rebase'); break
      case 'git-abort-cherry-pick': void abortGitOperation('cherry-pick'); break
    }
  }, [abortGitOperation, checkoutSelected, chooseRepository, createTagAt, deleteSelected, depotRef, fetchRemote, getLatest, mergeRef, openNewChangelist, openPreferences, openSelectedSubmit, perform, performGitAt, push, rebaseOnto, refresh, repository, revertSelected, selectedPath, showReflog, showSelectedDiff, showSelectedHistory, showStashes, showTimelapse, stageSelected, stashChanges, treeMode])

  useEffect(() => window.p4git.onMenuAction(handleMenuAction), [handleMenuAction])

  useEffect(() => {
    if (!repository || !selectedCommit || detailTab !== 'files') return
    let current = true
    void window.p4git.getCommitFiles(repository.root, selectedCommit.hash)
      .then((files) => { if (current) setCommitFiles(files) })
      .catch((reason) => { if (current) setError(friendlyError(reason)) })
    return () => { current = false }
  }, [detailTab, repository, selectedCommit])

  async function toggleTreePath(path: string): Promise<void> {
    if (!repository) return
    const activeEntries = treeMode === 'depot' ? depotEntriesByPath : entriesByPath
    const next = new Set(expandedPaths)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
      if (!activeEntries[path]) {
        if (treeMode === 'depot') await loadTree(repository.root, depotRef, path)
        else await loadDirectory(repository.root, path)
      }
    }
    setExpandedPaths(next)
  }

  async function selectDirectory(path: string): Promise<void> {
    if (!repository) return
    setCurrentDirectory(path)
    setSelectedEntry(undefined)
    const activeEntries = treeMode === 'depot' ? depotEntriesByPath : entriesByPath
    if (!activeEntries[path]) {
      if (treeMode === 'depot') await loadTree(repository.root, depotRef, path)
      else await loadDirectory(repository.root, path)
    }
    setMainTab('files')
  }

  async function switchTreeMode(mode: TreeMode): Promise<void> {
    if (!repository || mode === treeMode) return
    setTreeMode(mode)
    setCurrentDirectory('')
    setSelectedEntry(undefined)
    setPendingSelection(undefined)
    setExpandedPaths(new Set(['']))
    if (mode === 'depot' && !depotEntriesByPath['']) await loadTree(repository.root, depotRef, '')
    if (mode === 'workspace' && !entriesByPath['']) await loadDirectory(repository.root, '')
    setMainTab('files')
  }

  async function changeDepotRef(ref: string): Promise<void> {
    if (!repository) return
    setDepotRef(ref)
    setDepotEntriesByPath({})
    setCurrentDirectory('')
    setSelectedEntry(undefined)
    setExpandedPaths(new Set(['']))
    await loadTree(repository.root, ref, '')
  }

  async function submitCommit(): Promise<void> {
    const submitChanges = submitChangelist?.changes ?? staged
    if (!repository || !commitMessage.trim() || submitChanges.length === 0) return
    if (submitChangelist?.preparePaths) {
      const prepared = await performGitAt(
        repository.root,
        'prepare-changelist',
        `reset; add -- ${submitChangelist.preparePaths.join(' ')}`,
        () => window.p4git.prepareChangelist(repository.root, submitChangelist.preparePaths!),
        `${submitChangelist.name} prepared for submit.`
      )
      if (!prepared) return
    }
    const committedPaths = submitChangelist?.paths ?? staged.map((change) => change.path)
    const success = await perform('commit', `git commit -m "${commitMessage.trim()}"`, () => window.p4git.commit(repository.root, commitMessage), `${submitChangelist?.name ?? 'Ready to submit'} submitted as a local Git commit.`)
    if (!success) return
    setChangelistState(await window.p4git.assignChangelist(repository.root, committedPaths))
    setCommitMessage('')
    setSubmitOpen(false)
    setSubmitChangelist(undefined)
    setMainTab('submitted')
    setHistory(await window.p4git.getHistory(repository.root))
  }

  async function createBranch(): Promise<void> {
    if (!repository || !newBranch.trim()) return
    await perform('branch', `git switch -c ${newBranch.trim()}`, () => window.p4git.checkout({ repoPath: repository.root, branch: newBranch, create: true }), `Created and switched to ${newBranch.trim()}.`)
    setNewBranch('')
  }

  if (!repository) {
    return (
      <main className="connection-screen">
        <section className="connection-dialog">
          <div className="dialog-title"><BrandIcon /><span>Open Connection</span></div>
          <div className="connection-body">
            <div className="connection-hero"><HardDrive size={42} /><div><h1>Open a Git Workspace</h1><p>P4V workflow and layout, backed by your existing Git repository.</p></div></div>
            <label>Workspace folder</label>
            <div className="browse-row"><input readOnly placeholder="Select an existing Git repository..." /><button onClick={() => void chooseRepository()} disabled={!health.available || Boolean(busy)}>Browse...</button></div>
            <div className={`health-row ${health.available ? 'ok' : 'bad'}`}>
              {health.available ? <CircleCheck size={16} /> : <AlertTriangle size={16} />}
              <span>{health.available ? `${health.version} — ${health.path}` : health.error || 'Checking Git installation...'}</span>
              <button onClick={() => void chooseGit()}><Settings size={14} />Configure Git</button>
            </div>
            {settings.recentRepositories.length > 0 && <div className="recent-workspaces"><strong>Recent workspaces</strong>{settings.recentRepositories.map((path) => <button key={path} onClick={() => void openRepository(path)}><FolderGit2 size={15} />{path}</button>)}</div>}
          </div>
          <div className="dialog-footer"><button onClick={() => void chooseRepository()} disabled={!health.available || Boolean(busy)}>{busy ? <LoaderCircle className="spin" size={15} /> : null}Open Workspace</button></div>
        </section>
        {error && <ErrorToast message={error} close={() => setError(undefined)} />}
      </main>
    )
  }

  const activeEntriesByPath = treeMode === 'depot' ? depotEntriesByPath : entriesByPath
  const activeEntries = activeEntriesByPath[currentDirectory] ?? []
  const canCheckout = Boolean(selectedPath && !selectedEntry?.isDirectory && (selectedEntry?.tracked || selectedChange?.kind !== 'untracked'))
  const canAdd = Boolean(selectedChange?.unstaged && selectedChange.kind === 'untracked')
  const canDelete = Boolean(treeMode === 'workspace' && selectedPath && !selectedEntry?.isDirectory && (selectedEntry?.tracked || selectedChange?.kind === 'deleted'))
  const canRevert = Boolean(selectedChange && !(selectedChange.kind === 'untracked' && !selectedChange.staged))
  const canDiff = Boolean(selectedPath && !selectedEntry?.isDirectory && (selectedEntry?.tracked || selectedChange))

  return (
    <main className={`p4v-shell ${logCollapsed ? 'log-collapsed' : ''}`}>
      <Toolbar
        busy={busy}
        canCheckout={canCheckout}
        canAdd={canAdd}
        canDelete={canDelete}
        canRevert={canRevert}
        canDiff={canDiff}
        canTimelapse={Boolean(selectedPath && !selectedEntry?.isDirectory && selectedChange?.kind !== 'untracked')}
        onRefresh={() => void perform('refresh', 'git status', refresh, 'Workspace refreshed.', false)}
        onGetLatest={() => void getLatest()}
        onSubmit={() => { setMainTab('pending'); void openSelectedSubmit() }}
        onCheckout={() => void checkoutSelected(false)}
        onAdd={() => void stageSelected()}
        onDelete={() => void deleteSelected()}
        onRevert={() => void revertSelected()}
        onDiff={() => void showSelectedDiff()}
        onTimelapse={() => selectedPath && void showTimelapse(selectedPath, treeMode === 'depot' ? depotRef : 'HEAD')}
        onRevgraph={() => setMainTab('stream')}
      />

      <div className="location-bar">
        <span className="location-root">{treeMode === 'depot' ? 'Depot' : repository.root.slice(0, 3)}</span>
        <input value={treeMode === 'depot' ? `${depotRef}:${currentDirectory ? `/${currentDirectory}` : '/'}` : `${repository.root}${currentDirectory ? `\\${currentDirectory.replaceAll('/', '\\')}` : ''}`} readOnly />
        <button title="Location history"><ChevronDown size={14} /></button>
        <button className="bookmark-button" title="Bookmark workspace"><Bookmark size={17} fill="currentColor" /></button>
      </div>

      <div className="workbench">
        <aside className="workspace-pane">
          <div className="pane-tabs"><button className={treeMode === 'depot' ? 'active' : ''} onClick={() => void switchTreeMode('depot')}>Depot</button><button className={treeMode === 'workspace' ? 'active' : ''} onClick={() => void switchTreeMode('workspace')}><Folder size={16} fill="#d7a743" />Workspace</button><span /><button title="Sort"><Columns3 size={15} /></button><button title="Filter tree"><Filter size={15} /></button></div>
          {treeMode === 'depot' ? <div className="workspace-selector depot-selector"><GitBranch size={16} /><strong>Committed tree</strong><select value={depotRef} onChange={(event) => void changeDepotRef(event.target.value)}>{[repository.upstream, 'HEAD', ...branches.map((branch) => branch.name)].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index).map((ref) => <option key={ref} value={ref}>{ref}</option>)}</select></div> : <button className="workspace-selector"><Monitor size={17} /><strong>{repository.name}</strong><span>({repository.branch})</span><ChevronDown size={14} /></button>}
          <div className="tree-scroll">
            <div className={`tree-row root ${currentDirectory === '' ? 'selected' : ''}`} onClick={() => void selectDirectory('')} onContextMenu={(event) => { event.preventDefault(); void handleEntryContext({ name: treeMode === 'depot' ? depotRef : repository.name, path: '', isDirectory: true, tracked: true }, treeMode) }}>
              <button onClick={(event) => { event.stopPropagation(); void toggleTreePath('') }}>{expandedPaths.has('') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              {treeMode === 'depot' ? <GitBranch size={16} /> : <HardDrive size={16} />}<span>{treeMode === 'depot' ? `//${depotRef}` : repository.root}</span>
            </div>
            {expandedPaths.has('') && <TreeChildren parent="" depth={1} entriesByPath={activeEntriesByPath} expanded={expandedPaths} currentDirectory={currentDirectory} onToggle={toggleTreePath} onSelectDirectory={selectDirectory} onSelectFile={(entry) => { setSelectedEntry(entry); const change = repository.changes.find((item) => item.path === entry.path); setPendingSelection(change ? { change, staged: change.staged && !change.unstaged, changelistId: change.unstaged ? changelistState.assignments[change.path] : undefined } : undefined) }} onContext={(entry) => void handleEntryContext(entry, treeMode)} />}
          </div>
        </aside>

        <section className="content-pane">
          <div className="main-tabs">
            {(Object.keys(tabLabels) as MainTab[]).filter((tab) => tab !== 'history' || fileHistoryView).map((tab) => <button key={tab} className={mainTab === tab ? 'active' : ''} onClick={() => setMainTab(tab)}>{(tab === 'files' || tab === 'history') && <FileText size={16} />}{tab === 'pending' && <AlertTriangle size={16} fill="#d73e45" />}{tab === 'submitted' && <span className="submitted-icon">▲</span>}{tab === 'stream' && <GitGraph size={16} />}{tab === 'workspaces' && <Monitor size={16} />}{tabLabels[tab]}{tab === 'history' && <span className="tab-close" onClick={(event) => { event.stopPropagation(); setFileHistoryView(undefined); setMainTab('files') }}>×</span>}</button>)}
          </div>
          <div className="filter-bar"><button><ChevronRight size={15} /></button><strong>Filter:</strong><input ref={filterRef} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="none applied" /><span>{getMatchCount(mainTab, filter, activeEntries, repository.changes, history, branches, settings, fileHistoryView?.commits)} matches</span><Filter size={15} /><button onClick={() => void perform('refresh', 'git status', refresh, 'Workspace refreshed.', false)} title="Refresh view"><RefreshCw size={16} className={busy === 'refresh' ? 'spin' : ''} /></button></div>

          <div className="table-area">
            {mainTab === 'files' && <FilesTable entries={activeEntries} changes={repository.changes} filter={filter} selected={selectedEntry?.path} source={treeMode} onSelect={(entry) => { setSelectedEntry(entry); const change = repository.changes.find((item) => item.path === entry.path); setPendingSelection(change ? { change, staged: change.staged && !change.unstaged, changelistId: change.unstaged ? changelistState.assignments[change.path] : undefined } : undefined) }} onOpen={(entry) => entry.isDirectory ? void selectDirectory(entry.path) : (() => { const change = repository.changes.find((item) => item.path === entry.path); change ? void showDiff(change, change.staged && !change.unstaged, change.unstaged ? changelistState.assignments[change.path] : undefined) : void showPathDiff(entry.path, treeMode === 'depot' ? depotRef : repository.upstream ?? 'HEAD') })()} onContext={(entry) => void handleEntryContext(entry, treeMode)} />}
            {mainTab === 'history' && fileHistoryView && <HistoryTable view={fileHistoryView} filter={filter} selected={selectedCommit?.hash} onSelect={(commit) => { setSelectedCommit(commit); setDetailTab('details') }} onOpen={(commit) => void showHistoryDiff(commit)} onContext={(commit) => void handleHistoryContext(commit)} />}
            {mainTab === 'pending' && <PendingTable staged={staged} unstaged={unstaged} changelists={changelistState.changelists} assignments={changelistState.assignments} filter={filter} onSelect={(change, isStaged, changelistId) => { setSelectedEntry(undefined); setPendingSelection({ change, staged: isStaged, changelistId }); setDetailTab('details') }} onOpen={(change, isStaged, changelistId) => void showDiff(change, isStaged, changelistId)} onStage={(selections) => void moveChangesToReady(selections)} onMove={(selections, id) => void moveChangesToChangelist(selections, id)} onContext={(change, isStaged, changelistId, selections) => void handlePendingContext(change, isStaged, changelistId, selections)} onNew={() => openNewChangelist()} onGroupContext={(id, name, rows) => void handleChangelistContext(id, name, rows)} />}
            {mainTab === 'submitted' && <SubmittedTable commits={history} filter={filter} selected={selectedCommit?.hash} onSelect={(commit) => { setSelectedCommit(commit); setDetailTab('details') }} onContext={(commit) => void handleCommitContext(commit)} />}
            {mainTab === 'stream' && <StreamTable branches={branches} filter={filter} selected={selectedBranch?.name} onSelect={setSelectedBranch} onCheckout={(branch) => void perform('checkout', `git switch ${branch.name}`, () => window.p4git.checkout({ repoPath: repository.root, branch: branch.name }), `Switched to ${branch.name}.`)} onContext={(branch) => void handleBranchContext(branch)} newBranch={newBranch} onNewBranch={setNewBranch} onCreate={() => void createBranch()} busy={Boolean(busy)} />}
            {mainTab === 'workspaces' && <WorkspacesTable paths={settings.recentRepositories} active={repository.root} filter={filter} onOpen={(path) => void openRepository(path)} onContext={(path) => void handleWorkspaceContext(path)} />}
          </div>

          <div className="detail-pane">
            <div className="detail-tabs">{(['details', 'files', 'jobs', 'diff'] as DetailTab[]).map((tab) => <button key={tab} className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>{tab === 'details' ? 'Details' : tab === 'files' ? 'Files' : tab === 'jobs' ? 'Jobs' : 'Diff Summary'}</button>)}</div>
            <DetailContent tab={detailTab} pending={pendingSelection} changelists={changelistState.changelists} commit={selectedCommit} branch={selectedBranch} entry={selectedEntry} commitFiles={commitFiles} diff={diff} diffLoading={diffLoading} />
          </div>
        </section>
      </div>

      <section className={`log-pane ${logCollapsed ? 'collapsed' : ''}`}>
        <div className="log-tab"><button onClick={() => setLogCollapsed(!logCollapsed)}><FileText size={14} />Log</button><span /><button onClick={() => setLogs([])} title="Clear log"><X size={13} /></button></div>
        {!logCollapsed && <div className="log-output" onContextMenu={async (event) => { event.preventDefault(); if (await window.p4git.showContextMenu({ kind: 'log' }) === 'clear-log') setLogs([]) }}>{logs.map((entry) => <div key={entry.id} className={entry.kind}><span>●</span><time>{entry.time}</time><code>{entry.text}</code></div>)}</div>}
      </section>

      <footer className="classic-status"><span>{repository.root.slice(0, 3)}</span><span>{repository.root}{currentDirectory ? `\\${currentDirectory.replaceAll('/', '\\')}` : ''}</span><span className="grow" /><span>{repository.upstream ? `Tracking ${repository.upstream}` : 'No upstream'}</span><span className="status-ready"><Check size={13} /></span></footer>

      {submitOpen && <SubmitDialog name={submitChangelist?.name ?? 'Ready to submit'} staged={submitChangelist?.changes ?? staged} message={commitMessage} onMessage={setCommitMessage} onCancel={() => { setSubmitOpen(false); setSubmitChangelist(undefined) }} onSubmit={() => void submitCommit()} busy={busy === 'commit' || busy === 'prepare-changelist'} conflicts={(submitChangelist?.changes ?? staged).some((change) => change.conflicted)} />}
      {timelapseView && <TimelapseDialog view={timelapseView} onClose={() => setTimelapseView(undefined)} />}
      {stashesView && <StashesDialog view={stashesView} onClose={() => setStashesView(undefined)} onApply={(entry) => void applyStashEntry(entry, false)} onPop={(entry) => void applyStashEntry(entry, true)} onDrop={(entry) => void dropStashEntry(entry)} />}
      {reflogView && <ReflogDialog view={reflogView} onClose={() => setReflogView(undefined)} onCopy={(entry) => void copyText(entry.hash)} />}
      {preferencesOpen && <PreferencesDialog health={health} value={diffToolDraft} onChange={setDiffToolDraft} onChooseGit={() => void chooseGit()} onChooseDiff={() => void chooseDiffTool()} onCancel={() => setPreferencesOpen(false)} onSave={() => void savePreferences()} busy={busy === 'preferences'} />}
      {changelistEditor && <ChangelistDialog value={changelistEditor} onChange={setChangelistEditor} onCancel={() => setChangelistEditor(undefined)} onSave={() => void saveChangelist()} busy={busy === 'new-changelist' || busy === 'edit-changelist'} />}
      {error && <ErrorToast message={error} close={() => setError(undefined)} />}
    </main>
  )
}

function Toolbar(props: {
  busy?: string
  canCheckout: boolean
  canAdd: boolean
  canDelete: boolean
  canRevert: boolean
  canDiff: boolean
  canTimelapse: boolean
  onRefresh: () => void
  onGetLatest: () => void
  onSubmit: () => void
  onCheckout: () => void
  onAdd: () => void
  onDelete: () => void
  onRevert: () => void
  onDiff: () => void
  onTimelapse: () => void
  onRevgraph: () => void
}): React.JSX.Element {
  const blocked = Boolean(props.busy)
  return <div className="classic-toolbar">
    <Tool icon={<RefreshCw />} label="Refresh" onClick={props.onRefresh} disabled={blocked} busy={props.busy === 'refresh'} />
    <Tool icon={<Download />} label="Get Latest" onClick={props.onGetLatest} disabled={blocked} busy={props.busy === 'pull'} />
    <Tool icon={<Upload />} label="Submit" onClick={props.onSubmit} disabled={blocked} />
    <i />
    <Tool icon={<Check />} label="Checkout" onClick={props.onCheckout} disabled={blocked || !props.canCheckout} title="Git does not lock files; mark the selected tracked file ready to edit" />
    <Tool icon={<Plus />} label="Add" onClick={props.onAdd} disabled={blocked || !props.canAdd} title="Add selected untracked file (Git stage)" />
    <Tool icon={<Minus />} label="Delete" onClick={props.onDelete} disabled={blocked || !props.canDelete} title="Remove the selected tracked file and stage its deletion" />
    <Tool icon={<RotateCcw />} label="Revert" onClick={props.onRevert} disabled={blocked || !props.canRevert} />
    <i />
    <Tool icon={<FileDiff />} label="Diff" onClick={props.onDiff} disabled={!props.canDiff} />
    <Tool icon={<Ban />} label="Timelapse" onClick={props.onTimelapse} disabled={blocked || !props.canTimelapse} title="Show line history using Git blame" />
    <Tool icon={<GitGraph />} label="Revgraph" onClick={props.onRevgraph} />
    <i />
    <Tool icon={<XCircle />} label="Cancel" disabled />
  </div>
}

function Tool({ icon, label, onClick, disabled, busy, title }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; busy?: boolean; title?: string }): React.JSX.Element {
  return <button className="tool-button" onClick={onClick} disabled={disabled} title={title}>{busy ? <LoaderCircle className="spin" /> : icon}<span>{label}</span></button>
}

function TreeChildren({ parent, depth, entriesByPath, expanded, currentDirectory, onToggle, onSelectDirectory, onSelectFile, onContext }: {
  parent: string
  depth: number
  entriesByPath: Record<string, WorkspaceEntry[]>
  expanded: Set<string>
  currentDirectory: string
  onToggle: (path: string) => Promise<void>
  onSelectDirectory: (path: string) => Promise<void>
  onSelectFile: (entry: WorkspaceEntry) => void
  onContext: (entry: WorkspaceEntry) => void
}): React.JSX.Element {
  return <>{(entriesByPath[parent] ?? []).map((entry) => <div key={entry.path}>
    <div className={`tree-row ${currentDirectory === entry.path ? 'selected' : ''}`} style={{ paddingLeft: 5 + depth * 18 }} onDoubleClick={() => entry.isDirectory && void onToggle(entry.path)} onClick={() => entry.isDirectory ? void onSelectDirectory(entry.path) : onSelectFile(entry)} onContextMenu={(event) => { event.preventDefault(); onContext(entry) }}>
      {entry.isDirectory ? <button onClick={(event) => { event.stopPropagation(); void onToggle(entry.path) }}>{expanded.has(entry.path) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="tree-indent" />}
      {entry.isDirectory ? <Folder size={16} fill="#d8b15c" /> : <File size={14} />}
      <span>{entry.name}</span>
    </div>
    {entry.isDirectory && expanded.has(entry.path) && <TreeChildren parent={entry.path} depth={depth + 1} entriesByPath={entriesByPath} expanded={expanded} currentDirectory={currentDirectory} onToggle={onToggle} onSelectDirectory={onSelectDirectory} onSelectFile={onSelectFile} onContext={onContext} />}
  </div>)}</>
}

function FilesTable({ entries, changes, filter, selected, source, onSelect, onOpen, onContext }: { entries: WorkspaceEntry[]; changes: FileChange[]; filter: string; selected?: string; source: TreeMode; onSelect: (entry: WorkspaceEntry) => void; onOpen: (entry: WorkspaceEntry) => void; onContext: (entry: WorkspaceEntry) => void }): React.JSX.Element {
  const query = filter.toLowerCase()
  const rows = entries.filter((entry) => entry.name.toLowerCase().includes(query))
  return <div className="classic-table files-table"><div className="table-head"><span>Name</span><span>Type</span><span>Action</span><span>Path</span></div>{rows.map((entry) => { const change = changes.find((item) => item.path === entry.path); const action = change ? changeLabel(change) : source === 'depot' ? 'committed' : entry.tracked ? '' : 'local only'; return <button key={entry.path} className={`table-row ${selected === entry.path ? 'selected' : ''}`} onClick={() => onSelect(entry)} onDoubleClick={() => onOpen(entry)} onContextMenu={(event) => { event.preventDefault(); onContext(entry) }}><span className="file-name">{entry.isDirectory ? <Folder size={16} fill="#d8b15c" /> : <File size={15} />}{entry.name}</span><span>{entry.isDirectory ? 'Folder' : parts(entry.name).name.includes('.') ? parts(entry.name).name.split('.').pop()?.toUpperCase() : 'File'}</span><span>{action}</span><span>{parts(entry.path).directory || '.'}</span></button> })}{rows.length === 0 && <EmptyTable text="No files match the current filter." />}</div>
}

function PendingTable({ staged, unstaged, changelists, assignments, filter, onSelect, onOpen, onStage, onMove, onContext, onNew, onGroupContext }: {
  staged: FileChange[]
  unstaged: FileChange[]
  changelists: LocalChangelist[]
  assignments: Record<string, string>
  filter: string
  onSelect: (change: FileChange, staged: boolean, changelistId?: string) => void
  onOpen: (change: FileChange, staged: boolean, changelistId?: string) => void
  onStage: (selections: PendingSelection[]) => void
  onMove: (selections: PendingSelection[], changelistId?: string) => void
  onContext: (change: FileChange, staged: boolean, changelistId: string | undefined, selections: PendingSelection[]) => void
  onNew: () => void
  onGroupContext: (id: string, name: string, rows: FileChange[]) => void
}): React.JSX.Element {
  const query = filter.toLowerCase()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const anchorKey = useRef<string | undefined>(undefined)
  const groups = useMemo(() => {
    const validIds = new Set(changelists.map((item) => item.id))
    return [
      { id: '__ready__', title: 'Ready to submit', description: 'Git index', rows: staged, staged: true },
      ...changelists.map((changelist) => ({
        id: changelist.id,
        title: changelist.name,
        description: changelist.description || 'Local changelist',
        rows: unstaged.filter((change) => assignments[change.path] === changelist.id),
        staged: false
      })),
      {
        id: '__default__',
        title: 'Default changelist',
        description: 'Unassigned workspace changes',
        rows: unstaged.filter((change) => !validIds.has(assignments[change.path])),
        staged: false
      }
    ]
  }, [assignments, changelists, staged, unstaged])
  const allRows = useMemo(() => groups.flatMap((group) => group.rows.map((change) => ({
    key: `${group.id}\u0000${change.path}`,
    sourceId: group.id,
    selection: {
      change,
      staged: group.staged,
      changelistId: group.id === '__default__' || group.id === '__ready__' ? undefined : group.id
    } satisfies PendingSelection
  }))), [groups])
  const visibleRows = allRows.filter((row) => !collapsed.has(row.sourceId) && row.selection.change.path.toLowerCase().includes(query))

  useEffect(() => {
    const validKeys = new Set(allRows.map((row) => row.key))
    setSelectedKeys((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)))
      return next.size === current.size ? current : next
    })
  }, [allRows])

  const selectedRows = (keys: Set<string>): PendingSelection[] => allRows
    .filter((row) => keys.has(row.key))
    .map((row) => row.selection)

  return <div className="pending-layout">
    <div className="pending-tools">
      <button onClick={onNew}><Plus size={14} />New Changelist...</button>
      <span>{selectedKeys.size > 1 ? `${selectedKeys.size} files selected. ` : ''}Use Ctrl or Shift to select multiple files, then drag or right-click to move them.</span>
    </div>
    <div className="classic-table pending-table" tabIndex={0} onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelectedKeys(new Set(visibleRows.map((row) => row.key)))
      } else if (event.key === 'Escape') {
        setSelectedKeys(new Set())
      }
    }}>
      <div className="table-head"><span>Changelist</span><span>File</span><span>Action</span><span>Folder</span></div>
      {groups.map((group) => <div className="table-group" key={group.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => {
        event.preventDefault()
        try {
          const payload = JSON.parse(event.dataTransfer.getData('application/x-p4git-change')) as { rows: Array<{ sourceId: string; path: string }> }
          const selections: PendingSelection[] = payload.rows.flatMap(({ sourceId, path }) => {
            const selection = allRows.find((row) => row.sourceId === sourceId && row.selection.change.path === path)?.selection
            return selection ? [selection] : []
          })
          if (selections.length === 0) return
          if (group.id === '__ready__') onStage(selections)
          else onMove(selections, group.id === '__default__' ? undefined : group.id)
        } catch { /* Ignore drags from outside P4Git. */ }
      }}>
        <div className="group-row" title={group.description} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next })} onContextMenu={(event) => { event.preventDefault(); onGroupContext(group.id, group.title, group.rows) }}>
          {collapsed.has(group.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<strong>{group.title}</strong>{group.description && <em>{group.description}</em>}<span>{group.rows.length} files</span>
        </div>
        {!collapsed.has(group.id) && group.rows.filter((change) => change.path.toLowerCase().includes(query)).map((change) => {
          const key = `${group.id}\u0000${change.path}`
          const changelistId = group.id === '__default__' || group.id === '__ready__' ? undefined : group.id
          const selection: PendingSelection = { change, staged: group.staged, changelistId }
          return <button
            draggable
            key={key}
            className={`table-row ${selectedKeys.has(key) ? 'selected' : ''}`}
            onDragStart={(event) => {
              const dragKeys = selectedKeys.has(key) ? selectedKeys : new Set([key])
              const rows = allRows.filter((row) => dragKeys.has(row.key)).map((row) => ({ sourceId: row.sourceId, path: row.selection.change.path }))
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-p4git-change', JSON.stringify({ rows }))
            }}
            onClick={(event) => {
              let next: Set<string>
              if (event.shiftKey && anchorKey.current) {
                const anchorIndex = visibleRows.findIndex((row) => row.key === anchorKey.current)
                const currentIndex = visibleRows.findIndex((row) => row.key === key)
                if (anchorIndex >= 0 && currentIndex >= 0) {
                  next = new Set(event.ctrlKey || event.metaKey ? selectedKeys : [])
                  for (const row of visibleRows.slice(Math.min(anchorIndex, currentIndex), Math.max(anchorIndex, currentIndex) + 1)) next.add(row.key)
                } else next = new Set([key])
              } else if (event.ctrlKey || event.metaKey) {
                next = new Set(selectedKeys)
                if (next.has(key)) next.delete(key); else next.add(key)
                anchorKey.current = key
              } else {
                next = new Set([key])
                anchorKey.current = key
              }
              setSelectedKeys(next)
              onSelect(change, group.staged, changelistId)
            }}
            onDoubleClick={() => onOpen(change, group.staged, changelistId)}
            onContextMenu={(event) => {
              event.preventDefault()
              const keys = selectedKeys.has(key) ? selectedKeys : new Set([key])
              if (!selectedKeys.has(key)) {
                setSelectedKeys(keys)
                anchorKey.current = key
              }
              onContext(change, group.staged, changelistId, selectedRows(keys))
            }}
          >
            <span>{group.title}</span><span className="file-name"><i className={`change-mark ${change.kind}`}>{changeCode(change)}</i>{parts(change.path).name}</span><span>{changeLabel(change)}</span><span>{parts(change.path).directory || '.'}</span>
          </button>
        })}
      </div>)}
      {staged.length + unstaged.length === 0 && <EmptyTable text="Workspace is clean. Local changelists are still available for future changes." />}
    </div>
  </div>
}

function SubmittedTable({ commits, filter, selected, onSelect, onContext }: { commits: CommitInfo[]; filter: string; selected?: string; onSelect: (commit: CommitInfo) => void; onContext: (commit: CommitInfo) => void }): React.JSX.Element {
  const query = filter.toLowerCase()
  const rows = commits.filter((commit) => `${commit.shortHash} ${commit.author} ${commit.subject}`.toLowerCase().includes(query))
  return <div className="classic-table submitted-table"><div className="table-head"><span>Change</span><span>Date Submitted</span><span>Submitted By</span><span>Description</span></div>{rows.map((commit) => <button key={commit.hash} className={`table-row ${selected === commit.hash ? 'selected' : ''}`} onClick={() => onSelect(commit)} onContextMenu={(event) => { event.preventDefault(); onContext(commit) }}><span className="change-cell"><ChevronRight size={13} /><i>▲</i><code>{commit.shortHash}</code></span><span>{formatDate(commit.date)}</span><span>{commit.author}</span><span>{commit.subject}</span></button>)}{rows.length === 0 && <EmptyTable text="No submitted changes match the current filter." />}</div>
}

function StreamTable({ branches, filter, selected, onSelect, onCheckout, onContext, newBranch, onNewBranch, onCreate, busy }: { branches: BranchInfo[]; filter: string; selected?: string; onSelect: (branch: BranchInfo) => void; onCheckout: (branch: BranchInfo) => void; onContext: (branch: BranchInfo) => void; newBranch: string; onNewBranch: (value: string) => void; onCreate: () => void; busy: boolean }): React.JSX.Element {
  const rows = branches.filter((branch) => branch.name.toLowerCase().includes(filter.toLowerCase()))
  return <div className="stream-layout"><div className="branch-tools"><label>New branch:</label><input value={newBranch} onChange={(event) => onNewBranch(event.target.value)} placeholder="feature/name" /><button onClick={onCreate} disabled={!newBranch.trim() || busy}><Plus size={14} />Create</button></div><div className="classic-table stream-table"><div className="table-head"><span>Branch / Stream</span><span>Type</span><span>Latest Change</span><span>Description</span><span /></div>{rows.map((branch) => <div role="button" tabIndex={0} key={branch.name} className={`table-row ${selected === branch.name ? 'selected' : ''}`} onClick={() => onSelect(branch)} onContextMenu={(event) => { event.preventDefault(); onContext(branch) }}><span className="file-name"><GitBranch size={15} />{branch.name}</span><span>{branch.remote ? 'Remote' : 'Local'}</span><code>{branch.hash}</code><span>{branch.subject}</span><span>{branch.current ? <em className="current-label"><Check size={12} />Current</em> : !branch.remote ? <button className="inline-button" onClick={(event) => { event.stopPropagation(); onCheckout(branch) }}>Switch</button> : null}</span></div>)}</div></div>
}

function WorkspacesTable({ paths, active, filter, onOpen, onContext }: { paths: string[]; active: string; filter: string; onOpen: (path: string) => void; onContext: (path: string) => void }): React.JSX.Element {
  const rows = paths.filter((path) => path.toLowerCase().includes(filter.toLowerCase()))
  return <div className="classic-table workspaces-table"><div className="table-head"><span>Workspace</span><span>Root</span><span>Status</span></div>{rows.map((path) => <button key={path} className={`table-row ${path === active ? 'selected' : ''}`} onDoubleClick={() => onOpen(path)} onContextMenu={(event) => { event.preventDefault(); onContext(path) }}><span className="file-name"><Monitor size={15} />{parts(path).name}</span><span>{path}</span><span>{path === active ? 'Current' : 'Recent'}</span></button>)}</div>
}

function DetailContent({ tab, pending, changelists, commit, branch, entry, commitFiles, diff, diffLoading }: { tab: DetailTab; pending?: PendingSelection; changelists: LocalChangelist[]; commit?: CommitInfo; branch?: BranchInfo; entry?: WorkspaceEntry; commitFiles: RevisionFile[]; diff: string; diffLoading: boolean }): React.JSX.Element {
  const pendingList = pending?.staged ? 'Ready to submit' : pending?.changelistId ? changelists.find((item) => item.id === pending.changelistId)?.name ?? 'Local changelist' : 'Default changelist'
  if (tab === 'diff') return <pre className="detail-diff">{diffLoading ? 'Loading diff...' : diff || 'Select a pending file and choose Diff.'}</pre>
  if (tab === 'jobs') return <div className="detail-empty">Git has no Perforce Jobs equivalent. Issue linking is planned.</div>
  if (tab === 'files') {
    if (pending) return <div className="detail-line"><File size={14} /><strong>{pending.change.path}</strong><span>{pendingList}</span></div>
    if (commit && commitFiles.length > 0) return <div className="revision-files">{commitFiles.map((file) => <div key={`${file.kind}-${file.path}`}><i className={`change-mark ${file.kind === 'A' ? 'added' : file.kind === 'D' ? 'deleted' : 'modified'}`}>{file.kind.slice(0, 1)}</i><span>{file.path}</span></div>)}</div>
    return <div className="detail-empty">Select a changelist or submitted change to inspect its files.</div>
  }
  if (pending) return <div className="detail-grid"><strong>File</strong><span>{pending.change.path}</span><strong>Action</strong><span>{changeLabel(pending.change)}</span><strong>Changelist</strong><span>{pendingList}</span></div>
  if (commit) return <div className="detail-grid"><strong>Change</strong><span>{commit.hash}</span><strong>Author</strong><span>{commit.author} &lt;{commit.email}&gt;</span><strong>Date</strong><span>{formatDate(commit.date)}</span><strong>Description</strong><span>{commit.subject}</span></div>
  if (branch) return <div className="detail-grid"><strong>Branch</strong><span>{branch.name}</span><strong>Revision</strong><span>{branch.hash}</span><strong>Upstream</strong><span>{branch.upstream || 'None'}</span></div>
  if (entry) return <div className="detail-grid"><strong>Name</strong><span>{entry.name}</span><strong>Path</strong><span>{entry.path}</span><strong>Type</strong><span>{entry.isDirectory ? 'Folder' : 'File'}</span></div>
  return <div className="detail-empty">Select an item to view details.</div>
}

function HistoryTable({ view, filter, selected, onSelect, onOpen, onContext }: { view: { path: string; commits: CommitInfo[]; isDirectory: boolean }; filter: string; selected?: string; onSelect: (commit: CommitInfo) => void; onOpen: (commit: CommitInfo) => void; onContext: (commit: CommitInfo) => void }): React.JSX.Element {
  const query = filter.toLowerCase()
  const rows = view.commits.filter((commit) => `${commit.shortHash} ${commit.author} ${commit.subject}`.toLowerCase().includes(query))
  return <div className="history-layout">
    <div className="history-path"><FileText size={15} /><strong>{view.path === '.' ? 'Repository History' : 'File History'}</strong><span>{view.path}</span><em>Double-click a revision to diff it against its previous revision.</em></div>
    <div className="classic-table history-table">
      <div className="table-head"><span>Revision</span><span>Change</span><span>Date</span><span>Submitted By</span><span>Description</span></div>
      {rows.map((commit) => {
        const revision = view.commits.length - view.commits.indexOf(commit)
        return <button key={commit.hash} className={`table-row ${selected === commit.hash ? 'selected' : ''}`} onClick={() => onSelect(commit)} onDoubleClick={() => onOpen(commit)} onContextMenu={(event) => { event.preventDefault(); onContext(commit) }}>
          <span className="history-revision"><ChevronRight size={13} /><i>▲</i><strong>#{revision}</strong></span><code>{commit.shortHash}</code><span>{formatDate(commit.date)}</span><span>{commit.author}</span><span>{commit.subject}</span>
        </button>
      })}
      {rows.length === 0 && <EmptyTable text="No committed history matches the selected path and filter." />}
    </div>
  </div>
}

function TimelapseDialog({ view, onClose }: { view: { path: string; lines: BlameLine[] }; onClose: () => void }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="timelapse-dialog" role="dialog" aria-modal="true" aria-label={`Time-lapse View ${view.path}`}><div className="modal-title"><GitGraph size={16} /><strong>Time-lapse View: {view.path}</strong><button onClick={onClose}><X size={16} /></button></div><div className="timelapse-lines"><div className="timelapse-head"><span>Change</span><span>Author</span><span>Date</span><span>Line</span><span>Content</span></div>{view.lines.map((line, index) => <div className="timelapse-row" key={`${line.hash}-${line.lineNumber}-${index}`}><code title={line.hash}>{line.hash.slice(0, 8)}</code><span title={line.author}>{line.author}</span><time>{line.date}</time><span>{line.lineNumber}</span><code>{line.content || ' '}</code></div>)}{view.lines.length === 0 && <EmptyTable text="No line history is available for this file." />}</div><div className="modal-actions"><span className="modal-hint">Git blame is used as the closest Git equivalent to P4V Time-lapse View.</span><button onClick={onClose}>Close</button></div></section></div>
}

function StashesDialog({ view, onClose, onApply, onPop, onDrop }: { view: { repoPath: string; entries: StashEntry[] }; onClose: () => void; onApply: (entry: StashEntry) => void; onPop: (entry: StashEntry) => void; onDrop: (entry: StashEntry) => void }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="git-list-dialog" role="dialog" aria-modal="true" aria-label="Git Stashes"><div className="modal-title"><GitBranch size={16} /><strong>Git Stashes — {view.repoPath}</strong><button onClick={onClose}><X size={16} /></button></div><div className="git-list-table stash-list"><div className="git-list-head"><span>Stash</span><span>Date</span><span>Description</span><span>Actions</span></div>{view.entries.map((entry) => <div className="git-list-row" key={entry.ref}><code title={entry.hash}>{entry.ref}</code><span>{formatDate(entry.date)}</span><span title={entry.subject}>{entry.subject}</span><span className="row-actions"><button onClick={() => onApply(entry)}>Apply</button><button onClick={() => onPop(entry)}>Pop</button><button onClick={() => onDrop(entry)}>Drop</button></span></div>)}{view.entries.length === 0 && <EmptyTable text="This repository has no Git stashes." />}</div><div className="modal-actions"><span className="modal-hint">Apply keeps the stash; Pop removes it after a successful apply.</span><button onClick={onClose}>Close</button></div></section></div>
}

function ReflogDialog({ view, onClose, onCopy }: { view: { repoPath: string; entries: ReflogEntry[] }; onClose: () => void; onCopy: (entry: ReflogEntry) => void }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="git-list-dialog" role="dialog" aria-modal="true" aria-label="Git Reflog"><div className="modal-title"><GitGraph size={16} /><strong>Git Reflog — {view.repoPath}</strong><button onClick={onClose}><X size={16} /></button></div><div className="git-list-table reflog-list"><div className="git-list-head"><span>Selector</span><span>Commit</span><span>Date</span><span>Operation</span><span /></div>{view.entries.map((entry) => <div className="git-list-row" key={`${entry.selector}-${entry.hash}`}><code>{entry.selector}</code><code title={entry.hash}>{entry.shortHash}</code><span>{formatDate(entry.date)}</span><span title={entry.subject}>{entry.subject}</span><span className="row-actions"><button onClick={() => onCopy(entry)}>Copy Hash</button></span></div>)}{view.entries.length === 0 && <EmptyTable text="No reflog entries are available." />}</div><div className="modal-actions"><span className="modal-hint">Reflog is local to this clone and can help recover earlier branch positions.</span><button onClick={onClose}>Close</button></div></section></div>
}

function PreferencesDialog({ health, value, onChange, onChooseGit, onChooseDiff, onCancel, onSave, busy }: { health: GitHealth; value: { path: string; argumentsTemplate: string }; onChange: (value: { path: string; argumentsTemplate: string }) => void; onChooseGit: () => void; onChooseDiff: () => void; onCancel: () => void; onSave: () => void; busy: boolean }): React.JSX.Element {
  const validTemplate = !value.path || (value.argumentsTemplate.includes('{left}') && value.argumentsTemplate.includes('{right}'))
  return <div className="modal-backdrop"><section className="preferences-dialog" role="dialog" aria-modal="true" aria-label="P4Git Preferences">
    <div className="modal-title"><Settings size={16} /><strong>Preferences</strong><button onClick={onCancel}><X size={16} /></button></div>
    <div className="preferences-body">
      <fieldset><legend>Git executable</legend><div className="preference-path"><input readOnly value={health.path ?? ''} placeholder="Git has not been configured" /><button onClick={onChooseGit}>Change...</button></div><p>{health.version ?? health.error ?? 'P4Git verifies Git before saving it.'}</p></fieldset>
      <fieldset><legend>External Diff tool</legend><div className="preference-path"><input readOnly value={value.path} placeholder="Not configured — use the built-in Diff Summary" /><button onClick={onChooseDiff}>Browse...</button><button onClick={() => onChange({ path: '', argumentsTemplate: DEFAULT_DIFF_TOOL_ARGUMENTS })} disabled={!value.path}>Disable</button></div><label htmlFor="diff-tool-arguments">Arguments template:</label><textarea id="diff-tool-arguments" value={value.argumentsTemplate} onChange={(event) => onChange({ ...value, argumentsTemplate: event.target.value })} disabled={!value.path} /><p>Placeholders: <code>{'{left}'}</code>, <code>{'{right}'}</code>, <code>{'{leftTitle}'}</code>, <code>{'{rightTitle}'}</code>. Beyond Compare defaults to a separate read-only comparison window.</p>{!validTemplate && <p className="preference-error">The template must contain both {'{left}'} and {'{right}'}.</p>}</fieldset>
    </div>
    <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary-classic" onClick={onSave} disabled={busy || !validTemplate}>{busy && <LoaderCircle className="spin" size={14} />}Save</button></div>
  </section></div>
}

function ChangelistDialog({ value, onChange, onCancel, onSave, busy }: { value: ChangelistEditorState; onChange: (value: ChangelistEditorState) => void; onCancel: () => void; onSave: () => void; busy: boolean }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="changelist-dialog" role="dialog" aria-modal="true" aria-label={value.id ? 'Edit Changelist' : 'New Changelist'}><div className="modal-title"><FileText size={16} /><strong>{value.id ? 'Edit Changelist' : 'New Changelist'}</strong><button onClick={onCancel}><X size={16} /></button></div><div className="modal-body"><label htmlFor="changelist-name">Name:</label><input id="changelist-name" autoFocus maxLength={120} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="Feature or task name" /><label htmlFor="changelist-description">Description:</label><textarea id="changelist-description" maxLength={2000} value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} placeholder="What changes belong in this changelist?" /></div><div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary-classic" onClick={onSave} disabled={!value.name.trim() || busy}>{busy && <LoaderCircle className="spin" size={14} />}{value.id ? 'Save' : 'Create'}</button></div></section></div>
}

function SubmitDialog({ name, staged, message, onMessage, onCancel, onSubmit, busy, conflicts }: { name: string; staged: FileChange[]; message: string; onMessage: (value: string) => void; onCancel: () => void; onSubmit: () => void; busy: boolean; conflicts: boolean }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="submit-dialog" role="dialog" aria-modal="true" aria-label="Submit Changelist"><div className="modal-title"><BrandIcon /><strong>Submit Changelist</strong><button onClick={onCancel}><X size={16} /></button></div><div className="modal-body"><div className="field-row"><label>Changelist:</label><strong>{name}</strong></div><label htmlFor="submit-description">Description:</label><textarea id="submit-description" autoFocus value={message} onChange={(event) => onMessage(event.target.value)} placeholder="Enter a description for this change..." /><div className="submit-files-title"><strong>Files</strong><span>{staged.length} files</span></div><div className="submit-files">{staged.map((change) => <div key={change.path}><i className={`change-mark ${change.kind}`}>{changeCode(change)}</i><span>{change.path}</span><em>{changeLabel(change)}</em></div>)}{staged.length === 0 && <p>No files are ready to submit. Move files into this changelist first.</p>}</div>{conflicts && <div className="modal-warning"><AlertTriangle size={15} />Resolve conflicts before submitting.</div>}</div><div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary-classic" onClick={onSubmit} disabled={!message.trim() || staged.length === 0 || conflicts || busy}>{busy && <LoaderCircle className="spin" size={14} />}Submit</button></div></section></div>
}

function EmptyTable({ text }: { text: string }): React.JSX.Element {
  return <div className="empty-table">{text}</div>
}

function ErrorToast({ message, close }: { message: string; close: () => void }): React.JSX.Element {
  return <div className="error-toast"><AlertTriangle size={17} /><span>{message}</span><button onClick={close}><X size={14} /></button></div>
}

function getMatchCount(tab: MainTab, filter: string, entries: WorkspaceEntry[], changes: FileChange[], commits: CommitInfo[], branches: BranchInfo[], settings: AppSettings, fileHistory: CommitInfo[] = []): number {
  const query = filter.toLowerCase()
  const matches = (value: string): boolean => value.toLowerCase().includes(query)
  if (tab === 'files') return entries.filter((entry) => matches(entry.name)).length
  if (tab === 'history') return fileHistory.filter((commit) => matches(`${commit.shortHash} ${commit.author} ${commit.subject}`)).length
  if (tab === 'pending') return changes.filter((change) => matches(change.path)).length
  if (tab === 'submitted') return commits.filter((commit) => matches(`${commit.shortHash} ${commit.author} ${commit.subject}`)).length
  if (tab === 'stream') return branches.filter((branch) => matches(branch.name)).length
  return settings.recentRepositories.filter(matches).length
}
