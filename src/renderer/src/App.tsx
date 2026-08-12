import {
  AlertTriangle,
  Ban,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Columns3,
  GitCommit,
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
  Lock,
  Minus,
  Monitor,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Unlock,
  Upload,
  X,
  XCircle
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_APPEARANCE, DEFAULT_DIFF_TOOL_ARGUMENTS, DEFAULT_MERGE_TOOL_ARGUMENTS } from '../../shared/types'
import type {
  AppearanceSettings,
  AppSettings,
  BlameLine,
  BranchComparison,
  BranchInfo,
  ChangelistState,
  CommitDetails,
  CommitInfo,
  ContextMenuRequest,
  ExternalDiffRequest,
  FileChange,
  GitHealth,
  GitLabConfig,
  GitLabOverview,
  GraphCommit,
  ConflictFile,
  MenuAction,
  LocalChangelist,
  LfsStatus,
  OperationState,
  PushPreview,
  RemoteInfo,
  ReflogEntry,
  RepositorySummary,
  RevisionFile,
  RevisionResolution,
  StashEntry,
  ShelfInfo,
  TaskProgress,
  WorkspaceEntry
} from '../../shared/types'

type MainTab = 'files' | 'history' | 'pending' | 'submitted' | 'stream' | 'workspaces'
type DetailTab = 'details' | 'files' | 'jobs' | 'diff'
type TreeMode = 'depot' | 'workspace'
type TreeSort = 'name' | 'type' | 'status'

interface PendingSelection {
  change: FileChange
  staged: boolean
  changelistId?: string
}

interface PendingDiffItem extends PendingSelection {
  key: string
  content?: string
  error?: string
}

interface PendingDiffView {
  id: number
  items: PendingDiffItem[]
  activeKey: string
}

interface ChangelistEditorState {
  id?: string
  name: string
  description: string
  moveSelections?: PendingSelection[]
}

interface PreferenceDraft {
  diffPath: string
  diffArguments: string
  mergePath: string
  mergeArguments: string
  appearance: AppearanceSettings
}

interface BranchEditorState {
  source: string
  name: string
}

interface SelectiveMergeEditorState {
  commits: CommitInfo[]
  source?: string
  name: string
  description: string
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

function revisionFileLabel(kind: string): string {
  if (kind === 'A') return 'Added'
  if (kind === 'D') return 'Deleted'
  if (kind === 'R') return 'Renamed'
  if (kind === 'C') return 'Copied'
  return 'Modified'
}

function pendingExternalDiffRequest(repoPath: string, selection: PendingSelection): ExternalDiffRequest {
  const { change, staged } = selection
  return {
    repoPath,
    filePath: change.path,
    left: staged ? { kind: 'git', ref: 'HEAD' } : change.kind === 'untracked' ? { kind: 'empty' } : change.staged ? { kind: 'index' } : { kind: 'git', ref: 'HEAD' },
    right: staged ? { kind: 'index' } : { kind: 'workspace' },
    leftTitle: staged ? 'HEAD' : change.kind === 'untracked' ? 'Empty' : change.staged ? 'Git index' : 'HEAD',
    rightTitle: staged ? 'Git index' : 'Workspace'
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

interface ConflictBlock { start: number; end: number; ours: string; theirs: string }

function conflictBlocks(content: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = []
  const pattern = /^<<<<<<<[^\n]*\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>>[^\n]*(?:\n|$)/gm
  for (const match of content.matchAll(pattern)) blocks.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, ours: match[1], theirs: match[2] })
  return blocks
}

function chooseConflictBlock(content: string, index: number, choice: 'ours' | 'theirs' | 'both'): string {
  const block = conflictBlocks(content)[index]
  if (!block) return content
  const replacement = choice === 'ours' ? block.ours : choice === 'theirs' ? block.theirs : `${block.ours}${block.ours.endsWith('\n') || block.theirs.startsWith('\n') ? '' : '\n'}${block.theirs}`
  return content.slice(0, block.start) + replacement + content.slice(block.end)
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
  const [graph, setGraph] = useState<GraphCommit[]>([])
  const [conflictsView, setConflictsView] = useState<ConflictFile[]>()
  const [gitlabView, setGitlabView] = useState<GitLabOverview>()
  const [gitlabConfig, setGitlabConfig] = useState<GitLabConfig>()
  const [gitlabOpen, setGitlabOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [initOpen, setInitOpen] = useState(false)
  const [remotesOpen, setRemotesOpen] = useState(false)
  const [pushOpen, setPushOpen] = useState(false)
  const [shelvesOpen, setShelvesOpen] = useState(false)
  const [branchComparison, setBranchComparison] = useState<BranchComparison>()
  const [selectiveMergeEditor, setSelectiveMergeEditor] = useState<SelectiveMergeEditorState>()
  const [branchEditor, setBranchEditor] = useState<BranchEditorState>()
  const [operationState, setOperationState] = useState<OperationState>({ conflicts: 0, canContinue: false, canAbort: false })
  const [entriesByPath, setEntriesByPath] = useState<Record<string, WorkspaceEntry[]>>({})
  const [depotEntriesByPath, setDepotEntriesByPath] = useState<Record<string, WorkspaceEntry[]>>({})
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']))
  const [treeMode, setTreeMode] = useState<TreeMode>('workspace')
  const [depotRef, setDepotRef] = useState('HEAD')
  const [currentDirectory, setCurrentDirectory] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceEntry>()
  const [pendingSelection, setPendingSelection] = useState<PendingSelection>()
  const [pendingDiffView, setPendingDiffView] = useState<PendingDiffView>()
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo>()
  const [selectedBranch, setSelectedBranch] = useState<BranchInfo>()
  const [changelistState, setChangelistState] = useState<ChangelistState>({ changelists: [], assignments: {}, shelves: [] })
  const [commitFiles, setCommitFiles] = useState<RevisionFile[]>([])
  const [fileHistoryView, setFileHistoryView] = useState<{ path: string; commits: CommitInfo[]; isDirectory: boolean }>()
  const [timelapseView, setTimelapseView] = useState<{ path: string; lines: BlameLine[] }>()
  const [stashesView, setStashesView] = useState<{ repoPath: string; entries: StashEntry[] }>()
  const [reflogView, setReflogView] = useState<{ repoPath: string; entries: ReflogEntry[] }>()
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [preferenceDraft, setPreferenceDraft] = useState({ diffPath: '', diffArguments: DEFAULT_DIFF_TOOL_ARGUMENTS, mergePath: '', mergeArguments: DEFAULT_MERGE_TOOL_ARGUMENTS, appearance: DEFAULT_APPEARANCE })
  const [revisionRequest, setRevisionRequest] = useState<{ paths: string[]; initial: string }>()
  const [lfsOpen, setLfsOpen] = useState(false)
  const [taskCenterOpen, setTaskCenterOpen] = useState(false)
  const [tasks, setTasks] = useState<TaskProgress[]>([])
  const [mainTab, setMainTab] = useState<MainTab>('submitted')
  const [detailTab, setDetailTab] = useState<DetailTab>('details')
  const [filter, setFilter] = useState('')
  const [filterMode, setFilterMode] = useState<'contains' | 'prefix' | 'regex'>('contains')
  const [filterCaseSensitive, setFilterCaseSensitive] = useState(false)
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false)
  const [treeFilterOpen, setTreeFilterOpen] = useState(false)
  const [treeFilter, setTreeFilter] = useState('')
  const [treeSort, setTreeSort] = useState<TreeSort>('name')
  const [locationDraft, setLocationDraft] = useState('')
  const [locationMenuOpen, setLocationMenuOpen] = useState(false)
  const [bookmarkMenuOpen, setBookmarkMenuOpen] = useState(false)
  const [diff, setDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitChangelist, setSubmitChangelist] = useState<{ id?: string; name: string; paths: string[]; preparePaths?: string[]; changes: FileChange[] }>()
  const [changelistEditor, setChangelistEditor] = useState<ChangelistEditorState>()
  const [commitMessage, setCommitMessage] = useState('')
  const [amendCommit, setAmendCommit] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [logCollapsed, setLogCollapsed] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, time: new Date().toLocaleTimeString(), text: 'P4Git started.', kind: 'success' }
  ])
  const [error, setError] = useState<string>()
  const filterRef = useRef<HTMLInputElement>(null)
  const logId = useRef(2)
  const pendingDiffId = useRef(1)
  const initialized = useRef(false)
  const taskId = useRef(1)

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
    const [nextHistory, nextBranches, nextGraph] = await Promise.all([
      window.p4git.getHistory(root),
      window.p4git.getBranches(root),
      window.p4git.getGraph(root)
    ])
    setHistory(nextHistory)
    setBranches(nextBranches)
    setGraph(nextGraph)
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
      setGitlabConfig(undefined)
      setGitlabView(undefined)
      setCurrentDirectory('')
      setSelectedEntry(undefined)
      setPendingSelection(undefined)
      setSelectedCommit(undefined)
      setFileHistoryView(undefined)
      setChangelistState({ changelists: [], assignments: {}, shelves: [] })
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
        loadChangelists(summary.root),
        window.p4git.getOperationState(summary.root).then(setOperationState)
      ])
      setSettings(await window.p4git.getSettings())
      setLocationDraft(summary.root)
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

  useEffect(() => {
    if (!repository) return
    setLocationDraft(treeMode === 'depot'
      ? `${depotRef}:${currentDirectory ? `/${currentDirectory}` : '/'}`
      : `${repository.root}${currentDirectory ? `\\${currentDirectory.replaceAll('/', '\\')}` : ''}`)
  }, [currentDirectory, depotRef, repository, treeMode])

  useEffect(() => {
    if (!repository || detailTab !== 'jobs' || gitlabView) return
    let active = true
    void (async () => {
      try {
        const config = await window.p4git.getGitLabConfig(repository.root)
        if (!active) return
        setGitlabConfig(config)
        if (config.baseUrl && config.projectPath) {
          const overview = await window.p4git.getGitLabOverview(repository.root)
          if (active) setGitlabView(overview)
        }
      } catch (reason) {
        if (active) appendLog(`GitLab Jobs: ${friendlyError(reason)}`, 'error')
      }
    })()
    return () => { active = false }
  }, [appendLog, detailTab, gitlabView, repository])

  const refresh = useCallback(async () => {
    if (!repository) return
    const [summary, nextOperation] = await Promise.all([
      window.p4git.getStatus(repository.root),
      window.p4git.getOperationState(repository.root),
      treeMode === 'depot'
        ? loadTree(repository.root, depotRef, currentDirectory)
        : loadDirectory(repository.root, currentDirectory),
      loadSupplemental(repository.root),
      loadChangelists(repository.root)
    ])
    setRepository(summary)
    setOperationState(nextOperation)
  }, [currentDirectory, depotRef, loadChangelists, loadDirectory, loadSupplemental, loadTree, repository, treeMode])

  const detectConflicts = useCallback(async (repoPath: string) => {
    const state = await window.p4git.getOperationState(repoPath).catch(() => ({ conflicts: 0, canContinue: false, canAbort: false } as OperationState))
    setOperationState(state)
    if (state.conflicts > 0) {
      const conflicts = await window.p4git.getConflicts(repoPath)
      if (conflicts.length) setConflictsView(conflicts)
    }
  }, [])

  const beginTask = useCallback((label: string, command: string): string => {
    const id = `task-${Date.now()}-${taskId.current++}`
    setTasks((current) => [{ id, label, command, state: 'running' as const, startedAt: new Date().toISOString() }, ...current].slice(0, 100))
    return id
  }, [])

  const finishTask = useCallback((id: string, state: TaskProgress['state'], message: string) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, state, progress: state === 'succeeded' ? 100 : task.progress, finishedAt: new Date().toISOString(), message } : task))
  }, [])

  const perform = useCallback(async (
    label: string,
    command: string,
    action: () => Promise<unknown>,
    success: string,
    refreshAfter = true
  ) => {
    const task = beginTask(label, command)
    setBusy(label)
    setError(undefined)
    appendLog(command, 'command')
    try {
      await action()
      if (refreshAfter) await refresh()
      appendLog(success, 'success')
      finishTask(task, 'succeeded', success)
      return true
    } catch (reason) {
      const message = friendlyError(reason)
      if (refreshAfter) await refresh().catch(() => undefined)
      if (repository) await detectConflicts(repository.root)
      setError(message)
      appendLog(message, 'error')
      finishTask(task, /cancel/i.test(message) ? 'cancelled' : 'failed', message)
      return false
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, beginTask, detectConflicts, finishTask, refresh, repository])

  const performGitAt = useCallback(async (
    repoPath: string,
    label: string,
    command: string,
    action: () => Promise<unknown>,
    success: string
  ) => {
    const fullCommand = `git -C "${repoPath}" ${command}`
    const task = beginTask(label, fullCommand)
    setBusy(label)
    setError(undefined)
    appendLog(`git -C "${repoPath}" ${command}`, 'command')
    try {
      await action()
      if (repository && repository.root.toLowerCase() === repoPath.toLowerCase()) await refresh()
      appendLog(success, 'success')
      finishTask(task, 'succeeded', success)
      return true
    } catch (reason) {
      const message = friendlyError(reason)
      if (repository && repository.root.toLowerCase() === repoPath.toLowerCase()) await refresh().catch(() => undefined)
      await detectConflicts(repoPath)
      setError(message)
      appendLog(message, 'error')
      finishTask(task, /cancel/i.test(message) ? 'cancelled' : 'failed', message)
      return false
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, beginTask, detectConflicts, finishTask, refresh, repository])

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
    const selection = { change, staged: stagedVersion, changelistId }
    setPendingSelection(selection)
    if (!change.conflicted) {
      const launched = await launchConfiguredDiff(pendingExternalDiffRequest(repository.root, selection))
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

  const showPendingDiffs = useCallback(async (selections: PendingSelection[]) => {
    if (!repository) return
    const unique = [...new Map(selections.map((selection) => [`${selection.staged ? 'index' : 'workspace'}\0${selection.change.path}`, selection])).entries()]
      .map(([key, selection]) => ({ key, ...selection }))
    if (unique.length <= 1) {
      const selection = unique[0]
      if (selection) await showDiff(selection.change, selection.staged, selection.changelistId)
      return
    }
    setPendingSelection(unique[0])
    let builtIn = unique
    if (settings.diffToolPath) {
      const fallback: typeof unique = []
      for (const selection of unique) {
        if (selection.change.conflicted || !await launchConfiguredDiff(pendingExternalDiffRequest(repository.root, selection))) fallback.push(selection)
      }
      if (!fallback.length) {
        appendLog(`Opened ${unique.length} selected files in the configured external Diff tool.`, 'success')
        return
      }
      builtIn = fallback
    }
    const id = pendingDiffId.current++
    const items: PendingDiffItem[] = builtIn.map((selection) => ({ ...selection }))
    setPendingDiffView({ id, items, activeKey: items[0].key })
    appendLog(`Loading Diff for ${items.length} selected file(s).`)
    await Promise.all(items.map(async (item) => {
      try {
        const content = await window.p4git.getDiff({
          repoPath: repository.root,
          filePath: item.change.path,
          staged: item.staged,
          untracked: item.change.kind === 'untracked'
        })
        setPendingDiffView((current) => current?.id === id ? {
          ...current,
          items: current.items.map((candidate) => candidate.key === item.key ? { ...candidate, content: content || 'No textual differences to display.' } : candidate)
        } : current)
      } catch (reason) {
        const message = friendlyError(reason)
        setPendingDiffView((current) => current?.id === id ? {
          ...current,
          items: current.items.map((candidate) => candidate.key === item.key ? { ...candidate, error: message } : candidate)
        } : current)
      }
    }))
  }, [appendLog, launchConfiguredDiff, repository, settings.diffToolPath, showDiff])

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
    setPreferenceDraft({
      diffPath: settings.diffToolPath ?? '',
      diffArguments: settings.diffToolArguments ?? DEFAULT_DIFF_TOOL_ARGUMENTS,
      mergePath: settings.mergeToolPath ?? '',
      mergeArguments: settings.mergeToolArguments ?? DEFAULT_MERGE_TOOL_ARGUMENTS,
      appearance: settings.appearance ?? DEFAULT_APPEARANCE
    })
    setPreferencesOpen(true)
  }, [settings])

  const chooseDiffTool = useCallback(async () => {
    const executable = await window.p4git.chooseDiffExecutable()
    if (executable) setPreferenceDraft((current) => ({ ...current, diffPath: executable }))
  }, [])

  const chooseMergeTool = useCallback(async () => {
    const executable = await window.p4git.chooseDiffExecutable()
    if (executable) setPreferenceDraft((current) => ({ ...current, mergePath: executable }))
  }, [])

  const savePreferences = useCallback(async () => {
    setBusy('preferences')
    setError(undefined)
    try {
      const next = await window.p4git.savePreferences(preferenceDraft.diffPath || undefined, preferenceDraft.diffArguments, preferenceDraft.mergePath || undefined, preferenceDraft.mergeArguments, preferenceDraft.appearance)
      setSettings(next)
      setPreferencesOpen(false)
      appendLog(next.diffToolPath ? `External Diff configured: ${next.diffToolPath}` : 'External Diff disabled; using the built-in Diff Summary.', 'success')
    } catch (reason) {
      setError(friendlyError(reason))
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, preferenceDraft])

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

  const synchronizeRepository = useCallback(async (repoPath: string) => {
    setBusy('pull')
    setError(undefined)
    appendLog(`git -C "${repoPath}" fetch --all --prune`, 'command')
    try {
      const result = await window.p4git.pull(repoPath)
      if (result.outcome === 'diverged') {
        appendLog(`Branch diverged from ${result.upstream}: ${result.ahead} local / ${result.behind} remote commit(s).`, 'command')
        const strategy = await window.p4git.chooseDivergenceStrategy(result)
        if (strategy === 'cancel') {
          appendLog('Get Latest cancelled; no local history was changed.', 'success')
        } else {
          appendLog(`git -C "${repoPath}" ${strategy} ${result.upstream}`, 'command')
          if (strategy === 'merge') await window.p4git.merge(repoPath, result.upstream)
          else await window.p4git.rebase(repoPath, result.upstream)
          appendLog(`${strategy === 'merge' ? 'Merged' : 'Rebased onto'} ${result.upstream}.`, 'success')
        }
      } else if (result.outcome === 'fast-forwarded') {
        appendLog(`Workspace fast-forwarded by ${result.behind} commit(s) from ${result.upstream}.`, 'success')
      } else if (result.outcome === 'ahead') {
        appendLog(`Workspace already contains the latest remote revision and is ${result.ahead} commit(s) ahead.`, 'success')
      } else {
        appendLog('Workspace is already up to date.', 'success')
      }
      if (repository?.root.toLowerCase() === repoPath.toLowerCase()) await refresh()
      return true
    } catch (reason) {
      const message = friendlyError(reason)
      if (repository?.root.toLowerCase() === repoPath.toLowerCase()) await refresh().catch(() => undefined)
      await detectConflicts(repoPath)
      setError(message)
      appendLog(message, 'error')
      return false
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, detectConflicts, refresh, repository?.root])

  const getLatest = useCallback(async () => {
    if (repository) await synchronizeRepository(repository.root)
  }, [repository, synchronizeRepository])

  const push = useCallback(async () => {
    if (!repository) return
    await perform('push', 'git push', () => window.p4git.push(repository.root), 'Local commits pushed.')
  }, [perform, repository])

  const fetchRemote = useCallback(async () => {
    if (!repository) return
    if (busy) {
      appendLog(`Cannot start Fetch while ${busy} is still running.`, 'error')
      return
    }
    await perform('fetch', 'git fetch --all --prune', () => window.p4git.fetch(repository.root), 'Remote references refreshed.')
  }, [appendLog, busy, perform, repository])

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

  const diffCommitFileAgainstWorkspace = useCallback(async (commit: CommitInfo, file: RevisionFile): Promise<string | undefined> => {
    if (!repository) return undefined
    const ref = file.kind === 'D' ? `${commit.hash}^` : commit.hash
    const launched = await launchConfiguredDiff({
      repoPath: repository.root,
      filePath: file.path,
      left: { kind: 'git', ref },
      right: { kind: 'workspace' },
      leftTitle: file.kind === 'D' ? `${commit.shortHash} parent (before delete)` : commit.shortHash,
      rightTitle: 'Local workspace'
    })
    if (launched) return undefined
    const content = await window.p4git.getDiff({ repoPath: repository.root, filePath: file.path, staged: false, baseRef: ref })
    return content || 'No textual differences. The file may be binary or identical to the local workspace.'
  }, [launchConfiguredDiff, repository])

  const handleHistoryContext = useCallback(async (commit: CommitInfo) => {
    if (!repository || !fileHistoryView) return
    setSelectedCommit(commit)
    const action = await window.p4git.showContextMenu({ kind: 'history-revision' })
    if (action === 'get-revision') {
      setRevisionRequest({ paths: [fileHistoryView.path], initial: commit.hash })
    } else if (action === 'diff-previous') {
      await showHistoryDiff(commit)
    } else if (action === 'diff-head') {
      await showHistoryDiff(commit, 'HEAD')
    } else if (action === 'show-submitted') {
      setMainTab('submitted')
      setDetailTab('details')
    } else if (action === 'copy-hash') {
      await copyText(commit.hash)
    } else if (action === 'revert-commit') {
      await revertCommit(commit)
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
    const remote = branches.find((branch) => branch.name === ref)?.remote
    const baseName = remote && ref.includes('/') ? ref.slice(ref.indexOf('/') + 1) : ''
    const suggested = baseName && branches.some((branch) => !branch.remote && branch.name === baseName) ? `${baseName}-work` : baseName
    setBranchEditor({ source: ref, name: suggested })
  }, [branches, repository])

  const saveBranch = useCallback(async () => {
    if (!repository || !branchEditor?.name.trim()) return
    const name = branchEditor.name.trim()
    const success = await perform('branch', `git switch -c ${name} ${branchEditor.source}`, () => window.p4git.checkout({ repoPath: repository.root, branch: name, create: true, startPoint: branchEditor.source }), `Created and switched to ${name} from ${branchEditor.source}.`)
    if (success) setBranchEditor(undefined)
  }, [branchEditor, perform, repository])

  const abortGitOperation = useCallback(async (operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert') => {
    if (!repository || !window.confirm(`Abort the current Git ${operation} operation?`)) return
    await performGitAt(repository.root, `git-abort-${operation}`, `${operation} --abort`, () => window.p4git.abort(repository.root, operation), `Aborted Git ${operation}.`)
  }, [performGitAt, repository])

  const openConflicts = useCallback(async () => {
    if (!repository) return
    setBusy('conflicts')
    try {
      const conflicts = await window.p4git.getConflicts(repository.root)
      if (!conflicts.length) setError('当前 Workspace 没有需要解决的冲突。')
      else setConflictsView(conflicts)
    } catch (reason) { setError(friendlyError(reason)) }
    finally { setBusy(undefined) }
  }, [repository])

  const openGitLab = useCallback(async () => {
    if (!repository) return
    setBusy('gitlab')
    setGitlabOpen(true)
    try {
      const config = await window.p4git.getGitLabConfig(repository.root)
      setGitlabConfig(config)
      if (config.baseUrl && config.projectPath) setGitlabView(await window.p4git.getGitLabOverview(repository.root))
    } catch (reason) { setError(friendlyError(reason)) }
    finally { setBusy(undefined) }
  }, [repository])

  const openLfsLocks = useCallback(() => {
    if (repository) setLfsOpen(true)
  }, [repository])

  const changeLfsLocks = useCallback(async (paths: string[], lock: boolean) => {
    if (!repository || !paths.length) return
    await perform(lock ? 'lfs-lock' : 'lfs-unlock', `git lfs ${lock ? 'lock' : 'unlock'} -- ${paths.join(' ')}`, () => lock ? window.p4git.lockLfsFiles(repository.root, paths) : window.p4git.unlockLfsFiles(repository.root, paths), `${lock ? 'Locked' : 'Unlocked'} ${paths.length} file(s) with Git LFS.`)
  }, [perform, repository])

  const revertCommit = useCallback(async (commit = selectedCommit) => {
    if (!repository || !commit) return
    if (!window.confirm(`Revert commit ${commit.shortHash}?\n\nThis creates a new commit that undoes its changes. Existing history is preserved.`)) return
    await performGitAt(repository.root, 'git-revert-commit', `revert --no-edit ${commit.hash}`, () => window.p4git.revertCommits(repository.root, [commit.hash]), `Reverted ${commit.shortHash} with a new commit.`)
  }, [performGitAt, repository, selectedCommit])

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
    setRevisionRequest({ paths: [entry.path || '.'], initial: ref })
  }, [depotRef, repository])

  const handleEntryContext = useCallback(async (entry: WorkspaceEntry, source: TreeMode, selectedEntries: WorkspaceEntry[] = [entry]) => {
    if (!repository) return
    setSelectedEntry(entry)
    const change = repository.changes.find((item) => item.path === entry.path)
    const selectedPaths = [...new Set(selectedEntries.map((item) => item.path).filter(Boolean))]
    const selectedChanges = repository.changes.filter((item) => selectedPaths.includes(item.path))
    const relatedChanges = selectedEntries.length > 1 ? selectedChanges : entry.isDirectory
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
      ,multiple: selectedEntries.length > 1
    }
    const action = await window.p4git.showContextMenu(request)
    if (!action) return
    const selectedPending = selectedChanges.map((item) => ({ change: item, staged: item.staged && !item.unstaged, changelistId: changelistState.assignments[item.path] }))
    if (action.startsWith('move-changelist:') && selectedPending.length) {
      const target = action.slice('move-changelist:'.length)
      await moveChangesToChangelist(selectedPending, target === '__default__' ? undefined : target)
      return
    }
    if (action === 'new-changelist-with-selection' && selectedPending.length) {
      openNewChangelist(selectedPending)
      return
    }
    if (!entry.path) {
      if (action === 'get-latest') {
        if (source === 'workspace') await getLatest()
        else setRevisionRequest({ paths: ['.'], initial: depotRef })
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
      case 'get-latest': selectedEntries.length > 1 ? setRevisionRequest({ paths: selectedPaths, initial: source === 'depot' ? depotRef : repository.upstream ?? 'HEAD' }) : await getEntryRevision(entry, source); break
      case 'checkout': await checkoutSelected(false, entry.path, source); break
      case 'checkout-open': await checkoutSelected(true, entry.path, source); break
      case 'add': if (selectedChanges.length) await perform('stage', `git add -- ${selectedPaths.join(' ')}`, () => window.p4git.stage(repository.root, selectedPaths), `Added ${selectedPaths.length} file(s).`); break
      case 'delete': await perform('delete', `git rm -- ${selectedPaths.join(' ')}`, () => window.p4git.markDelete(repository.root, selectedPaths), `Marked ${selectedPaths.length} file(s) for delete.`); break
      case 'revert': if (selectedChanges.length && window.confirm(`Revert ${selectedPaths.length} selected file(s)?`)) await perform('revert', `git restore -- ${selectedPaths.join(' ')}`, () => window.p4git.revert(repository.root, selectedPaths), `Reverted ${selectedPaths.length} file(s).`); break
      case 'diff': change ? await showDiff(change, change.staged && !change.unstaged) : await showPathDiff(entry.path, source === 'depot' ? depotRef : repository.upstream ?? 'HEAD'); break
      case 'file-history': await showFileHistory(entry.path, entry.isDirectory); break
      case 'timelapse': await showTimelapse(entry.path, source === 'depot' ? depotRef : 'HEAD'); break
      case 'show-workspace': await focusPath(entry, 'workspace'); break
      case 'show-depot': await focusPath(entry, 'depot'); break
      case 'show-explorer': await window.p4git.revealPath(repository.root, entry.path); break
      case 'copy-path': await copyText(source === 'depot' ? `${depotRef}:${entry.path}` : `${repository.root}\\${entry.path.replaceAll('/', '\\')}`); break
      case 'git-stage': if (selectedChanges.length) await perform('stage', `git add -- ${selectedPaths.join(' ')}`, () => window.p4git.stage(repository.root, selectedPaths), `Staged ${selectedPaths.length} file(s).`); break
      case 'git-unstage': if (selectedChanges.length) await perform('unstage', `git restore --staged -- ${selectedPaths.join(' ')}`, () => window.p4git.unstage(repository.root, selectedPaths), `Unstaged ${selectedPaths.length} file(s).`); break
      case 'git-stash-path': await stashChanges(repository.root, selectedPaths.length ? selectedPaths : undefined); break
      case 'git-branch-from-ref': await createBranchFromRef(depotRef); break
      case 'lfs-lock': await changeLfsLocks(selectedPaths, true); break
      case 'lfs-unlock': await changeLfsLocks(selectedPaths, false); break
      case 'lfs-locks': openLfsLocks(); break
    }
  }, [changelistState.assignments, changelistState.changelists, changeLfsLocks, checkoutSelected, copyText, createBranchFromRef, depotRef, focusPath, getEntryRevision, getLatest, moveChangesToChangelist, openLfsLocks, openNewChangelist, perform, repository, showDiff, showFileHistory, showPathDiff, showTimelapse, stashChanges])

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
      case 'revert': {
        const paths = [...new Set(effectiveSelections.map((selection) => selection.change.path))]
        if (window.confirm(`Revert ${paths.length} selected file(s)?\n\nTracked content is restored; never-added untracked files remain on disk.`)) await perform('revert', `git restore -- ${paths.join(' ')}`, () => window.p4git.revert(repository.root, paths), `Reverted ${paths.length} file(s).`)
        break
      }
      case 'diff': await showPendingDiffs(effectiveSelections); break
      case 'file-history': await showFileHistory(change.path); break
      case 'timelapse': await showTimelapse(change.path); break
      case 'show-workspace': await focusPath({ name: parts(change.path).name, path: change.path, isDirectory: false, tracked: change.kind !== 'untracked' }, 'workspace'); break
      case 'copy-path': await copyText(`${repository.root}\\${change.path.replaceAll('/', '\\')}`); break
      case 'git-stage': await moveChangesToReady(effectiveSelections); break
      case 'git-unstage': await moveChangesToChangelist(effectiveSelections); break
      case 'git-stash-path': await stashChanges(repository.root, [...new Set(effectiveSelections.map((selection) => selection.change.path))]); break
      case 'lfs-lock': await changeLfsLocks([...new Set(effectiveSelections.map((selection) => selection.change.path))], true); break
      case 'lfs-unlock': await changeLfsLocks([...new Set(effectiveSelections.map((selection) => selection.change.path))], false); break
      case 'lfs-locks': openLfsLocks(); break
    }
  }, [changelistState.changelists, changeLfsLocks, copyText, focusPath, moveChangesToChangelist, moveChangesToReady, openLfsLocks, openNewChangelist, openSubmitForChangelist, perform, repository, showFileHistory, showPendingDiffs, showTimelapse, stashChanges])

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
    } else if (action === 'shelve-changelist') {
      const changelist = changelistState.changelists.find((item) => item.id === id)
      const paths = [...new Set(rows.map((change) => change.path))]
      if (window.confirm(`Shelve ${paths.length} file(s) from ${name}?\n\nThe changes will leave the workspace and can be restored from Tools > Git > View Shelves.`)) {
        const next = await window.p4git.shelveChangelist(repository.root, changelist?.id, name, changelist?.description ?? '', paths)
        setChangelistState(next)
        await refresh()
        appendLog(`Shelved ${name} (${paths.length} files).`, 'success')
      }
    } else if (action === 'delete-changelist') {
      const changelist = changelistState.changelists.find((item) => item.id === id)
      if (changelist) await deleteLocalChangelist(changelist)
    }
  }, [appendLog, changelistState.changelists, deleteLocalChangelist, openNewChangelist, openSubmitForChangelist, performGitAt, refresh, repository])

  const openSelectiveMerge = useCallback(async (commits: CommitInfo[], source?: string): Promise<boolean> => {
    if (!repository || !commits.length) return false
    const ordered = [...commits].sort((left, right) => left.date.localeCompare(right.date))
    const inferredSource = source ?? ordered.flatMap((commit) => commit.refs).find(Boolean)
    setSelectiveMergeEditor({
      commits: ordered,
      source: inferredSource,
      name: inferredSource ? `Merge from ${inferredSource}` : `Selected commits ${new Date().toLocaleDateString()}`,
      description: `Apply ${ordered.length} selected commit(s) into ${repository.branch} without committing.\n${ordered.map((commit) => `${commit.shortHash} ${commit.subject}`).join('\n')}`
    })
    setBranchComparison(undefined)
    return true
  }, [repository])

  const runSelectiveMerge = useCallback(async (): Promise<void> => {
    if (!repository || !selectiveMergeEditor?.name.trim()) return
    let result: Awaited<ReturnType<typeof window.p4git.selectiveMergeCommits>> | undefined
    const commits = selectiveMergeEditor.commits
    const success = await performGitAt(
      repository.root,
      'selective-merge',
      `cherry-pick --no-commit ${commits.map((commit) => commit.hash).join(' ')}`,
      async () => { result = await window.p4git.selectiveMergeCommits({ repoPath: repository.root, refs: commits.map((commit) => commit.hash), changelistName: selectiveMergeEditor.name, description: selectiveMergeEditor.description }) },
      `Started a selective merge of ${commits.length} commit(s) into a local Changelist without committing.`
    )
    if (!success || !result) return
    setChangelistState(result.state)
    setSelectiveMergeEditor(undefined)
    setMainTab('pending')
    if (result.conflicted) {
      const conflicts = await window.p4git.getConflicts(repository.root)
      setConflictsView(conflicts)
      appendLog(`Selective merge paused after ${result.applied}/${result.total} commit(s); resolve ${conflicts.length} conflict file(s), then Continue.`, 'error')
    } else {
      appendLog(`${result.paths.length} merged file(s) are in changelist ${result.changelist.name}; no Git commit was created.`, 'success')
    }
  }, [appendLog, performGitAt, repository, selectiveMergeEditor])

  const handleCommitContext = useCallback(async (commit: CommitInfo, selectedCommits: CommitInfo[] = [commit]) => {
    if (!repository) return
    setSelectedCommit(commit)
    const action = await window.p4git.showContextMenu({ kind: 'submitted-change', multiple: selectedCommits.length > 1 })
    if (action === 'commit-files') {
      setCommitFiles(await window.p4git.getCommitFiles(repository.root, commit.hash))
      setDetailTab('files')
    } else if (action === 'commit-diff') {
      setDiffLoading(true)
      setDetailTab('diff')
      try { setDiff(await window.p4git.getCommitDiff(repository.root, commit.hash)) }
      finally { setDiffLoading(false) }
    } else if (action === 'copy-hash') {
      await copyText(selectedCommits.map((item) => item.hash).join('\n'))
    } else if (action === 'revert-commit') {
      if (selectedCommits.length === 1) await revertCommit(commit)
      else if (window.confirm(`Revert ${selectedCommits.length} selected commits?\n\nNew commits will be created; existing history is preserved.`)) await performGitAt(repository.root, 'git-revert-commit', `revert --no-edit ${selectedCommits.map((item) => item.hash).join(' ')}`, () => window.p4git.revertCommits(repository.root, selectedCommits.map((item) => item.hash)), `Reverted ${selectedCommits.length} commits.`)
    } else if (action === 'git-cherry-pick') {
      await openSelectiveMerge(selectedCommits)
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
  }, [copyText, createBranchFromRef, createTagAt, openSelectiveMerge, performGitAt, repository, revertCommit])

  const handleBranchContext = useCallback(async (branch: BranchInfo) => {
    if (!repository) return
    setSelectedBranch(branch)
    const action = await window.p4git.showContextMenu({ kind: 'branch', current: branch.current, remote: branch.remote })
    if (action === 'switch-branch') {
      await perform('checkout', `git switch ${branch.name}`, () => window.p4git.checkout({ repoPath: repository.root, branch: branch.name }), `Switched to ${branch.name}.`)
    } else if (action === 'new-branch') {
      await createBranchFromRef(branch.name)
    } else if (action === 'copy-path') {
      await copyText(branch.name)
    } else if (action === 'git-merge') {
      await mergeRef(branch.name)
    } else if (action === 'git-rebase') {
      await rebaseOnto(branch.name)
    } else if (action === 'git-tag') {
      await createTagAt(branch.name)
    } else if (action === 'git-compare-branch') {
      setBranchComparison(await window.p4git.compareBranch(repository.root, branch.name))
    } else if (action === 'git-rename-branch') {
      const name = window.prompt(`Rename ${branch.name} to:`, branch.name)?.trim()
      if (name && name !== branch.name) await performGitAt(repository.root, 'git-rename-branch', `branch -m ${branch.name} ${name}`, () => window.p4git.renameBranch(repository.root, branch.name, name), `Renamed ${branch.name} to ${name}.`)
    } else if (action === 'git-delete-branch') {
      if (window.confirm(`Delete local branch ${branch.name}?\n\nGit will refuse if the branch is not fully merged.`)) {
        await performGitAt(repository.root, 'git-delete-branch', `branch -d -- ${branch.name}`, () => window.p4git.deleteBranch(repository.root, branch.name), `Deleted branch ${branch.name}.`)
      }
    }
  }, [copyText, createBranchFromRef, createTagAt, mergeRef, perform, performGitAt, rebaseOnto, repository])

  const amendLastCommit = useCallback(async () => {
    if (!repository || !history[0]) return
    setAmendCommit(true)
    setCommitMessage(history[0].subject)
    setSubmitChangelist({ name: 'Amend last commit', paths: staged.map((change) => change.path), changes: staged })
    setSubmitOpen(true)
  }, [history, repository, staged])

  const handleWorkspaceContext = useCallback(async (path: string) => {
    if (!repository) return
    const action = await window.p4git.showContextMenu({ kind: 'workspace', current: path === repository.root })
    if (action === 'open-workspace') await openRepository(path)
    else if (action === 'show-explorer') await window.p4git.revealRepository(path)
    else if (action === 'copy-path') await copyText(path)
    else if (action === 'git-fetch') await performGitAt(path, 'git-fetch', 'fetch --all --prune', () => window.p4git.fetch(path), `Fetched ${path}.`)
    else if (action === 'git-pull') await synchronizeRepository(path)
    else if (action === 'git-push') await performGitAt(path, 'git-push', 'push', () => window.p4git.push(path), `Pushed ${path}.`)
    else if (action === 'git-stash') await stashChanges(path)
    else if (action === 'git-stashes') await showStashes(path)
    else if (action === 'git-reflog') await showReflog(path)
  }, [copyText, openRepository, performGitAt, repository, showReflog, showStashes, stashChanges, synchronizeRepository])

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
      case 'push': setPushOpen(true); break
      case 'settings': openPreferences(); break
      case 'about': window.alert('P4Git 0.6.1\nA P4V-style desktop workflow for Git.\nMIT License'); break
      case 'git-stash': void stashChanges(); break
      case 'git-stash-pop': if (repository && window.confirm('Pop the latest Git stash into the current workspace?')) void performGitAt(repository.root, 'git-stash-pop', 'stash pop stash@{0}', () => window.p4git.applyStash(repository.root, 'stash@{0}', true), 'Popped the latest Git stash.'); break
      case 'git-stashes': void showStashes(); break
      case 'git-shelves': setShelvesOpen(true); break
      case 'git-remotes': setRemotesOpen(true); break
      case 'git-amend': void amendLastCommit(); break
      case 'git-reflog': void showReflog(); break
      case 'gitlab': void openGitLab(); break
      case 'resolve-conflicts': void openConflicts(); break
      case 'lfs-locks': openLfsLocks(); break
      case 'clone': setCloneOpen(true); break
      case 'init': setInitOpen(true); break
      case 'git-merge': void mergeRef(); break
      case 'git-rebase': void rebaseOnto(); break
      case 'git-tag': void createTagAt(); break
      case 'git-abort-merge': void abortGitOperation('merge'); break
      case 'git-abort-rebase': void abortGitOperation('rebase'); break
      case 'git-abort-cherry-pick': void abortGitOperation('cherry-pick'); break
      case 'git-abort-revert': void abortGitOperation('revert'); break
    }
  }, [abortGitOperation, amendLastCommit, checkoutSelected, chooseRepository, createTagAt, deleteSelected, depotRef, fetchRemote, getLatest, mergeRef, openConflicts, openGitLab, openLfsLocks, openNewChangelist, openPreferences, openSelectedSubmit, perform, performGitAt, rebaseOnto, refresh, repository, revertSelected, selectedPath, showReflog, showSelectedDiff, showSelectedHistory, showStashes, showTimelapse, stageSelected, stashChanges, treeMode])

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

  function displayedLocation(): string {
    if (!repository) return ''
    return treeMode === 'depot'
      ? `${depotRef}:${currentDirectory ? `/${currentDirectory}` : '/'}`
      : `${repository.root}${currentDirectory ? `\\${currentDirectory.replaceAll('/', '\\')}` : ''}`
  }

  async function saveNavigation(nextBookmarks: string[], nextHistory: string[]): Promise<void> {
    setSettings(await window.p4git.saveNavigation(nextBookmarks, nextHistory))
  }

  async function navigateLocation(value: string): Promise<void> {
    if (!repository) return
    const target = value.trim()
    try {
      let selectedDirectory = ''
      if (target.includes(':/') && !/^[A-Za-z]:[\\/]/.test(target)) {
        const separator = target.indexOf(':')
        const ref = target.slice(0, separator)
        const directory = target.slice(separator + 1).replace(/^[/\\]+/, '').replaceAll('\\', '/')
        selectedDirectory = directory
        setTreeMode('depot')
        if (ref !== depotRef) await changeDepotRef(ref)
        setCurrentDirectory(directory)
        await loadTree(repository.root, ref, directory)
      } else {
        const normalizedRoot = repository.root.replaceAll('\\', '/').replace(/\/$/, '')
        const normalized = target.replaceAll('\\', '/')
        if (normalized.toLowerCase() !== normalizedRoot.toLowerCase() && !normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
          throw new Error('地址不在当前 Workspace 中。')
        }
        const directory = normalized.slice(normalizedRoot.length).replace(/^\//, '')
        selectedDirectory = directory
        setTreeMode('workspace')
        setCurrentDirectory(directory)
        await loadDirectory(repository.root, directory)
      }
      const components = selectedDirectory.split('/').filter(Boolean)
      setExpandedPaths(new Set(['', ...components.map((_part, index) => components.slice(0, index + 1).join('/'))]))
      setSelectedEntry(undefined)
      setMainTab('files')
      setLocationDraft(target)
      const history = [target, ...(settings.locationHistory ?? []).filter((item) => item !== target)].slice(0, 20)
      await saveNavigation(settings.bookmarks ?? [], history)
    } catch (reason) {
      setError(friendlyError(reason))
    }
  }

  async function toggleBookmark(): Promise<void> {
    const location = displayedLocation()
    const current = settings.bookmarks ?? []
    const next = current.includes(location) ? current.filter((item) => item !== location) : [location, ...current].slice(0, 50)
    await saveNavigation(next, settings.locationHistory ?? [])
    appendLog(`${current.includes(location) ? 'Removed bookmark' : 'Bookmarked'}: ${location}`, 'success')
  }

  async function submitCommit(): Promise<void> {
    const submitChanges = submitChangelist?.changes ?? staged
    if (!repository || !commitMessage.trim() || (!amendCommit && submitChanges.length === 0)) return
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
    const success = await perform('commit', `git commit ${amendCommit ? '--amend ' : ''}-m "${commitMessage.trim()}"`, () => window.p4git.commit(repository.root, commitMessage, amendCommit), amendCommit ? 'Last commit amended.' : `${submitChangelist?.name ?? 'Ready to submit'} submitted as a local Git commit.`)
    if (!success) return
    setChangelistState(await window.p4git.assignChangelist(repository.root, committedPaths))
    setCommitMessage('')
    setAmendCommit(false)
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
          <div className="dialog-footer"><button onClick={() => setInitOpen(true)} disabled={!health.available || Boolean(busy)}>Init...</button><button onClick={() => setCloneOpen(true)} disabled={!health.available || Boolean(busy)}>Clone...</button><button onClick={() => void chooseRepository()} disabled={!health.available || Boolean(busy)}>{busy ? <LoaderCircle className="spin" size={15} /> : null}Open Workspace</button></div>
        </section>
        {cloneOpen && <CloneDialog onClose={() => setCloneOpen(false)} onComplete={(path) => { setCloneOpen(false); void openRepository(path) }} />}
        {initOpen && <InitDialog onClose={() => setInitOpen(false)} onComplete={(path) => { setInitOpen(false); void openRepository(path) }} />}
        {error && <ErrorToast message={error} close={() => setError(undefined)} />}
      </main>
    )
  }

  const rawEntriesByPath = treeMode === 'depot' ? depotEntriesByPath : entriesByPath
  const activeEntriesByPath = Object.fromEntries(Object.entries(rawEntriesByPath).map(([path, entries]) => [path, [...entries]
    .filter((entry) => entry.name.toLowerCase().includes(treeFilter.toLowerCase()))
    .sort((left, right) => {
      if (treeSort === 'type' && left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
      if (treeSort === 'status') {
        const leftChanged = repository.changes.some((change) => change.path === left.path || change.path.startsWith(`${left.path}/`))
        const rightChanged = repository.changes.some((change) => change.path === right.path || change.path.startsWith(`${right.path}/`))
        if (leftChanged !== rightChanged) return leftChanged ? -1 : 1
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })]))
  const activeEntries = activeEntriesByPath[currentDirectory] ?? []
  const appliedFilter = `${filterCaseSensitive ? 'case:' : 'nocase:'}${filterMode}:${filter}`
  const canCheckout = Boolean(selectedPath && !selectedEntry?.isDirectory && (selectedEntry?.tracked || selectedChange?.kind !== 'untracked'))
  const canAdd = Boolean(selectedChange?.unstaged && selectedChange.kind === 'untracked')
  const canDelete = Boolean(treeMode === 'workspace' && selectedPath && !selectedEntry?.isDirectory && (selectedEntry?.tracked || selectedChange?.kind === 'deleted'))
  const canRevert = Boolean(selectedChange && !(selectedChange.kind === 'untracked' && !selectedChange.staged))
  const canDiff = Boolean(selectedPath && !selectedEntry?.isDirectory && (selectedEntry?.tracked || selectedChange))
  const appearance = settings.appearance ?? DEFAULT_APPEARANCE
  const persistAppearance = (next: AppearanceSettings): void => {
    setSettings((current) => ({ ...current, appearance: next }))
    void window.p4git.savePreferences(settings.diffToolPath, settings.diffToolArguments, settings.mergeToolPath, settings.mergeToolArguments, next).then(setSettings).catch((reason) => setError(friendlyError(reason)))
  }
  const resizeLayout = (field: 'workspacePaneWidth' | 'detailPaneHeight' | 'logPaneHeight', event: React.PointerEvent): void => {
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const start = appearance[field]
    let latest = start
    const move = (pointer: PointerEvent): void => {
      const delta = field === 'workspacePaneWidth' ? pointer.clientX - startX : startY - pointer.clientY
      const limits = field === 'workspacePaneWidth' ? [180, 650] : field === 'detailPaneHeight' ? [100, 600] : [80, 500]
      latest = Math.min(limits[1], Math.max(limits[0], start + delta))
      setSettings((current) => ({ ...current, appearance: { ...(current.appearance ?? DEFAULT_APPEARANCE), [field]: latest } }))
    }
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); persistAppearance({ ...(settings.appearance ?? appearance), [field]: latest }) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  return (
    <main className={`p4v-shell theme-${appearance.theme} density-${appearance.density} ${appearance.showToolbarLabels ? '' : 'toolbar-icons-only'} ${logCollapsed ? 'log-collapsed' : ''}`} style={{ fontSize: `${12 * appearance.fontScale}px`, gridTemplateRows: logCollapsed ? '72px 29px minmax(240px, 1fr) 0 26px 22px' : `72px 29px minmax(240px, 1fr) 4px ${appearance.logPaneHeight}px 22px` }}>
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
        onCancel={() => void window.p4git.cancelOperations().then((count) => appendLog(`Cancelled ${count} running Git process(es).`, 'success'))}
      />

      <div className="location-bar">
        <span className="location-root">{treeMode === 'depot' ? 'Depot' : repository.root.slice(0, 3)}</span>
        <input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void navigateLocation(locationDraft) }} />
        <button title="Location history" onClick={() => setLocationMenuOpen((open) => !open)}><ChevronDown size={14} /></button>
        <button className="bookmark-button" title="Add or remove bookmark" onClick={() => void toggleBookmark()}><Bookmark size={17} fill={(settings.bookmarks ?? []).includes(displayedLocation()) ? 'currentColor' : 'none'} /></button>
        <button title="Open bookmarks" onClick={() => setBookmarkMenuOpen((open) => !open)}><ChevronDown size={13} /></button>
        {locationMenuOpen && <div className="location-popup">{(settings.locationHistory ?? []).map((location) => <button key={location} onClick={() => { setLocationMenuOpen(false); void navigateLocation(location) }}>{location}</button>)}{!(settings.locationHistory ?? []).length && <span>No recent locations</span>}</div>}
        {bookmarkMenuOpen && <div className="location-popup bookmarks-popup">{(settings.bookmarks ?? []).map((location) => <button key={location} onClick={() => { setBookmarkMenuOpen(false); void navigateLocation(location) }}><Bookmark size={13} />{location}</button>)}{!(settings.bookmarks ?? []).length && <span>No bookmarks</span>}</div>}
      </div>

      <div className="workbench" style={{ gridTemplateColumns: `${appearance.workspacePaneWidth}px 4px minmax(0, 1fr)` }}>
        <aside className={`workspace-pane ${treeFilterOpen ? 'filtered' : ''}`}>
          <div className="pane-tabs"><button className={treeMode === 'depot' ? 'active' : ''} onClick={() => void switchTreeMode('depot')}>Depot</button><button className={treeMode === 'workspace' ? 'active' : ''} onClick={() => void switchTreeMode('workspace')}><Folder size={16} fill="#d7a743" />Workspace</button><span /><button title={`Sort: ${treeSort}`} onClick={() => setTreeSort((current) => current === 'name' ? 'type' : current === 'type' ? 'status' : 'name')}><Columns3 size={15} /></button><button title="Filter tree" className={treeFilterOpen ? 'active' : ''} onClick={() => setTreeFilterOpen((open) => !open)}><Filter size={15} /></button></div>
          {treeFilterOpen && <div className="tree-filter"><input autoFocus value={treeFilter} onChange={(event) => setTreeFilter(event.target.value)} placeholder="Filter folders and files..." /><button onClick={() => setTreeFilter('')}><X size={13} /></button></div>}
          {treeMode === 'depot' ? <div className="workspace-selector depot-selector"><GitBranch size={16} /><strong>Committed tree</strong><select value={depotRef} onChange={(event) => void changeDepotRef(event.target.value)}>{[repository.upstream, 'HEAD', ...branches.map((branch) => branch.name)].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index).map((ref) => <option key={ref} value={ref}>{ref}</option>)}</select></div> : <div className="workspace-selector"><Monitor size={17} /><strong>{repository.name}</strong><select value={repository.root} onChange={(event) => void openRepository(event.target.value)}>{settings.recentRepositories.map((path) => <option value={path} key={path}>{path === repository.root ? `${repository.name} (${repository.branch})` : path}</option>)}</select></div>}
          <div className="tree-scroll">
            <div className={`tree-row root ${currentDirectory === '' ? 'selected' : ''}`} onClick={() => void selectDirectory('')} onContextMenu={(event) => { event.preventDefault(); void handleEntryContext({ name: treeMode === 'depot' ? depotRef : repository.name, path: '', isDirectory: true, tracked: true }, treeMode) }}>
              <button onClick={(event) => { event.stopPropagation(); void toggleTreePath('') }}>{expandedPaths.has('') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              {treeMode === 'depot' ? <GitBranch size={16} /> : <HardDrive size={16} />}<span>{treeMode === 'depot' ? `//${depotRef}` : repository.root}</span>
            </div>
            {expandedPaths.has('') && <TreeChildren parent="" depth={1} entriesByPath={activeEntriesByPath} expanded={expandedPaths} currentDirectory={currentDirectory} onToggle={toggleTreePath} onSelectDirectory={selectDirectory} onSelectFile={(entry) => { setSelectedEntry(entry); const change = repository.changes.find((item) => item.path === entry.path); setPendingSelection(change ? { change, staged: change.staged && !change.unstaged, changelistId: change.unstaged ? changelistState.assignments[change.path] : undefined } : undefined) }} onContext={(entry) => void handleEntryContext(entry, treeMode)} />}
          </div>
        </aside>

        <div className="pane-splitter vertical" title="Drag to resize Workspace pane" onPointerDown={(event) => resizeLayout('workspacePaneWidth', event)} />

        <section className={`content-pane ${advancedFilterOpen ? 'advanced' : ''}`} style={{ gridTemplateRows: advancedFilterOpen ? `31px 28px 36px minmax(120px, 1fr) 4px 28px ${appearance.detailPaneHeight}px` : `31px 28px minmax(120px, 1fr) 4px 28px ${appearance.detailPaneHeight}px` }}>
          <div className="main-tabs">
            {(Object.keys(tabLabels) as MainTab[]).filter((tab) => tab !== 'history' || fileHistoryView).map((tab) => <button key={tab} className={mainTab === tab ? 'active' : ''} onClick={() => setMainTab(tab)}>{(tab === 'files' || tab === 'history') && <FileText size={16} />}{tab === 'pending' && <AlertTriangle size={16} fill="#d73e45" />}{tab === 'submitted' && <span className="submitted-icon">▲</span>}{tab === 'stream' && <GitGraph size={16} />}{tab === 'workspaces' && <Monitor size={16} />}{tabLabels[tab]}{tab === 'history' && <span className="tab-close" onClick={(event) => { event.stopPropagation(); setFileHistoryView(undefined); setMainTab('files') }}>×</span>}</button>)}
          </div>
          <div className="filter-bar"><button className={advancedFilterOpen ? 'expanded' : ''} onClick={() => setAdvancedFilterOpen((open) => !open)}><ChevronRight size={15} /></button><strong>Filter:</strong><input ref={filterRef} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="none applied" /><span>{getMatchCount(mainTab, appliedFilter, activeEntries, repository.changes, history, branches, settings, fileHistoryView?.commits)} matches</span><button title="Advanced filters" className={advancedFilterOpen ? 'active' : ''} onClick={() => setAdvancedFilterOpen((open) => !open)}><Filter size={15} /></button><button onClick={() => void perform('refresh', 'git status', refresh, 'Workspace refreshed.', false)} title="Refresh view"><RefreshCw size={16} className={busy === 'refresh' ? 'spin' : ''} /></button></div>
          {advancedFilterOpen && <div className="advanced-filter"><label>Mode <select value={filterMode} onChange={(event) => setFilterMode(event.target.value as 'contains' | 'prefix' | 'regex')}><option value="contains">Contains</option><option value="prefix">Starts with</option><option value="regex">Regular expression</option></select></label><label className="check-filter"><input type="checkbox" checked={filterCaseSensitive} onChange={(event) => setFilterCaseSensitive(event.target.checked)} />Match case</label><button onClick={() => setFilter('')}>Clear filter</button><span>Applied to the active tab's visible path, author, description, and ref text.</span></div>}

          <div className="table-area">
            {mainTab === 'files' && <FilesTable entries={activeEntries} changes={repository.changes} filter={appliedFilter} selected={selectedEntry?.path} source={treeMode} onSelect={(entry) => { setSelectedEntry(entry); const change = repository.changes.find((item) => item.path === entry.path); setPendingSelection(change ? { change, staged: change.staged && !change.unstaged, changelistId: change.unstaged ? changelistState.assignments[change.path] : undefined } : undefined) }} onOpen={(entry) => entry.isDirectory ? void selectDirectory(entry.path) : (() => { const change = repository.changes.find((item) => item.path === entry.path); change ? void showDiff(change, change.staged && !change.unstaged, change.unstaged ? changelistState.assignments[change.path] : undefined) : void showPathDiff(entry.path, treeMode === 'depot' ? depotRef : repository.upstream ?? 'HEAD') })()} onContext={(entry, entries) => void handleEntryContext(entry, treeMode, entries)} />}
            {mainTab === 'history' && fileHistoryView && <HistoryTable view={fileHistoryView} filter={appliedFilter} selected={selectedCommit?.hash} onSelect={(commit) => { setSelectedCommit(commit); setDetailTab('details') }} onOpen={(commit) => void showHistoryDiff(commit)} onContext={(commit) => void handleHistoryContext(commit)} />}
            {mainTab === 'pending' && <PendingTable staged={staged} unstaged={unstaged} changelists={changelistState.changelists} assignments={changelistState.assignments} filter={appliedFilter} onSelect={(change, isStaged, changelistId) => { setSelectedEntry(undefined); setPendingSelection({ change, staged: isStaged, changelistId }); setDetailTab('details') }} onOpen={(change, isStaged, changelistId) => void showDiff(change, isStaged, changelistId)} onStage={(selections) => void moveChangesToReady(selections)} onMove={(selections, id) => void moveChangesToChangelist(selections, id)} onContext={(change, isStaged, changelistId, selections) => void handlePendingContext(change, isStaged, changelistId, selections)} onNew={() => openNewChangelist()} onGroupContext={(id, name, rows) => void handleChangelistContext(id, name, rows)} />}
            {mainTab === 'submitted' && <SubmittedTable commits={history} filter={appliedFilter} selected={selectedCommit?.hash} onSelect={(commit) => { setSelectedCommit(commit); setDetailTab('details') }} onContext={(commit, commits) => void handleCommitContext(commit, commits)} onExpand={(commit) => window.p4git.getCommitFiles(repository.root, commit.hash)} />}
            {mainTab === 'stream' && <RevisionGraph commits={graph} branches={branches} filter={appliedFilter} selected={selectedCommit?.hash} onSelect={(commit) => { setSelectedCommit(commit); setSelectedBranch(branches.find((branch) => commit.refs.some((ref) => ref.includes(branch.name)))); setDetailTab('details') }} onContext={(commit, commits) => void handleCommitContext(commit, commits)} onBranchContext={(branch) => void handleBranchContext(branch)} newBranch={newBranch} onNewBranch={setNewBranch} onCreate={() => void createBranch()} busy={Boolean(busy)} />}
            {mainTab === 'workspaces' && <WorkspacesTable paths={settings.recentRepositories} active={repository.root} filter={appliedFilter} onOpen={(path) => void openRepository(path)} onContext={(path) => void handleWorkspaceContext(path)} />}
          </div>

          <div className="pane-splitter horizontal" title="Drag to resize Details pane" onPointerDown={(event) => resizeLayout('detailPaneHeight', event)} />
          <div className="detail-pane">
            <div className="detail-tabs">{(['details', 'files', 'jobs', 'diff'] as DetailTab[]).map((tab) => <button key={tab} className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>{tab === 'details' ? 'Details' : tab === 'files' ? 'Files' : tab === 'jobs' ? 'Jobs' : 'Diff Summary'}</button>)}</div>
            <DetailContent tab={detailTab} pending={pendingSelection} changelists={changelistState.changelists} commit={selectedCommit} branch={selectedBranch} entry={selectedEntry} commitFiles={commitFiles} diff={diff} diffLoading={diffLoading} issues={gitlabView?.issues ?? []} onOpenIssue={(url) => void window.p4git.openExternal(url)} />
          </div>
        </section>
      </div>

      <div className={`pane-splitter horizontal log-splitter ${logCollapsed ? 'hidden' : ''}`} title="Drag to resize Log pane" onPointerDown={(event) => resizeLayout('logPaneHeight', event)} />
      <section className={`log-pane ${logCollapsed ? 'collapsed' : ''}`}>
        <div className="log-tab"><button onClick={() => setLogCollapsed(!logCollapsed)}><FileText size={14} />Log</button><button className={tasks.some((task) => task.state === 'running') ? 'task-running' : ''} onClick={() => setTaskCenterOpen(true)}><LoaderCircle size={14} className={tasks.some((task) => task.state === 'running') ? 'spin' : ''} />Tasks ({tasks.filter((task) => task.state === 'running').length})</button><span /><button onClick={() => setLogs([])} title="Clear log"><X size={13} /></button></div>
        {!logCollapsed && <div className="log-output" onContextMenu={async (event) => { event.preventDefault(); if (await window.p4git.showContextMenu({ kind: 'log' }) === 'clear-log') setLogs([]) }}>{logs.map((entry) => <div key={entry.id} className={entry.kind}><span>●</span><time>{entry.time}</time><code>{entry.text}</code></div>)}</div>}
      </section>

      <footer className="classic-status"><span>{repository.root.slice(0, 3)}</span><span>{repository.root}{currentDirectory ? `\\${currentDirectory.replaceAll('/', '\\')}` : ''}</span>{operationState.operation && <button className="operation-status" onClick={() => operationState.conflicts ? void openConflicts() : undefined}><AlertTriangle size={12} />{operationState.operation} · {operationState.conflicts} conflict(s){operationState.canContinue ? ' · ready to continue' : ''}</button>}<span className="grow" />{busy && <button className="status-running" onClick={() => setTaskCenterOpen(true)} title="Open task progress"><LoaderCircle className="spin" size={13} /><span>{busy === 'fetch' ? 'Fetching remote references…' : `Running ${busy}…`}</span><i><b /></i></button>}<span>{repository.upstream ? `Tracking ${repository.upstream}` : 'No upstream'}</span><span className={busy ? 'status-ready running' : 'status-ready'}>{busy ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}</span></footer>

      {submitOpen && <SubmitDialog name={submitChangelist?.name ?? 'Ready to submit'} staged={submitChangelist?.changes ?? staged} message={commitMessage} amend={amendCommit} onMessage={setCommitMessage} onCancel={() => { setSubmitOpen(false); setSubmitChangelist(undefined); setAmendCommit(false) }} onSubmit={() => void submitCommit()} busy={busy === 'commit' || busy === 'prepare-changelist'} conflicts={(submitChangelist?.changes ?? staged).some((change) => change.conflicted)} />}
      {timelapseView && <TimelapseDialog view={timelapseView} onClose={() => setTimelapseView(undefined)} />}
      {stashesView && <StashesDialog view={stashesView} onClose={() => setStashesView(undefined)} onApply={(entry) => void applyStashEntry(entry, false)} onPop={(entry) => void applyStashEntry(entry, true)} onDrop={(entry) => void dropStashEntry(entry)} />}
      {reflogView && <ReflogDialog view={reflogView} onClose={() => setReflogView(undefined)} onCopy={(entry) => void copyText(entry.hash)} />}
      {preferencesOpen && <PreferencesDialog health={health} value={preferenceDraft} onChange={setPreferenceDraft} onChooseGit={() => void chooseGit()} onChooseDiff={() => void chooseDiffTool()} onChooseMerge={() => void chooseMergeTool()} onCancel={() => setPreferencesOpen(false)} onSave={() => void savePreferences()} busy={busy === 'preferences'} />}
      {changelistEditor && <ChangelistDialog value={changelistEditor} onChange={setChangelistEditor} onCancel={() => setChangelistEditor(undefined)} onSave={() => void saveChangelist()} busy={busy === 'new-changelist' || busy === 'edit-changelist'} />}
      {branchEditor && <BranchDialog value={branchEditor} onChange={setBranchEditor} onCancel={() => setBranchEditor(undefined)} onSave={() => void saveBranch()} busy={busy === 'branch'} />}
      {conflictsView && <ConflictResolver repoPath={repository.root} conflicts={conflictsView} onClose={() => setConflictsView(undefined)} onChanged={async () => { const next = await window.p4git.getConflicts(repository.root); setConflictsView(next); await refresh(); return next }} />}
      {gitlabOpen && gitlabConfig && <GitLabDialog repoPath={repository.root} branch={repository.branch} branches={branches} config={gitlabConfig} overview={gitlabView} onClose={() => setGitlabOpen(false)} onUpdate={(config, overview) => { setGitlabConfig(config); setGitlabView(overview) }} />}
      {cloneOpen && <CloneDialog onClose={() => setCloneOpen(false)} onComplete={(path) => { setCloneOpen(false); void openRepository(path) }} />}
      {initOpen && <InitDialog onClose={() => setInitOpen(false)} onComplete={(path) => { setInitOpen(false); void openRepository(path) }} />}
      {remotesOpen && <RemotesDialog repoPath={repository.root} onClose={() => setRemotesOpen(false)} />}
      {pushOpen && <PushDialog repoPath={repository.root} branch={repository.branch} onClose={() => setPushOpen(false)} onPushed={async () => { setPushOpen(false); await refresh() }} />}
      {shelvesOpen && <ShelvesDialog repoPath={repository.root} shelves={changelistState.shelves} onClose={() => setShelvesOpen(false)} onUnshelved={async (state) => { setChangelistState(state); setShelvesOpen(false); await refresh() }} />}
      {branchComparison && <BranchComparisonDialog repoPath={repository.root} value={branchComparison} onClose={() => setBranchComparison(undefined)} onMerge={(commits) => openSelectiveMerge(commits, branchComparison.selected)} onDiff={diffCommitFileAgainstWorkspace} />}
      {pendingDiffView && <PendingDiffDialog value={pendingDiffView} onChange={setPendingDiffView} onClose={() => setPendingDiffView(undefined)} />}
      {selectiveMergeEditor && <SelectiveMergeDialog value={selectiveMergeEditor} onChange={setSelectiveMergeEditor} onClose={() => setSelectiveMergeEditor(undefined)} onMerge={() => void runSelectiveMerge()} busy={busy === 'selective-merge'} currentBranch={repository.branch} />}
      {revisionRequest && <GetRevisionDialog repoPath={repository.root} paths={revisionRequest.paths} initial={revisionRequest.initial} suggestions={[repository.branch, repository.upstream ?? '', 'HEAD', ...branches.map((branch) => branch.name), ...history.slice(0, 30).map((commit) => commit.hash)].filter(Boolean)} onClose={() => setRevisionRequest(undefined)} onApply={async (revision, paths) => { await perform('get-revision', `git restore --source=${revision.hash} --worktree -- ${paths.join(' ')}`, () => window.p4git.restoreFromRef(repository.root, revision.hash, paths), `Restored ${paths.length} target(s) from ${revision.shortHash}.`) }} />}
      {lfsOpen && <LfsLocksDialog repoPath={repository.root} onClose={() => setLfsOpen(false)} />}
      {taskCenterOpen && <TaskCenter tasks={tasks} onClose={() => setTaskCenterOpen(false)} onCancel={() => void window.p4git.cancelOperations().then((count) => appendLog(`Cancellation requested for ${count} process(es).`, 'success'))} onClear={() => setTasks((current) => current.filter((task) => task.state === 'running'))} />}
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
  onCancel: () => void
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
    <Tool icon={<XCircle />} label="Cancel" onClick={props.onCancel} disabled={!props.busy} title="Cancel all running Git commands" />
  </div>
}

function Tool({ icon, label, onClick, disabled, busy, title }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; busy?: boolean; title?: string }): React.JSX.Element {
  return <button className="tool-button" onClick={onClick} disabled={disabled} title={title}>{busy ? <LoaderCircle className="spin" /> : icon}<span>{label}</span></button>
}

function useTableSelection(keys: string[]): {
  selected: Set<string>
  click: (key: string, event: React.MouseEvent) => void
  context: (key: string) => Set<string>
  keyDown: (event: React.KeyboardEvent) => void
  selectAll: () => void
} {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | undefined>(undefined)
  const signature = keys.join('\0')
  useEffect(() => { const valid = new Set(keys); setSelected((current) => new Set([...current].filter((key) => valid.has(key)))) }, [signature])
  return {
    selected,
    click: (key, event) => {
      let next: Set<string>
      if (event.shiftKey && anchor.current) {
        const start = keys.indexOf(anchor.current); const end = keys.indexOf(key)
        next = new Set(event.ctrlKey || event.metaKey ? selected : [])
        if (start >= 0 && end >= 0) for (const item of keys.slice(Math.min(start, end), Math.max(start, end) + 1)) next.add(item)
      } else if (event.ctrlKey || event.metaKey) {
        next = new Set(selected); if (next.has(key)) next.delete(key); else next.add(key); anchor.current = key
      } else { next = new Set([key]); anchor.current = key }
      setSelected(next)
    },
    context: (key) => { const next = selected.has(key) ? selected : new Set([key]); if (!selected.has(key)) setSelected(next); anchor.current = key; return next },
    keyDown: (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelected(new Set(keys)) } else if (event.key === 'Escape') setSelected(new Set()) },
    selectAll: () => setSelected(new Set(keys))
  }
}

function useResizableColumns(id: string, defaults: number[]): { style: React.CSSProperties; grip: (index: number) => React.JSX.Element } {
  const [widths, setWidths] = useState<number[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`p4git-columns-${id}`) ?? '[]') as number[]
      return stored.length === defaults.length && stored.every((value) => Number.isFinite(value)) ? stored : defaults
    } catch { return defaults }
  })
  const style = { gridTemplateColumns: widths.map((width, index) => index === widths.length - 1 ? `minmax(${width}px, 1fr)` : `${width}px`).join(' '), minWidth: `${widths.reduce((total, value) => total + value, 0)}px` }
  const grip = (index: number): React.JSX.Element => <i className="column-grip" title="Drag to resize column" onPointerDown={(event) => {
    event.preventDefault(); event.stopPropagation()
    const start = event.clientX; const original = widths[index]; let latest = original
    const move = (pointer: PointerEvent): void => { latest = Math.max(60, original + pointer.clientX - start); setWidths((current) => current.map((value, currentIndex) => currentIndex === index ? latest : value)) }
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); const next = widths.map((value, currentIndex) => currentIndex === index ? latest : value); setWidths(next); localStorage.setItem(`p4git-columns-${id}`, JSON.stringify(next)) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true })
  }} />
  return { style, grip }
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

function FilesTable({ entries, changes, filter, selected, source, onSelect, onOpen, onContext }: { entries: WorkspaceEntry[]; changes: FileChange[]; filter: string; selected?: string; source: TreeMode; onSelect: (entry: WorkspaceEntry) => void; onOpen: (entry: WorkspaceEntry) => void; onContext: (entry: WorkspaceEntry, entries: WorkspaceEntry[]) => void }): React.JSX.Element {
  const [sort, setSort] = useState<'name' | 'type' | 'action' | 'path'>('name')
  const describe = (entry: WorkspaceEntry): { type: string; action: string; path: string } => {
    const change = changes.find((item) => item.path === entry.path)
    return { type: entry.isDirectory ? 'Folder' : parts(entry.name).name.includes('.') ? parts(entry.name).name.split('.').pop()?.toUpperCase() ?? 'File' : 'File', action: change ? changeLabel(change) : source === 'depot' ? 'committed' : entry.tracked ? '' : 'local only', path: parts(entry.path).directory || '.' }
  }
  const rows = entries.filter((entry) => matchesFilter(entry.name, filter)).sort((left, right) => {
    const leftValue = sort === 'name' ? left.name : describe(left)[sort]
    const rightValue = sort === 'name' ? right.name : describe(right)[sort]
    return leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base' })
  })
  const selection = useTableSelection(rows.map((entry) => entry.path))
  const columns = useResizableColumns('files', [300, 100, 110, 300])
  return <div className="classic-table files-table" tabIndex={0} onKeyDown={selection.keyDown}><div className="table-head sortable" style={columns.style}><button onClick={() => setSort('name')}>Name{columns.grip(0)}</button><button onClick={() => setSort('type')}>Type{columns.grip(1)}</button><button onClick={() => setSort('action')}>Action{columns.grip(2)}</button><button onClick={() => setSort('path')}>Path{columns.grip(3)}</button></div>{rows.map((entry) => { const metadata = describe(entry); return <button style={columns.style} key={entry.path} className={`table-row ${selection.selected.has(entry.path) || (!selection.selected.size && selected === entry.path) ? 'selected' : ''}`} onClick={(event) => { selection.click(entry.path, event); onSelect(entry) }} onDoubleClick={() => onOpen(entry)} onContextMenu={(event) => { event.preventDefault(); const keys = selection.context(entry.path); onContext(entry, rows.filter((row) => keys.has(row.path))) }}><span className="file-name" title={entry.path}>{entry.isDirectory ? <Folder size={16} fill="#d8b15c" /> : <File size={15} />}{entry.name}</span><span>{metadata.type}</span><span>{metadata.action}</span><span title={entry.path}>{metadata.path}</span></button> })}{rows.length === 0 && <EmptyTable text="No files match the current filter." />}</div>
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
  const [sort, setSort] = useState<'changelist' | 'file' | 'action' | 'folder'>('file')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const anchorKey = useRef<string | undefined>(undefined)
  const groups = useMemo(() => {
    const validIds = new Set(changelists.map((item) => item.id))
    const changedByPath = new Map<string, FileChange>()
    for (const change of [...staged, ...unstaged]) changedByPath.set(change.path, change)
    const allChanges = [...changedByPath.values()]
    return [
      { id: '__ready__', title: 'Ready to submit', description: 'Git index', rows: staged.filter((change) => !validIds.has(assignments[change.path])), staged: true },
      ...changelists.map((changelist) => ({
        id: changelist.id,
        title: changelist.name,
        description: changelist.description || 'Local changelist',
        rows: allChanges.filter((change) => assignments[change.path] === changelist.id),
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
  }, [assignments, changelists, staged, unstaged]).map((group) => ({ ...group, rows: [...group.rows].sort((left, right) => {
    if (sort === 'action') return changeLabel(left).localeCompare(changeLabel(right))
    if (sort === 'folder') return parts(left.path).directory.localeCompare(parts(right.path).directory)
    return left.path.localeCompare(right.path)
  }) }))
  const allRows = useMemo(() => groups.flatMap((group) => group.rows.map((change) => ({
    key: `${group.id}\u0000${change.path}`,
    sourceId: group.id,
    selection: {
      change,
      staged: group.staged,
      changelistId: group.id === '__default__' || group.id === '__ready__' ? undefined : group.id
    } satisfies PendingSelection
  }))), [groups])
  const visibleRows = allRows.filter((row) => !collapsed.has(row.sourceId) && matchesFilter(row.selection.change.path, filter))
  const columns = useResizableColumns('pending', [170, 320, 100, 360])

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
      <div className="table-head sortable" style={columns.style}><button onClick={() => setSort('changelist')}>Changelist{columns.grip(0)}</button><button onClick={() => setSort('file')}>File{columns.grip(1)}</button><button onClick={() => setSort('action')}>Action{columns.grip(2)}</button><button onClick={() => setSort('folder')}>Folder{columns.grip(3)}</button></div>
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
        {!collapsed.has(group.id) && group.rows.filter((change) => matchesFilter(change.path, filter)).map((change) => {
          const key = `${group.id}\u0000${change.path}`
          const changelistId = group.id === '__default__' || group.id === '__ready__' ? undefined : group.id
          const selection: PendingSelection = { change, staged: group.staged, changelistId }
          return <button
            draggable
            style={columns.style}
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
            <span title={group.title}>{group.title}</span><span className="file-name" title={change.path}><i className={`change-mark ${change.kind}`}>{changeCode(change)}</i>{parts(change.path).name}</span><span>{changeLabel(change)}</span><span title={change.path}>{parts(change.path).directory || '.'}</span>
          </button>
        })}
      </div>)}
      {staged.length + unstaged.length === 0 && <EmptyTable text="Workspace is clean. Local changelists are still available for future changes." />}
    </div>
  </div>
}

function SubmittedTable({ commits, filter, selected, onSelect, onContext, onExpand }: { commits: CommitInfo[]; filter: string; selected?: string; onSelect: (commit: CommitInfo) => void; onContext: (commit: CommitInfo, commits: CommitInfo[]) => void; onExpand: (commit: CommitInfo) => Promise<RevisionFile[]> }): React.JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, RevisionFile[]>>({})
  const [sort, setSort] = useState<'change' | 'date' | 'author' | 'description'>('date')
  const rows = commits.filter((commit) => matchesFilter(`${commit.shortHash} ${commit.author} ${commit.subject}`, filter)).sort((a, b) => sort === 'change' ? a.shortHash.localeCompare(b.shortHash) : sort === 'author' ? a.author.localeCompare(b.author) : sort === 'description' ? a.subject.localeCompare(b.subject) : b.date.localeCompare(a.date))
  const selection = useTableSelection(rows.map((commit) => commit.hash))
  const toggle = async (commit: CommitInfo): Promise<void> => {
    if (expanded[commit.hash]) { setExpanded((current) => { const next = { ...current }; delete next[commit.hash]; return next }); return }
    setExpanded((current) => ({ ...current, [commit.hash]: [] }))
    const files = await onExpand(commit)
    setExpanded((current) => ({ ...current, [commit.hash]: files }))
  }
  return <div className="classic-table submitted-table" tabIndex={0} onKeyDown={selection.keyDown}><div className="table-head sortable"><button onClick={() => setSort('change')}>Change</button><button onClick={() => setSort('date')}>Date Submitted</button><button onClick={() => setSort('author')}>Submitted By</button><button onClick={() => setSort('description')}>Description</button></div>{rows.map((commit) => <div key={commit.hash} className="submitted-group"><button className={`table-row ${selection.selected.has(commit.hash) || (!selection.selected.size && selected === commit.hash) ? 'selected' : ''}`} onClick={(event) => { selection.click(commit.hash, event); onSelect(commit) }} onContextMenu={(event) => { event.preventDefault(); const keys = selection.context(commit.hash); onContext(commit, rows.filter((row) => keys.has(row.hash))) }}><span className="change-cell"><span className="expand-hit" onClick={(event) => { event.stopPropagation(); void toggle(commit) }}>{expanded[commit.hash] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span><i>▲</i><code>{commit.shortHash}</code></span><span>{formatDate(commit.date)}</span><span title={commit.author}>{commit.author}</span><span title={commit.subject}>{commit.subject}</span></button>{expanded[commit.hash] && <div className="submitted-files-inline">{expanded[commit.hash].map((file) => <div title={file.path} key={`${file.kind}-${file.path}`}><i className={`change-mark ${file.kind === 'A' ? 'added' : file.kind === 'D' ? 'deleted' : 'modified'}`}>{file.kind}</i><span>{file.path}</span></div>)}{expanded[commit.hash].length === 0 && <span>Loading or no changed files...</span>}</div>}</div>)}{rows.length === 0 && <EmptyTable text="No submitted changes match the current filter." />}</div>
}

interface GraphLayoutRow {
  commit: GraphCommit
  lane: number
  before: string[]
  after: string[]
}

function buildGraphLayout(commits: GraphCommit[]): GraphLayoutRow[] {
  let lanes: string[] = []
  return commits.map((commit) => {
    let lane = lanes.indexOf(commit.hash)
    if (lane < 0) {
      lane = 0
      lanes = [commit.hash, ...lanes]
    }
    const before = [...lanes]
    lanes.splice(lane, 1, ...commit.parents)
    lanes = lanes.filter((hash, index, all) => all.indexOf(hash) === index)
    return { commit, lane, before, after: [...lanes] }
  })
}

function GraphCell({ row }: { row: GraphLayoutRow }): React.JSX.Element {
  const laneWidth = 14
  const width = Math.max(row.before.length, row.after.length, 1) * laneWidth + 8
  const center = (lane: number): number => 7 + lane * laneWidth
  const currentX = center(row.lane)
  return <span className="graph-node"><svg width={width} height="21" viewBox={`0 0 ${width} 21`} aria-label={`${row.commit.parents.length} parent commit(s)`}>
    {row.before.map((hash, lane) => {
      if (lane === row.lane) return null
      const nextLane = row.after.indexOf(hash)
      return nextLane >= 0 ? <path key={`${hash}-${lane}`} d={`M ${center(lane)} 0 C ${center(lane)} 9, ${center(nextLane)} 12, ${center(nextLane)} 21`} /> : null
    })}
    {row.commit.parents.map((parent, index) => {
      const parentLane = row.after.indexOf(parent)
      return parentLane >= 0 ? <path key={parent} className={index > 0 ? 'merge-edge' : ''} d={`M ${currentX} 10 C ${currentX} 14, ${center(parentLane)} 15, ${center(parentLane)} 21`} /> : null
    })}
    <circle className={row.commit.parents.length > 1 ? 'merge' : ''} cx={currentX} cy="10" r="4.5" />
  </svg></span>
}

function RevisionGraph({ commits, branches, filter, selected, onSelect, onContext, onBranchContext, newBranch, onNewBranch, onCreate, busy }: { commits: GraphCommit[]; branches: BranchInfo[]; filter: string; selected?: string; onSelect: (commit: GraphCommit) => void; onContext: (commit: GraphCommit, commits: GraphCommit[]) => void; onBranchContext: (branch: BranchInfo) => void; newBranch: string; onNewBranch: (value: string) => void; onCreate: () => void; busy: boolean }): React.JSX.Element {
  const defaultRefWidth = 240
  const [sort, setSort] = useState<'topology' | 'commit' | 'date' | 'author' | 'description'>('topology')
  const [branchFilter, setBranchFilter] = useState('')
  const [refWidth, setRefWidth] = useState(() => {
    const stored = Number(localStorage.getItem('p4git-stream-ref-width'))
    return Number.isFinite(stored) && stored >= 150 && stored <= 600 ? stored : defaultRefWidth
  })
  const rows = commits.filter((commit) => matchesFilter(`${commit.shortHash} ${commit.author} ${commit.subject} ${commit.refs.join(' ')}`, filter)).sort((left, right) => sort === 'commit' ? left.shortHash.localeCompare(right.shortHash) : sort === 'date' ? right.date.localeCompare(left.date) : sort === 'author' ? left.author.localeCompare(right.author) : sort === 'description' ? left.subject.localeCompare(right.subject) : 0)
  const visibleBranches = branches.filter((branch) => matchesFilter(branch.name, branchFilter))
  const graphRows = buildGraphLayout(rows)
  const selection = useTableSelection(rows.map((commit) => commit.hash))
  const resizeRefs = (event: React.PointerEvent): void => {
    event.preventDefault()
    const start = event.clientX
    const original = refWidth
    let latest = original
    const move = (pointer: PointerEvent): void => { latest = Math.min(600, Math.max(150, original + pointer.clientX - start)); setRefWidth(latest) }
    const up = (): void => { localStorage.setItem('p4git-stream-ref-width', String(latest)); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }
  const resetRefs = (): void => { setRefWidth(defaultRefWidth); localStorage.removeItem('p4git-stream-ref-width') }
  return <div className="revision-graph-layout">
    <div className="branch-tools"><label>New branch:</label><input value={newBranch} onChange={(event) => onNewBranch(event.target.value)} placeholder="feature/name" /><button onClick={onCreate} disabled={!newBranch.trim() || busy}><Plus size={14} />Create</button><span>{visibleBranches.length}/{branches.length} refs · {rows.length}/{commits.length} commits</span></div>
    <div className="graph-columns" style={{ gridTemplateColumns: `${refWidth}px 4px minmax(640px, 1fr)` }}>
      <aside className="graph-refs"><strong>Branches / Streams</strong><div className="graph-ref-filter"><Filter size={13} /><input value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} placeholder="Filter branch names..." /><button onClick={() => setBranchFilter('')} disabled={!branchFilter}><X size={12} /></button></div>{visibleBranches.map((branch) => <button title={branch.name} key={branch.name} className={branch.current ? 'current' : ''} onContextMenu={(event) => { event.preventDefault(); onBranchContext(branch) }}><GitBranch size={14} /><span>{branch.name}</span>{branch.current && <Check size={12} />}</button>)}{!visibleBranches.length && <p className="graph-ref-empty">No matching branches.</p>}</aside>
      <div className="graph-ref-splitter" title="Drag to resize; double-click to reset" onPointerDown={resizeRefs} onDoubleClick={resetRefs} />
      <div className="classic-table graph-table" tabIndex={0} onKeyDown={selection.keyDown}><div className="table-head sortable"><button onClick={() => setSort('topology')}>Graph</button><button onClick={() => setSort('commit')}>Commit</button><button onClick={() => setSort('date')}>Date</button><button onClick={() => setSort('author')}>Author</button><button onClick={() => setSort('description')}>Description</button></div>{graphRows.map((row) => <button key={row.commit.hash} className={`table-row ${selection.selected.has(row.commit.hash) || (!selection.selected.size && selected === row.commit.hash) ? 'selected' : ''}`} onClick={(event) => { selection.click(row.commit.hash, event); onSelect(row.commit) }} onContextMenu={(event) => { event.preventDefault(); const keys = selection.context(row.commit.hash); onContext(row.commit, rows.filter((commit) => keys.has(commit.hash))) }}><GraphCell row={row} /><code>{row.commit.shortHash}</code><span>{formatDate(row.commit.date)}</span><span title={row.commit.author}>{row.commit.author}</span><span title={`${row.commit.refs.join(' · ')} ${row.commit.subject}`}><strong>{row.commit.refs.join(' · ')}</strong>{row.commit.subject}</span></button>)}</div>
    </div>
  </div>
}

function StreamTable({ branches, filter, selected, onSelect, onCheckout, onContext, newBranch, onNewBranch, onCreate, busy }: { branches: BranchInfo[]; filter: string; selected?: string; onSelect: (branch: BranchInfo) => void; onCheckout: (branch: BranchInfo) => void; onContext: (branch: BranchInfo) => void; newBranch: string; onNewBranch: (value: string) => void; onCreate: () => void; busy: boolean }): React.JSX.Element {
  const rows = branches.filter((branch) => matchesFilter(branch.name, filter))
  return <div className="stream-layout"><div className="branch-tools"><label>New branch:</label><input value={newBranch} onChange={(event) => onNewBranch(event.target.value)} placeholder="feature/name" /><button onClick={onCreate} disabled={!newBranch.trim() || busy}><Plus size={14} />Create</button></div><div className="classic-table stream-table"><div className="table-head"><span>Branch / Stream</span><span>Type</span><span>Latest Change</span><span>Description</span><span /></div>{rows.map((branch) => <div role="button" tabIndex={0} key={branch.name} className={`table-row ${selected === branch.name ? 'selected' : ''}`} onClick={() => onSelect(branch)} onContextMenu={(event) => { event.preventDefault(); onContext(branch) }}><span className="file-name"><GitBranch size={15} />{branch.name}</span><span>{branch.remote ? 'Remote' : 'Local'}</span><code>{branch.hash}</code><span>{branch.subject}</span><span>{branch.current ? <em className="current-label"><Check size={12} />Current</em> : !branch.remote ? <button className="inline-button" onClick={(event) => { event.stopPropagation(); onCheckout(branch) }}>Switch</button> : null}</span></div>)}</div></div>
}

function WorkspacesTable({ paths, active, filter, onOpen, onContext }: { paths: string[]; active: string; filter: string; onOpen: (path: string) => void; onContext: (path: string) => void }): React.JSX.Element {
  const [sort, setSort] = useState<'workspace' | 'root' | 'status'>('workspace')
  const rows = paths.filter((path) => matchesFilter(path, filter)).sort((left, right) => sort === 'root' ? left.localeCompare(right) : sort === 'status' ? Number(right === active) - Number(left === active) : parts(left).name.localeCompare(parts(right).name))
  const selection = useTableSelection(rows)
  return <div className="classic-table workspaces-table" tabIndex={0} onKeyDown={selection.keyDown}><div className="table-head sortable"><button onClick={() => setSort('workspace')}>Workspace</button><button onClick={() => setSort('root')}>Root</button><button onClick={() => setSort('status')}>Status</button></div>{rows.map((path) => <button key={path} className={`table-row ${selection.selected.has(path) || (!selection.selected.size && path === active) ? 'selected' : ''}`} onClick={(event) => selection.click(path, event)} onDoubleClick={() => onOpen(path)} onContextMenu={(event) => { event.preventDefault(); selection.context(path); onContext(path) }}><span className="file-name" title={path}><Monitor size={15} />{parts(path).name}</span><span title={path}>{path}</span><span>{path === active ? 'Current' : 'Recent'}</span></button>)}</div>
}

function DetailContent({ tab, pending, changelists, commit, branch, entry, commitFiles, diff, diffLoading, issues, onOpenIssue }: { tab: DetailTab; pending?: PendingSelection; changelists: LocalChangelist[]; commit?: CommitInfo; branch?: BranchInfo; entry?: WorkspaceEntry; commitFiles: RevisionFile[]; diff: string; diffLoading: boolean; issues: GitLabOverview['issues']; onOpenIssue: (url: string) => void }): React.JSX.Element {
  const pendingList = pending?.staged ? 'Ready to submit' : pending?.changelistId ? changelists.find((item) => item.id === pending.changelistId)?.name ?? 'Local changelist' : 'Default changelist'
  if (tab === 'diff') return <pre className="detail-diff">{diffLoading ? 'Loading diff...' : diff || 'Select a pending file and choose Diff.'}</pre>
  if (tab === 'jobs') return issues.length ? <div className="issue-list">{issues.map((issue) => <button key={issue.iid} onClick={() => onOpenIssue(issue.webUrl)}><strong>#{issue.iid}</strong><span>{issue.title}</span><em>{issue.state}</em></button>)}</div> : <div className="detail-empty">Configure Tools &gt; GitLab to use GitLab Issues as P4V Jobs.</div>
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

function HistoryTable({ view, filter, selected, onSelect, onOpen, onContext }: { view: { path: string; commits: CommitInfo[]; isDirectory: boolean }; filter: string; selected?: string; onSelect: (commit: CommitInfo) => void; onOpen: (commit: CommitInfo) => void; onContext: (commit: CommitInfo, commits: CommitInfo[]) => void }): React.JSX.Element {
  const [sort, setSort] = useState<'revision' | 'change' | 'date' | 'author' | 'description'>('revision')
  const rows = view.commits.filter((commit) => matchesFilter(`${commit.shortHash} ${commit.author} ${commit.subject}`, filter)).sort((left, right) => sort === 'change' ? left.shortHash.localeCompare(right.shortHash) : sort === 'date' ? right.date.localeCompare(left.date) : sort === 'author' ? left.author.localeCompare(right.author) : sort === 'description' ? left.subject.localeCompare(right.subject) : view.commits.indexOf(left) - view.commits.indexOf(right))
  const selection = useTableSelection(rows.map((commit) => commit.hash))
  return <div className="history-layout">
    <div className="history-path"><FileText size={15} /><strong>{view.path === '.' ? 'Repository History' : 'File History'}</strong><span>{view.path}</span><em>Double-click a revision to diff it against its previous revision.</em></div>
    <div className="classic-table history-table" tabIndex={0} onKeyDown={selection.keyDown}>
      <div className="table-head sortable"><button onClick={() => setSort('revision')}>Revision</button><button onClick={() => setSort('change')}>Change</button><button onClick={() => setSort('date')}>Date</button><button onClick={() => setSort('author')}>Submitted By</button><button onClick={() => setSort('description')}>Description</button></div>
      {rows.map((commit) => {
        const revision = view.commits.length - view.commits.indexOf(commit)
        return <button key={commit.hash} className={`table-row ${selection.selected.has(commit.hash) || (!selection.selected.size && selected === commit.hash) ? 'selected' : ''}`} onClick={(event) => { selection.click(commit.hash, event); onSelect(commit) }} onDoubleClick={() => onOpen(commit)} onContextMenu={(event) => { event.preventDefault(); const keys = selection.context(commit.hash); onContext(commit, rows.filter((row) => keys.has(row.hash))) }}>
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

function PreferencesDialog({ health, value, onChange, onChooseGit, onChooseDiff, onChooseMerge, onCancel, onSave, busy }: { health: GitHealth; value: PreferenceDraft; onChange: (value: PreferenceDraft) => void; onChooseGit: () => void; onChooseDiff: () => void; onChooseMerge: () => void; onCancel: () => void; onSave: () => void; busy: boolean }): React.JSX.Element {
  const validDiff = !value.diffPath || (value.diffArguments.includes('{left}') && value.diffArguments.includes('{right}'))
  const validMerge = !value.mergePath || ['{base}', '{ours}', '{theirs}', '{result}'].every((token) => value.mergeArguments.includes(token))
  return <div className="modal-backdrop"><section className="preferences-dialog" role="dialog" aria-modal="true" aria-label="P4Git Preferences">
    <div className="modal-title"><Settings size={16} /><strong>Preferences</strong><button onClick={onCancel}><X size={16} /></button></div>
    <div className="preferences-body">
      <fieldset><legend>Git executable</legend><div className="preference-path"><input readOnly value={health.path ?? ''} placeholder="Git has not been configured" /><button onClick={onChooseGit}>Change...</button></div><p>{health.version ?? health.error ?? 'P4Git verifies Git before saving it.'}</p></fieldset>
      <fieldset><legend>External Diff tool</legend><div className="preference-path"><input readOnly value={value.diffPath} placeholder="Not configured — use the built-in Diff Summary" /><button onClick={onChooseDiff}>Browse...</button><button onClick={() => onChange({ ...value, diffPath: '', diffArguments: DEFAULT_DIFF_TOOL_ARGUMENTS })} disabled={!value.diffPath}>Disable</button></div><label>Arguments template:</label><textarea value={value.diffArguments} onChange={(event) => onChange({ ...value, diffArguments: event.target.value })} disabled={!value.diffPath} /><p>Placeholders: {'{left}'}, {'{right}'}, {'{leftTitle}'}, {'{rightTitle}'}.</p>{!validDiff && <p className="preference-error">The template must contain {'{left}'} and {'{right}'}.</p>}</fieldset>
      <fieldset><legend>External 3-way Merge tool</legend><div className="preference-path"><input readOnly value={value.mergePath} placeholder="Not configured — use the built-in Resolve editor" /><button onClick={onChooseMerge}>Browse...</button><button onClick={() => onChange({ ...value, mergePath: '', mergeArguments: DEFAULT_MERGE_TOOL_ARGUMENTS })} disabled={!value.mergePath}>Disable</button></div><label>Arguments template:</label><textarea value={value.mergeArguments} onChange={(event) => onChange({ ...value, mergeArguments: event.target.value })} disabled={!value.mergePath} /><p>Required placeholders: {'{base}'}, {'{ours}'}, {'{theirs}'}, {'{result}'}. The tool must exit after saving the result.</p>{!validMerge && <p className="preference-error">All four Merge placeholders are required.</p>}</fieldset>
      <fieldset><legend>Appearance and layout</legend><div className="appearance-grid"><label>Theme<select value={value.appearance.theme} onChange={(event) => onChange({ ...value, appearance: { ...value.appearance, theme: event.target.value as AppearanceSettings['theme'] } })}><option value="classic">P4V Classic</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Density<select value={value.appearance.density} onChange={(event) => onChange({ ...value, appearance: { ...value.appearance, density: event.target.value as AppearanceSettings['density'] } })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label><label>Text size<input type="range" min="0.85" max="1.35" step="0.05" value={value.appearance.fontScale} onChange={(event) => onChange({ ...value, appearance: { ...value.appearance, fontScale: Number(event.target.value) } })} /><span>{Math.round(value.appearance.fontScale * 100)}%</span></label><label className="check-filter"><input type="checkbox" checked={value.appearance.showToolbarLabels} onChange={(event) => onChange({ ...value, appearance: { ...value.appearance, showToolbarLabels: event.target.checked } })} />Show toolbar labels</label></div><button onClick={() => onChange({ ...value, appearance: DEFAULT_APPEARANCE })}>Reset layout and columns</button><p>Drag the vertical workspace divider, detail divider, log divider, and table column edges. Saved sizes are restored on next launch.</p></fieldset>
    </div>
    <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary-classic" onClick={onSave} disabled={busy || !validDiff || !validMerge}>{busy && <LoaderCircle className="spin" size={14} />}Save</button></div>
  </section></div>
}

function ChangelistDialog({ value, onChange, onCancel, onSave, busy }: { value: ChangelistEditorState; onChange: (value: ChangelistEditorState) => void; onCancel: () => void; onSave: () => void; busy: boolean }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="changelist-dialog" role="dialog" aria-modal="true" aria-label={value.id ? 'Edit Changelist' : 'New Changelist'}><div className="modal-title"><FileText size={16} /><strong>{value.id ? 'Edit Changelist' : 'New Changelist'}</strong><button onClick={onCancel}><X size={16} /></button></div><div className="modal-body"><label htmlFor="changelist-name">Name:</label><input id="changelist-name" autoFocus maxLength={120} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="Feature or task name" /><label htmlFor="changelist-description">Description:</label><textarea id="changelist-description" maxLength={2000} value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} placeholder="What changes belong in this changelist?" /></div><div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary-classic" onClick={onSave} disabled={!value.name.trim() || busy}>{busy && <LoaderCircle className="spin" size={14} />}{value.id ? 'Save' : 'Create'}</button></div></section></div>
}

function BranchDialog({ value, onChange, onCancel, onSave, busy }: { value: BranchEditorState; onChange: (value: BranchEditorState) => void; onCancel: () => void; onSave: () => void; busy: boolean }): React.JSX.Element {
  const invalid = !value.name.trim() || value.name.startsWith('-') || /[\s~^:?*[\\]/.test(value.name) || value.name.includes('..') || value.name.endsWith('/') || value.name.endsWith('.') || value.name.endsWith('.lock')
  return <div className="modal-backdrop"><section className="branch-dialog" role="dialog" aria-modal="true" aria-label="New Branch from Here"><div className="modal-title"><GitBranch size={16} /><strong>New Branch from Here</strong><button onClick={onCancel}><X size={16} /></button></div><div className="modal-body"><label>Start point:</label><div className="branch-source"><GitBranch size={15} /><code title={value.source}>{value.source}</code></div><label htmlFor="new-branch-name">New local branch name:</label><input id="new-branch-name" autoFocus value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !invalid && !busy) onSave() }} placeholder="feature/name" /><p>The new local branch starts at the selected branch/ref and becomes the current workspace branch.</p>{invalid && value.name && <p className="preference-error">Enter a valid Git branch name without spaces or Git ref-control characters.</p>}</div><div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary-classic" onClick={onSave} disabled={invalid || busy}>{busy && <LoaderCircle className="spin" size={14} />}Create &amp; Switch</button></div></section></div>
}

function SubmitDialog({ name, staged, message, amend, onMessage, onCancel, onSubmit, busy, conflicts }: { name: string; staged: FileChange[]; message: string; amend: boolean; onMessage: (value: string) => void; onCancel: () => void; onSubmit: () => void; busy: boolean; conflicts: boolean }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="submit-dialog" role="dialog" aria-modal="true" aria-label="Submit Changelist"><div className="modal-title"><BrandIcon /><strong>{amend ? 'Amend Last Commit' : 'Submit Changelist'}</strong><button onClick={onCancel}><X size={16} /></button></div><div className="modal-body"><div className="field-row"><label>Changelist:</label><strong>{name}</strong></div>{amend && <div className="modal-warning"><AlertTriangle size={15} />Amend rewrites the last commit ID. Do not amend a commit already shared with teammates.</div>}<label htmlFor="submit-description">Description:</label><textarea id="submit-description" autoFocus value={message} onChange={(event) => onMessage(event.target.value)} placeholder="Enter a description for this change..." /><div className="submit-files-title"><strong>{amend ? 'Additional staged files' : 'Files'}</strong><span>{staged.length} files</span></div><div className="submit-files">{staged.map((change) => <div key={change.path}><i className={`change-mark ${change.kind}`}>{changeCode(change)}</i><span>{change.path}</span><em>{changeLabel(change)}</em></div>)}{staged.length === 0 && <p>{amend ? 'No additional files; only the commit message will change.' : 'No files are ready to submit. Move files into this changelist first.'}</p>}</div>{conflicts && <div className="modal-warning"><AlertTriangle size={15} />Resolve conflicts before submitting.</div>}</div><div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary-classic" onClick={onSubmit} disabled={!message.trim() || (!amend && staged.length === 0) || conflicts || busy}>{busy && <LoaderCircle className="spin" size={14} />}{amend ? 'Amend' : 'Submit'}</button></div></section></div>
}

function ConflictResolver({ repoPath, conflicts, onClose, onChanged }: { repoPath: string; conflicts: ConflictFile[]; onClose: () => void; onChanged: () => Promise<ConflictFile[]> }): React.JSX.Element {
  const [index, setIndex] = useState(0)
  const [manual, setManual] = useState(conflicts[0]?.result || conflicts[0]?.ours || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const conflict = conflicts[Math.min(index, conflicts.length - 1)]
  useEffect(() => { setManual(conflict?.result || conflict?.ours || '') }, [conflict?.path])
  const blocks = conflictBlocks(manual)
  const resolve = async (resolution: 'ours' | 'theirs' | 'manual'): Promise<void> => {
    if (!conflict) return
    setBusy(true); setError('')
    try { await window.p4git.resolveConflict(repoPath, conflict.path, resolution, resolution === 'manual' ? manual : undefined); await onChanged() }
    catch (reason) { setError(friendlyError(reason)) }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop"><section className="conflict-dialog" role="dialog" aria-modal="true"><div className="modal-title"><AlertTriangle size={17} /><strong>Resolve Conflicts</strong><button onClick={onClose}><X size={16} /></button></div><div className="conflict-body"><aside>{conflicts.map((item, itemIndex) => <button title={item.path} key={item.path} className={itemIndex === index ? 'active' : ''} onClick={() => setIndex(itemIndex)}><AlertTriangle size={13} />{item.path}</button>)}</aside>{conflict && <div className="conflict-editor"><div className="conflict-versions"><label>Base<textarea readOnly value={conflict.binary ? 'Binary content — choose a side or use external Merge' : conflict.base} /></label><label>Ours<textarea readOnly value={conflict.binary ? 'Binary content' : conflict.ours} /></label><label>Theirs<textarea readOnly value={conflict.binary ? 'Binary content' : conflict.theirs} /></label></div><label>Result ({blocks.length} unresolved block{blocks.length === 1 ? '' : 's'})<textarea value={manual} disabled={conflict.binary} onChange={(event) => setManual(event.target.value)} /></label>{blocks.length > 0 && <div className="conflict-hunks">{blocks.map((block, blockIndex) => <div key={`${block.start}-${blockIndex}`}><strong>Conflict {blockIndex + 1}</strong><span>{block.ours.split('\n')[0] || '(empty)'} ↔ {block.theirs.split('\n')[0] || '(empty)'}</span><button onClick={() => setManual((value) => chooseConflictBlock(value, blockIndex, 'ours'))}>Use Ours</button><button onClick={() => setManual((value) => chooseConflictBlock(value, blockIndex, 'theirs'))}>Use Theirs</button><button onClick={() => setManual((value) => chooseConflictBlock(value, blockIndex, 'both'))}>Use Both</button></div>)}</div>}<div className="row-actions"><button onClick={() => void resolve('ours')} disabled={busy}>Accept File Ours</button><button onClick={() => void resolve('theirs')} disabled={busy}>Accept File Theirs</button><button onClick={async () => { setBusy(true); setError(''); try { if (!await window.p4git.launchExternalMerge(repoPath, conflict.path)) setError('No external Merge tool configured. Open Preferences to configure one.'); else await onChanged() } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }} disabled={busy}>External 3-way Merge...</button><button className="primary-classic" onClick={() => void resolve('manual')} disabled={busy || conflict.binary || blocks.length > 0}>Save Result &amp; Mark Resolved</button></div></div>}</div>{error && <div className="modal-warning">{error}</div>}<div className="modal-actions"><span>{conflicts.length} unresolved file(s)</span><button onClick={async () => { setBusy(true); try { await window.p4git.continueOperation(repoPath); const next = await onChanged(); if (!next.length) onClose() } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }} disabled={busy || conflicts.length > 0}>Continue Operation</button><button onClick={onClose}>Close</button></div></section></div>
}

function GetRevisionDialog({ repoPath, paths, initial, suggestions, onClose, onApply }: { repoPath: string; paths: string[]; initial: string; suggestions: string[]; onClose: () => void; onApply: (revision: RevisionResolution, paths: string[]) => Promise<void> }): React.JSX.Element {
  const [input, setInput] = useState(initial)
  const [resolved, setResolved] = useState<RevisionResolution>()
  const [selectedPaths, setSelectedPaths] = useState(new Set(paths))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const preview = async (): Promise<void> => { setBusy(true); setError(''); try { setResolved(await window.p4git.resolveRevision(repoPath, input)) } catch (reason) { setResolved(undefined); setError(friendlyError(reason)) } finally { setBusy(false) } }
  useEffect(() => { void preview() }, [])
  const toggle = (path: string): void => setSelectedPaths((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next })
  return <div className="modal-backdrop"><section className="revision-dialog"><div className="modal-title"><Download size={16} /><strong>Get Revision</strong><button onClick={onClose}><X size={16} /></button></div><div className="revision-query"><label>Revision, branch, tag, hash, or date<input autoFocus list="revision-suggestions" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void preview() }} /><datalist id="revision-suggestions">{suggestions.map((item) => <option key={item} value={item} />)}</datalist></label><button onClick={() => void preview()} disabled={busy || !input.trim()}>{busy && <LoaderCircle size={13} className="spin" />}Preview</button></div>{resolved && <div className="revision-summary"><code>{resolved.shortHash}</code><strong>{resolved.subject}</strong><span>{resolved.author} · {formatDate(resolved.date)}</span><em>{resolved.refs.join(' · ') || resolved.input}</em></div>}<div className="revision-targets"><strong>Workspace targets</strong>{paths.map((path) => <label title={path} key={path}><input type="checkbox" checked={selectedPaths.has(path)} onChange={() => toggle(path)} /><span>{path === '.' ? 'Entire workspace tree' : path}</span></label>)}</div><div className="revision-preview"><strong>Files changed by the selected commit ({resolved?.files.length ?? 0})</strong>{resolved?.files.map((file) => <div title={file.path} key={`${file.kind}-${file.path}`}><i className="change-mark">{file.kind.slice(0, 1)}</i><span>{file.path}</span></div>)}{resolved && !resolved.files.length && <EmptyTable text="This commit has no file changes." />}</div>{error && <div className="modal-warning">{error}</div>}<div className="modal-actions"><span className="modal-hint">Selected workspace files are replaced from this commit. Uncommitted tracked content may be overwritten.</span><button onClick={onClose}>Cancel</button><button className="primary-classic" disabled={!resolved || !selectedPaths.size || busy} onClick={async () => { if (!resolved || !window.confirm(`Get ${selectedPaths.size} target(s) from ${resolved.shortHash}?`)) return; setBusy(true); try { await onApply(resolved, [...selectedPaths]); onClose() } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>Get Revision</button></div></section></div>
}

function LfsLocksDialog({ repoPath, onClose }: { repoPath: string; onClose: () => void }): React.JSX.Element {
  const [status, setStatus] = useState<LfsStatus>()
  const [path, setPath] = useState('')
  const [selected, setSelected] = useState(new Set<string>())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async (): Promise<void> => { setBusy(true); try { setStatus(await window.p4git.getLfsStatus(repoPath)) } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }
  useEffect(() => { void load() }, [repoPath])
  const unlock = async (force = false): Promise<void> => { if (!selected.size) return; setBusy(true); setError(''); try { setStatus(await window.p4git.unlockLfsFiles(repoPath, [...selected], force)); setSelected(new Set()) } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }
  return <div className="modal-backdrop"><section className="lfs-dialog"><div className="modal-title"><Lock size={16} /><strong>Git LFS Locks</strong><button onClick={onClose}><X size={16} /></button></div><div className="lfs-status"><span className={status?.installed && !status.error ? 'ok' : 'warning'}>{status?.version ?? 'Checking Git LFS...'}</span><span>{status?.repositoryEnabled ? 'LFS filters configured in this repository' : 'No local LFS filter configuration detected'}</span><button onClick={() => void load()} disabled={busy}><RefreshCw size={13} />Refresh</button></div>{status?.error && <div className="modal-warning">{status.error}</div>}<div className="lfs-new"><input value={path} onChange={(event) => setPath(event.target.value)} placeholder="Relative file path to lock" /><button disabled={busy || !status?.installed || !path.trim()} onClick={async () => { setBusy(true); setError(''); try { setStatus(await window.p4git.lockLfsFiles(repoPath, [path.trim()])); setPath('') } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}><Lock size={13} />Lock</button></div><div className="lfs-list"><div className="lfs-head"><span /><span>Path</span><span>Owner</span><span>Locked</span></div>{status?.locks.map((item) => <label className={`lfs-row ${selected.has(item.path) ? 'selected' : ''}`} key={item.id}><input type="checkbox" checked={selected.has(item.path)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.path)) next.delete(item.path); else next.add(item.path); return next })} /><span title={item.path}>{item.path}</span><span>{item.owner}{item.mine ? ' (you)' : ''}</span><span>{item.lockedAt ? formatDate(item.lockedAt) : ''}</span></label>)}{status && !status.locks.length && <EmptyTable text="No Git LFS locks were reported by the remote." />}</div>{error && <div className="modal-warning">{error}</div>}<div className="modal-actions"><span>{selected.size} selected</span><button disabled={!selected.size || busy} onClick={() => void unlock(false)}><Unlock size={13} />Unlock Mine</button><button disabled={!selected.size || busy} onClick={() => void unlock(true)}>Force Unlock...</button><button onClick={onClose}>Close</button></div></section></div>
}

function TaskCenter({ tasks, onClose, onCancel, onClear }: { tasks: TaskProgress[]; onClose: () => void; onCancel: () => void; onClear: () => void }): React.JSX.Element {
  const running = tasks.filter((task) => task.state === 'running').length
  return <div className="modal-backdrop"><section className="task-dialog"><div className="modal-title"><LoaderCircle size={16} className={running ? 'spin' : ''} /><strong>Task Progress</strong><span>{running} running · {tasks.length} retained</span><button onClick={onClose}><X size={16} /></button></div><div className="task-list">{tasks.map((task) => <div className={`task-row ${task.state}`} key={task.id}><span>{task.state === 'running' ? <LoaderCircle className="spin" size={15} /> : task.state === 'succeeded' ? <CircleCheck size={15} /> : <XCircle size={15} />}</span><strong>{task.label}</strong><code title={task.command}>{task.command}</code><time>{formatDate(task.startedAt)}</time><em>{task.message ?? 'Running…'}</em><div className="task-progress"><i style={{ width: task.state === 'running' ? '45%' : task.state === 'succeeded' ? '100%' : '0%' }} /></div></div>)}{!tasks.length && <EmptyTable text="No Git tasks have run in this session." />}</div><div className="modal-actions"><button onClick={onClear} disabled={running === tasks.length}>Clear Finished</button><span className="grow" /><button onClick={onCancel} disabled={!running}><XCircle size={13} />Cancel Running</button><button onClick={onClose}>Close</button></div></section></div>
}

function CloneDialog({ onClose, onComplete }: { onClose: () => void; onComplete: (path: string) => void }): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [parent, setParent] = useState('')
  const [folder, setFolder] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="modal-backdrop"><section className="clone-dialog"><div className="modal-title"><FolderGit2 size={16} /><strong>Clone Repository</strong><button onClick={onClose}><X size={16} /></button></div><div className="modal-body"><label>Repository URL</label><input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://gitlab.example.com/group/project.git" /><label>Parent directory</label><div className="preference-path"><input readOnly value={parent} /><button onClick={async () => { const value = await window.p4git.chooseCloneParent(); if (value) setParent(value) }}>Browse...</button></div><label>Folder name (optional)</label><input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="project" />{error && <div className="modal-warning">{error}</div>}</div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary-classic" disabled={busy || !url.trim() || !parent} onClick={async () => { setBusy(true); setError(''); try { onComplete(await window.p4git.cloneRepository({ url, parentDirectory: parent, folderName: folder || undefined })) } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>{busy && <LoaderCircle className="spin" size={14} />}Clone</button></div></section></div>
}

function InitDialog({ onClose, onComplete }: { onClose: () => void; onComplete: (path: string) => void }): React.JSX.Element {
  const [directory, setDirectory] = useState('')
  const [branch, setBranch] = useState('main')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="modal-backdrop"><section className="clone-dialog"><div className="modal-title"><FolderGit2 size={16} /><strong>Initialize Repository</strong><button onClick={onClose}><X size={16} /></button></div><div className="modal-body"><label>Directory</label><div className="preference-path"><input readOnly value={directory} /><button onClick={async () => { const value = await window.p4git.chooseInitDirectory(); if (value) setDirectory(value) }}>Browse...</button></div><label>Initial branch</label><input value={branch} onChange={(event) => setBranch(event.target.value)} />{error && <div className="modal-warning">{error}</div>}</div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary-classic" disabled={busy || !directory || !branch.trim()} onClick={async () => { setBusy(true); setError(''); try { onComplete(await window.p4git.initRepository({ directory, initialBranch: branch })) } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>{busy && <LoaderCircle className="spin" size={14} />}Initialize</button></div></section></div>
}

function RemotesDialog({ repoPath, onClose }: { repoPath: string; onClose: () => void }): React.JSX.Element {
  const [remotes, setRemotes] = useState<RemoteInfo[]>([])
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState({ name: '', fetchUrl: '', pushUrl: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void window.p4git.getRemotes(repoPath).then(setRemotes).catch((reason) => setError(friendlyError(reason))) }, [repoPath])
  const choose = (remote?: RemoteInfo): void => { setSelected(remote?.name); setDraft(remote ? { name: remote.name, fetchUrl: remote.fetchUrl, pushUrl: remote.pushUrl } : { name: '', fetchUrl: '', pushUrl: '' }) }
  return <div className="modal-backdrop"><section className="manager-dialog"><div className="modal-title"><GitBranch size={16} /><strong>Manage Remotes</strong><button onClick={onClose}><X size={16} /></button></div><div className="manager-body"><aside><button onClick={() => choose()}><Plus size={13} />New Remote</button>{remotes.map((remote) => <button className={selected === remote.name ? 'active' : ''} key={remote.name} onClick={() => choose(remote)}><strong>{remote.name}</strong><span>{remote.fetchUrl}</span></button>)}</aside><div className="manager-form"><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Fetch URL<input value={draft.fetchUrl} onChange={(event) => setDraft({ ...draft, fetchUrl: event.target.value })} /></label><label>Push URL<input value={draft.pushUrl} onChange={(event) => setDraft({ ...draft, pushUrl: event.target.value })} placeholder="Same as Fetch URL" /></label><div className="row-actions"><button className="primary-classic" disabled={busy || !draft.name || !draft.fetchUrl} onClick={async () => { setBusy(true); try { const next = await window.p4git.saveRemote(repoPath, selected, draft.name, draft.fetchUrl, draft.pushUrl || undefined); setRemotes(next); choose(next.find((item) => item.name === draft.name)) } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>Save</button><button disabled={!selected || busy} onClick={async () => { if (!selected || !window.confirm(`Remove remote ${selected}?`)) return; setBusy(true); try { setRemotes(await window.p4git.deleteRemote(repoPath, selected)); choose() } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>Remove</button></div>{error && <div className="modal-warning">{error}</div>}</div></div><div className="modal-actions"><button onClick={onClose}>Close</button></div></section></div>
}

function PushDialog({ repoPath, branch, onClose, onPushed }: { repoPath: string; branch: string; onClose: () => void; onPushed: () => Promise<void> }): React.JSX.Element {
  const [remotes, setRemotes] = useState<RemoteInfo[]>([])
  const [remote, setRemote] = useState('origin')
  const [remoteBranch, setRemoteBranch] = useState(branch)
  const [setUpstream, setSetUpstream] = useState(true)
  const [preview, setPreview] = useState<PushPreview>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = { repoPath, remote, localBranch: branch, remoteBranch, setUpstream }
  const loadPreview = async (): Promise<void> => { setBusy(true); setError(''); try { setPreview(await window.p4git.getPushPreview(request)) } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }
  useEffect(() => { void window.p4git.getRemotes(repoPath).then((items) => { setRemotes(items); if (!items.some((item) => item.name === remote) && items[0]) setRemote(items[0].name) }).catch((reason) => setError(friendlyError(reason))) }, [repoPath])
  useEffect(() => { if (remotes.length) void loadPreview() }, [remote, remoteBranch, remotes.length])
  return <div className="modal-backdrop"><section className="push-dialog"><div className="modal-title"><Upload size={16} /><strong>Push</strong><button onClick={onClose}><X size={16} /></button></div><div className="push-options"><label>Remote<select value={remote} onChange={(event) => setRemote(event.target.value)}>{remotes.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Local branch<input readOnly value={branch} /></label><label>Remote branch<input value={remoteBranch} onChange={(event) => setRemoteBranch(event.target.value)} /></label><label className="check-filter"><input type="checkbox" checked={setUpstream} onChange={(event) => setSetUpstream(event.target.checked)} />Set upstream</label><button onClick={() => void loadPreview()}>Preview</button></div>{error && <div className="modal-warning">{error}</div>}<div className="push-commits"><strong>{preview?.commits.length ?? 0} commit(s) to {preview?.remoteUrl ?? remote}</strong>{preview?.commits.map((commit) => <div key={commit.hash}><code>{commit.shortHash}</code><span>{commit.subject}</span><em>{commit.author}</em></div>)}</div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary-classic" disabled={busy || !remote || !remoteBranch || !preview} onClick={async () => { setBusy(true); try { await window.p4git.pushTo(request); await onPushed() } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>{busy && <LoaderCircle className="spin" size={14} />}Push</button></div></section></div>
}

function ShelvesDialog({ repoPath, shelves, onClose, onUnshelved }: { repoPath: string; shelves: ShelfInfo[]; onClose: () => void; onUnshelved: (state: ChangelistState) => Promise<void> }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="modal-backdrop"><section className="git-list-dialog"><div className="modal-title"><FileText size={16} /><strong>Local Shelves</strong><button onClick={onClose}><X size={16} /></button></div><div className="shelves-list">{shelves.map((shelf) => <div key={shelf.hash}><strong>{shelf.name}</strong><span>{shelf.description || `${shelf.paths.length} files`}</span><time>{formatDate(shelf.createdAt)}</time><button disabled={busy} onClick={async () => { if (!window.confirm(`Unshelve ${shelf.name} into the current workspace?`)) return; setBusy(true); try { await onUnshelved(await window.p4git.unshelve(repoPath, shelf.hash)) } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>Unshelve</button></div>)}{!shelves.length && <EmptyTable text="No local shelves. Right-click a changelist to Shelve it." />}</div>{error && <div className="modal-warning">{error}</div>}<div className="modal-actions"><button onClick={onClose}>Close</button></div></section></div>
}

function BranchComparisonDialog({ repoPath, value, onClose, onMerge, onDiff }: { repoPath: string; value: BranchComparison; onClose: () => void; onMerge: (commits: CommitInfo[]) => Promise<boolean>; onDiff: (commit: CommitInfo, file: RevisionFile) => Promise<string | undefined> }): React.JSX.Element {
  const selection = useTableSelection(value.incoming.map((commit) => commit.hash))
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState<CommitDetails>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [diffView, setDiffView] = useState<{ title: string; content: string }>()
  const [error, setError] = useState('')
  const selected = value.incoming.filter((commit) => selection.selected.has(commit.hash))
  const openDetails = async (commit: CommitInfo): Promise<void> => {
    setDetailLoading(true); setError('')
    try { setDetails(await window.p4git.getCommitDetails(repoPath, commit.hash)) }
    catch (reason) { setError(friendlyError(reason)) }
    finally { setDetailLoading(false) }
  }
  const commitContext = async (commit: CommitInfo): Promise<void> => {
    const action = await window.p4git.showContextMenu({ kind: 'compare-commit' })
    if (action === 'view-commit-details' || action === 'commit-files') await openDetails(commit)
    else if (action === 'commit-diff') {
      setBusy(true); setError('')
      try { setDiffView({ title: `${commit.shortHash} — Diff Against Previous Revision`, content: await window.p4git.getCommitDiff(repoPath, commit.hash) }) }
      catch (reason) { setError(friendlyError(reason)) }
      finally { setBusy(false) }
    } else if (action === 'copy-hash') await navigator.clipboard.writeText(commit.hash)
  }
  return <>
    <div className="modal-backdrop"><section className="compare-dialog"><div className="modal-title"><GitGraph size={16} /><strong>Selective Merge: {value.selected} → {value.current}</strong><button onClick={onClose}><X size={16} /></button></div><div className="compare-help"><span>Select commits with Ctrl, Shift, or Ctrl+A. Right-click any commit for details. Files will be applied to a new local Changelist without committing.</span><button onClick={selection.selectAll} disabled={!value.incoming.length}>Select All Incoming</button></div><div className="compare-columns"><section className="incoming-commits" tabIndex={0} onKeyDown={selection.keyDown}><strong>Available from {value.selected} ({value.incoming.length})</strong>{value.incoming.map((commit) => <button type="button" className={`compare-commit ${selection.selected.has(commit.hash) ? 'selected' : ''}`} key={commit.hash} onClick={(event) => selection.click(commit.hash, event)} onDoubleClick={() => void openDetails(commit)} onContextMenu={(event) => { event.preventDefault(); void commitContext(commit) }}><input type="checkbox" tabIndex={-1} readOnly checked={selection.selected.has(commit.hash)} /><code>{commit.shortHash}</code><span title={commit.subject}>{commit.subject}</span><em title={commit.author}>{commit.author}</em></button>)}{!value.incoming.length && <p>No commits from this branch are missing from the current branch.</p>}{value.integrated.length > 0 && <><div className="compare-integrated-head"><CircleCheck size={13} />Already integrated equivalent patches ({value.integrated.length})</div>{value.integrated.map((commit) => <button type="button" className="compare-commit integrated" key={commit.hash} onDoubleClick={() => void openDetails(commit)} onContextMenu={(event) => { event.preventDefault(); void commitContext(commit) }}><CircleCheck size={14} /><code>{commit.shortHash}</code><span title={commit.subject}>{commit.subject}</span><em title={commit.author}>{commit.author}</em></button>)}</>}</section><section><strong>Already unique to {value.current} ({value.outgoing.length})</strong>{value.outgoing.map((commit) => <button type="button" className="compare-readonly" key={commit.hash} onDoubleClick={() => void openDetails(commit)} onContextMenu={(event) => { event.preventDefault(); void commitContext(commit) }}><code>{commit.shortHash}</code><span title={commit.subject}>{commit.subject}</span><em title={commit.author}>{commit.author}</em></button>)}{!value.outgoing.length && <p>No outgoing commits.</p>}</section></div>{error && <div className="modal-warning">{error}</div>}<div className="modal-actions"><span>{selected.length} commit(s) selected{detailLoading ? ' · Loading details…' : ''}</span><span className="grow" /><button onClick={onClose} disabled={busy}>Close</button><button className="primary-classic" disabled={!selected.length || busy} onClick={async () => { setBusy(true); try { await onMerge(selected) } finally { setBusy(false) } }}>{busy && <LoaderCircle className="spin" size={14} />}Merge Selected into New Changelist…</button></div></section></div>
    {details && <CommitDetailsDialog value={details} onClose={() => setDetails(undefined)} onFileContext={async (file) => {
      const action = await window.p4git.showContextMenu({ kind: 'compare-file' })
      if (action === 'copy-path') await navigator.clipboard.writeText(file.path)
      else if (action === 'diff-local') {
        try { const content = await onDiff(details, file); if (content !== undefined) setDiffView({ title: `${file.path} — ${details.shortHash} vs Local Workspace`, content }) }
        catch (reason) { setError(friendlyError(reason)) }
      }
    }} />}
    {diffView && <TextDiffDialog title={diffView.title} content={diffView.content} onClose={() => setDiffView(undefined)} />}
  </>
}

function CommitDetailsDialog({ value, onClose, onFileContext }: { value: CommitDetails; onClose: () => void; onFileContext: (file: RevisionFile) => void }): React.JSX.Element {
  return <div className="modal-backdrop nested-modal"><section className="commit-details-dialog"><div className="modal-title"><GitCommit size={16} /><strong>Commit Details — {value.shortHash}</strong><button onClick={onClose}><X size={16} /></button></div><div className="commit-details-summary"><strong>Commit</strong><code>{value.hash}</code><strong>Author</strong><span>{value.author} &lt;{value.email}&gt;</span><strong>Date</strong><span>{formatDate(value.date)}</span><strong>Parents</strong><span>{value.parents.join(', ') || 'Root commit'}</span></div><pre className="commit-message">{value.message}</pre><div className="commit-files"><div className="commit-file-head"><span>Status</span><span>File</span><span>Previous path</span></div>{value.files.map((file) => <button key={`${file.kind}-${file.oldPath ?? ''}-${file.path}`} onContextMenu={(event) => { event.preventDefault(); onFileContext(file) }}><span className="commit-file-status"><i className={`change-mark ${file.kind === 'A' ? 'added' : file.kind === 'D' ? 'deleted' : 'modified'}`}>{file.kind}</i>{revisionFileLabel(file.kind)}</span><span title={file.path}>{file.path}</span><span title={file.oldPath}>{file.oldPath ?? ''}</span></button>)}{!value.files.length && <EmptyTable text="This commit has no changed files." />}</div><div className="modal-actions"><span>Right-click a file to diff it against the local workspace.</span><span className="grow" /><button onClick={onClose}>Close</button></div></section></div>
}

function TextDiffDialog({ title, content, onClose }: { title: string; content: string; onClose: () => void }): React.JSX.Element {
  return <div className="modal-backdrop nested-modal"><section className="text-diff-dialog"><div className="modal-title"><FileDiff size={16} /><strong>{title}</strong><button onClick={onClose}><X size={16} /></button></div><pre>{content || 'No textual differences.'}</pre><div className="modal-actions"><button onClick={onClose}>Close</button></div></section></div>
}

function PendingDiffDialog({ value, onChange, onClose }: { value: PendingDiffView; onChange: (value: PendingDiffView) => void; onClose: () => void }): React.JSX.Element {
  const activeIndex = Math.max(0, value.items.findIndex((item) => item.key === value.activeKey))
  const active = value.items[activeIndex]
  const loaded = value.items.filter((item) => item.content !== undefined || item.error !== undefined).length
  const selectIndex = (index: number): void => {
    const item = value.items[Math.max(0, Math.min(value.items.length - 1, index))]
    if (item) onChange({ ...value, activeKey: item.key })
  }
  return <div className="modal-backdrop"><section className="pending-diff-dialog" role="dialog" aria-modal="true"><div className="modal-title"><FileDiff size={16} /><strong>Diff Selected Files ({value.items.length})</strong><span>{loaded}/{value.items.length} loaded</span><button onClick={onClose}><X size={16} /></button></div><div className="pending-diff-body"><aside><div className="pending-diff-head">Files</div>{value.items.map((item) => <button key={item.key} className={item.key === active?.key ? 'active' : ''} onClick={() => onChange({ ...value, activeKey: item.key })} title={item.change.path}><i className={`change-mark ${item.change.kind}`}>{changeCode(item.change)}</i><span>{item.change.path}</span><em>{item.staged ? 'HEAD ↔ Git index' : item.change.kind === 'untracked' ? 'Empty ↔ Workspace' : item.change.staged ? 'Git index ↔ Workspace' : 'HEAD ↔ Workspace'}</em>{item.error ? <AlertTriangle size={13} /> : item.content === undefined ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}</button>)}</aside><section><header><strong title={active?.change.path}>{active?.change.path}</strong><span>{active?.staged ? 'HEAD ↔ Git index' : active?.change.kind === 'untracked' ? 'Empty ↔ Workspace' : active?.change.staged ? 'Git index ↔ Workspace' : 'HEAD ↔ Workspace'}</span></header><pre className={active?.error ? 'error' : ''}>{active?.error ?? active?.content ?? 'Loading diff...'}</pre></section></div><div className="modal-actions"><button onClick={() => selectIndex(activeIndex - 1)} disabled={activeIndex <= 0}>Previous File</button><button onClick={() => selectIndex(activeIndex + 1)} disabled={activeIndex >= value.items.length - 1}>Next File</button><span>{activeIndex + 1} of {value.items.length}</span><span className="grow" /><button onClick={onClose}>Close</button></div></section></div>
}

function SelectiveMergeDialog({ value, onChange, onClose, onMerge, busy, currentBranch }: { value: SelectiveMergeEditorState; onChange: (value: SelectiveMergeEditorState) => void; onClose: () => void; onMerge: () => void; busy: boolean; currentBranch: string }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="selective-merge-dialog"><div className="modal-title"><GitGraph size={16} /><strong>Merge Selected Commits into New Changelist</strong><button onClick={onClose} disabled={busy}><X size={16} /></button></div><div className="selective-merge-form"><div className="modal-warning">No Git commit will be created. The workspace must be clean; merged files will remain local in the new Changelist.</div><label>Current branch<input readOnly value={currentBranch} /></label><label>Source<input readOnly value={value.source ?? 'Selected Revision Graph commits'} /></label><label>New Changelist name<input autoFocus value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label><label>Description<textarea value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /></label><strong>{value.commits.length} commit(s), applied oldest/parent first</strong><div className="selective-commit-list">{value.commits.map((commit) => <div key={commit.hash}><code>{commit.shortHash}</code><span title={commit.subject}>{commit.subject}</span><em>{commit.author}</em></div>)}</div></div><div className="modal-actions"><button onClick={onClose} disabled={busy}>Cancel</button><button className="primary-classic" onClick={onMerge} disabled={busy || !value.name.trim()}>{busy && <LoaderCircle className="spin" size={14} />}Create Changelist &amp; Apply</button></div></section></div>
}

function GitLabDialog({ repoPath, branch, branches, config, overview, onClose, onUpdate }: { repoPath: string; branch: string; branches: BranchInfo[]; config: GitLabConfig; overview?: GitLabOverview; onClose: () => void; onUpdate: (config: GitLabConfig, overview?: GitLabOverview) => void }): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [projectPath, setProjectPath] = useState(config.projectPath)
  const [token, setToken] = useState('')
  const [tab, setTab] = useState<'mrs' | 'pipelines' | 'issues'>('mrs')
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('main')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async (): Promise<void> => { const next = await window.p4git.getGitLabOverview(repoPath); onUpdate(next.config, next) }
  return <div className="modal-backdrop"><section className="gitlab-dialog"><div className="modal-title"><GitBranch size={16} /><strong>GitLab — {projectPath || 'Configure project'}</strong><button onClick={onClose}><X size={16} /></button></div><div className="gitlab-settings"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://gitlab.example.com" /><input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="group/project" /><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={config.tokenConfigured ? 'Token stored securely — enter to replace' : 'Personal access token (api scope)'} /><button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const saved = await window.p4git.saveGitLabConfig(repoPath, baseUrl, projectPath, token || undefined); setToken(''); onUpdate(saved); await refresh() } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>Save &amp; Connect</button></div><div className="gitlab-tabs"><button className={tab === 'mrs' ? 'active' : ''} onClick={() => setTab('mrs')}>Merge Requests</button><button className={tab === 'pipelines' ? 'active' : ''} onClick={() => setTab('pipelines')}>Pipelines</button><button className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>Issues / Jobs</button><button onClick={() => void refresh()}>Refresh</button></div>{error && <div className="modal-warning">{error}</div>}<div className="gitlab-content">{tab === 'mrs' && <><div className="create-mr"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New merge request title" /><span>{branch} →</span><select value={target} onChange={(event) => setTarget(event.target.value)}>{branches.filter((item) => !item.remote).map((item) => <option key={item.name}>{item.name}</option>)}</select><button disabled={!title.trim() || busy} onClick={async () => { setBusy(true); try { await window.p4git.createGitLabMergeRequest(repoPath, title, branch, target); setTitle(''); await refresh() } catch (reason) { setError(friendlyError(reason)) } finally { setBusy(false) } }}>Create MR</button></div>{overview?.mergeRequests.map((mr) => <button key={mr.iid} onClick={() => void window.p4git.openExternal(mr.webUrl)}><strong>!{mr.iid}</strong><span>{mr.title}<em>{mr.sourceBranch} → {mr.targetBranch}</em></span><i>{mr.pipelineStatus ?? mr.state}</i></button>)}</>}{tab === 'pipelines' && overview?.pipelines.map((pipeline) => <button key={pipeline.id} onClick={() => void window.p4git.openExternal(pipeline.webUrl)}><strong>#{pipeline.iid}</strong><span>{pipeline.ref}<em>{pipeline.sha.slice(0, 8)}</em></span><i className={`pipeline-${pipeline.status}`}>{pipeline.status}</i></button>)}{tab === 'issues' && overview?.issues.map((issue) => <button key={issue.iid} onClick={() => void window.p4git.openExternal(issue.webUrl)}><strong>#{issue.iid}</strong><span>{issue.title}<em>{issue.labels.join(', ')}</em></span><i>{issue.state}</i></button>)}{!overview && <div className="detail-empty">Save a GitLab configuration to load project data.</div>}</div><div className="modal-actions"><span>Token is encrypted with the operating system account.</span><button onClick={onClose}>Close</button></div></section></div>
}

function EmptyTable({ text }: { text: string }): React.JSX.Element {
  return <div className="empty-table">{text}</div>
}

function ErrorToast({ message, close }: { message: string; close: () => void }): React.JSX.Element {
  return <div className="error-toast"><AlertTriangle size={17} /><span>{message}</span><button onClick={close}><X size={14} /></button></div>
}

function matchesFilter(value: string, expression: string): boolean {
  const caseSensitive = expression.startsWith('case:')
  const withoutCase = expression.replace(/^(?:case|nocase):/, '')
  const separator = withoutCase.indexOf(':')
  const mode = separator >= 0 ? withoutCase.slice(0, separator) : 'contains'
  const query = separator >= 0 ? withoutCase.slice(separator + 1) : withoutCase
  if (!query) return true
  if (mode === 'regex') {
    try { return new RegExp(query, caseSensitive ? '' : 'i').test(value) } catch { return false }
  }
  const haystack = caseSensitive ? value : value.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  return mode === 'prefix' ? haystack.startsWith(needle) : haystack.includes(needle)
}

function getMatchCount(tab: MainTab, filter: string, entries: WorkspaceEntry[], changes: FileChange[], commits: CommitInfo[], branches: BranchInfo[], settings: AppSettings, fileHistory: CommitInfo[] = []): number {
  const matches = (value: string): boolean => matchesFilter(value, filter)
  if (tab === 'files') return entries.filter((entry) => matches(entry.name)).length
  if (tab === 'history') return fileHistory.filter((commit) => matches(`${commit.shortHash} ${commit.author} ${commit.subject}`)).length
  if (tab === 'pending') return changes.filter((change) => matches(change.path)).length
  if (tab === 'submitted') return commits.filter((commit) => matches(`${commit.shortHash} ${commit.author} ${commit.subject}`)).length
  if (tab === 'stream') return branches.filter((branch) => matches(branch.name)).length
  return settings.recentRepositories.filter(matches).length
}
