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
  FilePlus2,
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
import type {
  AppSettings,
  BranchInfo,
  CommitInfo,
  FileChange,
  GitHealth,
  MenuAction,
  RepositorySummary,
  WorkspaceEntry
} from '../../shared/types'

type MainTab = 'files' | 'pending' | 'submitted' | 'stream' | 'workspaces'
type DetailTab = 'details' | 'files' | 'jobs' | 'diff'

interface PendingSelection {
  change: FileChange
  staged: boolean
}

interface LogEntry {
  id: number
  time: string
  text: string
  kind: 'command' | 'success' | 'error'
}

const tabLabels: Record<MainTab, string> = {
  files: 'Files',
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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']))
  const [currentDirectory, setCurrentDirectory] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceEntry>()
  const [pendingSelection, setPendingSelection] = useState<PendingSelection>()
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo>()
  const [selectedBranch, setSelectedBranch] = useState<BranchInfo>()
  const [mainTab, setMainTab] = useState<MainTab>('submitted')
  const [detailTab, setDetailTab] = useState<DetailTab>('details')
  const [filter, setFilter] = useState('')
  const [diff, setDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [submitOpen, setSubmitOpen] = useState(false)
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

  const loadSupplemental = useCallback(async (root: string) => {
    const [nextHistory, nextBranches] = await Promise.all([
      window.p4git.getHistory(root),
      window.p4git.getBranches(root)
    ])
    setHistory(nextHistory)
    setBranches(nextBranches)
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
      setEntriesByPath({})
      setExpandedPaths(new Set(['']))
      setMainTab('submitted')
      await Promise.all([loadDirectory(summary.root, ''), loadSupplemental(summary.root)])
      setSettings(await window.p4git.getSettings())
      appendLog(`Workspace opened: ${summary.root}`, 'success')
    } catch (reason) {
      const message = friendlyError(reason)
      setError(message)
      appendLog(message, 'error')
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, loadDirectory, loadSupplemental])

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
      loadDirectory(repository.root, currentDirectory),
      loadSupplemental(repository.root)
    ])
    setRepository(summary)
  }, [currentDirectory, loadDirectory, loadSupplemental, repository])

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
    } catch (reason) {
      const message = friendlyError(reason)
      setError(message)
      appendLog(message, 'error')
    } finally {
      setBusy(undefined)
    }
  }, [appendLog, refresh])

  const staged = useMemo(
    () => repository?.changes.filter((change) => change.staged) ?? [],
    [repository]
  )
  const unstaged = useMemo(
    () => repository?.changes.filter((change) => change.unstaged) ?? [],
    [repository]
  )
  const hasConflicts = repository?.changes.some((change) => change.conflicted) ?? false

  const selectedChange = pendingSelection?.change ?? (
    selectedEntry
      ? repository?.changes.find((change) => change.path === selectedEntry.path)
      : undefined
  )

  const showDiff = useCallback(async (change: FileChange, stagedVersion: boolean) => {
    if (!repository) return
    setPendingSelection({ change, staged: stagedVersion })
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
  }, [repository])

  const chooseRepository = useCallback(async () => {
    const repoPath = await window.p4git.chooseRepository()
    if (repoPath) await openRepository(repoPath)
  }, [openRepository])

  const chooseGit = useCallback(async () => {
    const next = await window.p4git.chooseGitExecutable()
    if (!next) return
    setHealth(next)
    appendLog(next.available ? `Git configured: ${next.path}` : next.error || 'Git unavailable', next.available ? 'success' : 'error')
  }, [appendLog])

  const stageSelected = useCallback(async () => {
    if (!repository || !selectedChange) return
    const paths = selectedChange.oldPath ? [selectedChange.path, selectedChange.oldPath] : [selectedChange.path]
    await perform('stage', `git add -- ${paths.join(' ')}`, () => window.p4git.stage(repository.root, paths), `${selectedChange.path} opened for submit.`)
  }, [perform, repository, selectedChange])

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

  const revertSelected = useCallback(async () => {
    if (!repository || !selectedChange || !selectedChange.unstaged || selectedChange.kind === 'untracked') return
    if (!window.confirm(`Revert local changes to ${selectedChange.path}?\n\nThis cannot be undone by P4Git.`)) return
    await perform('revert', `git restore --worktree -- ${selectedChange.path}`, () => window.p4git.discard(repository.root, [selectedChange.path]), `${selectedChange.path} reverted.`)
    setPendingSelection(undefined)
  }, [perform, repository, selectedChange])

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

  const handleMenuAction = useCallback((action: MenuAction) => {
    switch (action) {
      case 'open-workspace': void chooseRepository(); break
      case 'focus-filter': filterRef.current?.focus(); break
      case 'refresh': if (repository) void perform('refresh', 'git status', refresh, 'Workspace refreshed.', false); break
      case 'get-latest': void getLatest(); break
      case 'submit': setMainTab('pending'); setSubmitOpen(true); break
      case 'revert': void revertSelected(); break
      case 'diff': if (selectedChange) void showDiff(selectedChange, pendingSelection?.staged ?? selectedChange.staged); break
      case 'fetch': void fetchRemote(); break
      case 'push': void push(); break
      case 'settings': void chooseGit(); break
      case 'about': window.alert('P4Git 0.1.0\nA P4V-style desktop workflow for Git.\nMIT License'); break
    }
  }, [chooseGit, chooseRepository, fetchRemote, getLatest, pendingSelection?.staged, perform, push, refresh, repository, revertSelected, selectedChange, showDiff])

  useEffect(() => window.p4git.onMenuAction(handleMenuAction), [handleMenuAction])

  async function toggleTreePath(path: string): Promise<void> {
    if (!repository) return
    const next = new Set(expandedPaths)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
      if (!entriesByPath[path]) await loadDirectory(repository.root, path)
    }
    setExpandedPaths(next)
  }

  async function selectDirectory(path: string): Promise<void> {
    if (!repository) return
    setCurrentDirectory(path)
    setSelectedEntry(undefined)
    if (!entriesByPath[path]) await loadDirectory(repository.root, path)
    setMainTab('files')
  }

  async function submitCommit(): Promise<void> {
    if (!repository || !commitMessage.trim() || staged.length === 0) return
    await perform('commit', `git commit -m "${commitMessage.trim()}"`, () => window.p4git.commit(repository.root, commitMessage), 'Change submitted as a local Git commit.')
    setCommitMessage('')
    setSubmitOpen(false)
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

  const canCheckout = Boolean(selectedChange?.unstaged && selectedChange.kind === 'modified')
  const canAdd = Boolean(selectedChange?.unstaged && selectedChange.kind === 'untracked')
  const canDelete = Boolean(selectedChange?.unstaged && selectedChange.kind === 'deleted')
  const canRevert = Boolean(selectedChange?.unstaged && selectedChange.kind !== 'untracked')

  return (
    <main className={`p4v-shell ${logCollapsed ? 'log-collapsed' : ''}`}>
      <Toolbar
        busy={busy}
        canCheckout={canCheckout}
        canAdd={canAdd}
        canDelete={canDelete}
        canRevert={canRevert}
        canDiff={Boolean(selectedChange)}
        onRefresh={() => void perform('refresh', 'git status', refresh, 'Workspace refreshed.', false)}
        onGetLatest={() => void getLatest()}
        onSubmit={() => { setMainTab('pending'); setSubmitOpen(true) }}
        onCheckout={() => void stageSelected()}
        onAdd={() => void stageSelected()}
        onDelete={() => void stageSelected()}
        onRevert={() => void revertSelected()}
        onDiff={() => selectedChange && void showDiff(selectedChange, pendingSelection?.staged ?? selectedChange.staged)}
        onRevgraph={() => setMainTab('stream')}
      />

      <div className="location-bar">
        <span className="location-root">{repository.root.slice(0, 3)}</span>
        <input value={`${repository.root}${currentDirectory ? `\\${currentDirectory.replaceAll('/', '\\')}` : ''}`} readOnly />
        <button title="Location history"><ChevronDown size={14} /></button>
        <button className="bookmark-button" title="Bookmark workspace"><Bookmark size={17} fill="currentColor" /></button>
      </div>

      <div className="workbench">
        <aside className="workspace-pane">
          <div className="pane-tabs"><button>Depot</button><button className="active"><Folder size={16} fill="#d7a743" />Workspace</button><span /><button title="Sort"><Columns3 size={15} /></button><button title="Filter tree"><Filter size={15} /></button></div>
          <button className="workspace-selector"><Monitor size={17} /><strong>{repository.name}</strong><span>({repository.branch})</span><ChevronDown size={14} /></button>
          <div className="tree-scroll">
            <div className={`tree-row root ${currentDirectory === '' ? 'selected' : ''}`} onClick={() => void selectDirectory('')}>
              <button onClick={(event) => { event.stopPropagation(); void toggleTreePath('') }}>{expandedPaths.has('') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <HardDrive size={16} /><span>{repository.root}</span>
            </div>
            {expandedPaths.has('') && <TreeChildren parent="" depth={1} root={repository.root} entriesByPath={entriesByPath} expanded={expandedPaths} currentDirectory={currentDirectory} onToggle={toggleTreePath} onSelectDirectory={selectDirectory} onSelectFile={(entry) => { setSelectedEntry(entry); const change = repository.changes.find((item) => item.path === entry.path); if (change) setPendingSelection({ change, staged: change.staged && !change.unstaged }) }} />}
          </div>
        </aside>

        <section className="content-pane">
          <div className="main-tabs">
            {(Object.keys(tabLabels) as MainTab[]).map((tab) => <button key={tab} className={mainTab === tab ? 'active' : ''} onClick={() => setMainTab(tab)}>{tab === 'files' && <FileText size={16} />}{tab === 'pending' && <AlertTriangle size={16} fill="#d73e45" />}{tab === 'submitted' && <span className="submitted-icon">▲</span>}{tab === 'stream' && <GitGraph size={16} />}{tab === 'workspaces' && <Monitor size={16} />}{tabLabels[tab]}{tab === 'submitted' && <span className="tab-close">×</span>}</button>)}
          </div>
          <div className="filter-bar"><button><ChevronRight size={15} /></button><strong>Filter:</strong><input ref={filterRef} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="none applied" /><span>{getMatchCount(mainTab, filter, entriesByPath[currentDirectory] ?? [], repository.changes, history, branches, settings)} matches</span><Filter size={15} /><button onClick={() => void perform('refresh', 'git status', refresh, 'Workspace refreshed.', false)} title="Refresh view"><RefreshCw size={16} className={busy === 'refresh' ? 'spin' : ''} /></button></div>

          <div className="table-area">
            {mainTab === 'files' && <FilesTable entries={entriesByPath[currentDirectory] ?? []} changes={repository.changes} filter={filter} selected={selectedEntry?.path} onSelect={(entry) => { setSelectedEntry(entry); const change = repository.changes.find((item) => item.path === entry.path); setPendingSelection(change ? { change, staged: change.staged && !change.unstaged } : undefined) }} onOpen={(entry) => entry.isDirectory ? void selectDirectory(entry.path) : (() => { const change = repository.changes.find((item) => item.path === entry.path); if (change) void showDiff(change, change.staged && !change.unstaged) })()} />}
            {mainTab === 'pending' && <PendingTable staged={staged} unstaged={unstaged} filter={filter} selected={pendingSelection} onSelect={(change, isStaged) => { setSelectedEntry(undefined); setPendingSelection({ change, staged: isStaged }); setDetailTab('details') }} onOpen={(change, isStaged) => void showDiff(change, isStaged)} onStage={(change) => void stageChange(change)} onUnstage={(change) => void unstageChange(change)} />}
            {mainTab === 'submitted' && <SubmittedTable commits={history} filter={filter} selected={selectedCommit?.hash} onSelect={(commit) => { setSelectedCommit(commit); setDetailTab('details') }} />}
            {mainTab === 'stream' && <StreamTable branches={branches} filter={filter} selected={selectedBranch?.name} onSelect={setSelectedBranch} onCheckout={(branch) => void perform('checkout', `git switch ${branch.name}`, () => window.p4git.checkout({ repoPath: repository.root, branch: branch.name }), `Switched to ${branch.name}.`)} newBranch={newBranch} onNewBranch={setNewBranch} onCreate={() => void createBranch()} busy={Boolean(busy)} />}
            {mainTab === 'workspaces' && <WorkspacesTable paths={settings.recentRepositories} active={repository.root} filter={filter} onOpen={(path) => void openRepository(path)} />}
          </div>

          <div className="detail-pane">
            <div className="detail-tabs">{(['details', 'files', 'jobs', 'diff'] as DetailTab[]).map((tab) => <button key={tab} className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>{tab === 'details' ? 'Details' : tab === 'files' ? 'Files' : tab === 'jobs' ? 'Jobs' : 'Diff Summary'}</button>)}</div>
            <DetailContent tab={detailTab} pending={pendingSelection} commit={selectedCommit} branch={selectedBranch} entry={selectedEntry} diff={diff} diffLoading={diffLoading} />
          </div>
        </section>
      </div>

      <section className={`log-pane ${logCollapsed ? 'collapsed' : ''}`}>
        <div className="log-tab"><button onClick={() => setLogCollapsed(!logCollapsed)}><FileText size={14} />Log</button><span /><button onClick={() => setLogs([])} title="Clear log"><X size={13} /></button></div>
        {!logCollapsed && <div className="log-output">{logs.map((entry) => <div key={entry.id} className={entry.kind}><span>●</span><time>{entry.time}</time><code>{entry.text}</code></div>)}</div>}
      </section>

      <footer className="classic-status"><span>{repository.root.slice(0, 3)}</span><span>{repository.root}{currentDirectory ? `\\${currentDirectory.replaceAll('/', '\\')}` : ''}</span><span className="grow" /><span>{repository.upstream ? `Tracking ${repository.upstream}` : 'No upstream'}</span><span className="status-ready"><Check size={13} /></span></footer>

      {submitOpen && <SubmitDialog staged={staged} message={commitMessage} onMessage={setCommitMessage} onCancel={() => setSubmitOpen(false)} onSubmit={() => void submitCommit()} busy={busy === 'commit'} conflicts={hasConflicts} />}
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
  onRefresh: () => void
  onGetLatest: () => void
  onSubmit: () => void
  onCheckout: () => void
  onAdd: () => void
  onDelete: () => void
  onRevert: () => void
  onDiff: () => void
  onRevgraph: () => void
}): React.JSX.Element {
  const blocked = Boolean(props.busy)
  return <div className="classic-toolbar">
    <Tool icon={<RefreshCw />} label="Refresh" onClick={props.onRefresh} disabled={blocked} busy={props.busy === 'refresh'} />
    <Tool icon={<Download />} label="Get Latest" onClick={props.onGetLatest} disabled={blocked} busy={props.busy === 'pull'} />
    <Tool icon={<Upload />} label="Submit" onClick={props.onSubmit} disabled={blocked} />
    <i />
    <Tool icon={<Check />} label="Checkout" onClick={props.onCheckout} disabled={blocked || !props.canCheckout} title="Open selected modified file for submit (Git stage)" />
    <Tool icon={<Plus />} label="Add" onClick={props.onAdd} disabled={blocked || !props.canAdd} title="Add selected untracked file (Git stage)" />
    <Tool icon={<Minus />} label="Delete" onClick={props.onDelete} disabled={blocked || !props.canDelete} title="Open selected deletion for submit (Git stage)" />
    <Tool icon={<RotateCcw />} label="Revert" onClick={props.onRevert} disabled={blocked || !props.canRevert} />
    <i />
    <Tool icon={<FileDiff />} label="Diff" onClick={props.onDiff} disabled={!props.canDiff} />
    <Tool icon={<Ban />} label="Timelapse" disabled />
    <Tool icon={<GitGraph />} label="Revgraph" onClick={props.onRevgraph} />
    <i />
    <Tool icon={<XCircle />} label="Cancel" disabled />
  </div>
}

function Tool({ icon, label, onClick, disabled, busy, title }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; busy?: boolean; title?: string }): React.JSX.Element {
  return <button className="tool-button" onClick={onClick} disabled={disabled} title={title}>{busy ? <LoaderCircle className="spin" /> : icon}<span>{label}</span></button>
}

function TreeChildren({ parent, depth, root, entriesByPath, expanded, currentDirectory, onToggle, onSelectDirectory, onSelectFile }: {
  parent: string
  depth: number
  root: string
  entriesByPath: Record<string, WorkspaceEntry[]>
  expanded: Set<string>
  currentDirectory: string
  onToggle: (path: string) => Promise<void>
  onSelectDirectory: (path: string) => Promise<void>
  onSelectFile: (entry: WorkspaceEntry) => void
}): React.JSX.Element {
  return <>{(entriesByPath[parent] ?? []).map((entry) => <div key={entry.path}>
    <div className={`tree-row ${currentDirectory === entry.path ? 'selected' : ''}`} style={{ paddingLeft: 5 + depth * 18 }} onDoubleClick={() => entry.isDirectory && void onToggle(entry.path)} onClick={() => entry.isDirectory ? void onSelectDirectory(entry.path) : onSelectFile(entry)}>
      {entry.isDirectory ? <button onClick={(event) => { event.stopPropagation(); void onToggle(entry.path) }}>{expanded.has(entry.path) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="tree-indent" />}
      {entry.isDirectory ? <Folder size={16} fill="#d8b15c" /> : <File size={14} />}
      <span>{entry.name}</span>
    </div>
    {entry.isDirectory && expanded.has(entry.path) && <TreeChildren parent={entry.path} depth={depth + 1} root={root} entriesByPath={entriesByPath} expanded={expanded} currentDirectory={currentDirectory} onToggle={onToggle} onSelectDirectory={onSelectDirectory} onSelectFile={onSelectFile} />}
  </div>)}</>
}

function FilesTable({ entries, changes, filter, selected, onSelect, onOpen }: { entries: WorkspaceEntry[]; changes: FileChange[]; filter: string; selected?: string; onSelect: (entry: WorkspaceEntry) => void; onOpen: (entry: WorkspaceEntry) => void }): React.JSX.Element {
  const query = filter.toLowerCase()
  const rows = entries.filter((entry) => entry.name.toLowerCase().includes(query))
  return <div className="classic-table files-table"><div className="table-head"><span>Name</span><span>Type</span><span>Action</span><span>Path</span></div>{rows.map((entry) => { const change = changes.find((item) => item.path === entry.path); return <button key={entry.path} className={`table-row ${selected === entry.path ? 'selected' : ''}`} onClick={() => onSelect(entry)} onDoubleClick={() => onOpen(entry)}><span className="file-name">{entry.isDirectory ? <Folder size={16} fill="#d8b15c" /> : <File size={15} />}{entry.name}</span><span>{entry.isDirectory ? 'Folder' : parts(entry.name).name.includes('.') ? parts(entry.name).name.split('.').pop()?.toUpperCase() : 'File'}</span><span>{change ? changeLabel(change) : ''}</span><span>{parts(entry.path).directory || '.'}</span></button> })}{rows.length === 0 && <EmptyTable text="No files match the current filter." />}</div>
}

function PendingTable({ staged, unstaged, filter, selected, onSelect, onOpen, onStage, onUnstage }: { staged: FileChange[]; unstaged: FileChange[]; filter: string; selected?: PendingSelection; onSelect: (change: FileChange, staged: boolean) => void; onOpen: (change: FileChange, staged: boolean) => void; onStage: (change: FileChange) => void; onUnstage: (change: FileChange) => void }): React.JSX.Element {
  const query = filter.toLowerCase()
  const groups = [{ title: 'Ready to submit', rows: staged, staged: true }, { title: 'Default changelist', rows: unstaged, staged: false }]
  return <div className="classic-table pending-table"><div className="table-head"><span>Changelist</span><span>File</span><span>Action</span><span>Folder</span></div>{groups.map((group) => <div className="table-group" key={group.title} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const [source, ...pathParts] = event.dataTransfer.getData('text/plain').split(':'); const sourceRows = source === 'ready' ? staged : unstaged; const change = sourceRows.find((item) => item.path === pathParts.join(':')); if (change && group.staged !== (source === 'ready')) group.staged ? onStage(change) : onUnstage(change) }}><div className="group-row" title="Drag files between changelists"><ChevronDown size={14} /><strong>{group.title}</strong><span>{group.rows.length} files</span></div>{group.rows.filter((change) => change.path.toLowerCase().includes(query)).map((change) => <button draggable key={`${group.staged}-${change.path}`} className={`table-row ${selected?.change.path === change.path && selected.staged === group.staged ? 'selected' : ''}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `${group.staged ? 'ready' : 'default'}:${change.path}`) }} onClick={() => onSelect(change, group.staged)} onDoubleClick={() => onOpen(change, group.staged)}><span>{group.title}</span><span className="file-name"><i className={`change-mark ${change.kind}`}>{changeCode(change)}</i>{parts(change.path).name}</span><span>{changeLabel(change)}</span><span>{parts(change.path).directory || '.'}</span></button>)}</div>)}{staged.length + unstaged.length === 0 && <EmptyTable text="Workspace is clean. There are no pending files." />}</div>
}

function SubmittedTable({ commits, filter, selected, onSelect }: { commits: CommitInfo[]; filter: string; selected?: string; onSelect: (commit: CommitInfo) => void }): React.JSX.Element {
  const query = filter.toLowerCase()
  const rows = commits.filter((commit) => `${commit.shortHash} ${commit.author} ${commit.subject}`.toLowerCase().includes(query))
  return <div className="classic-table submitted-table"><div className="table-head"><span>Change</span><span>Date Submitted</span><span>Submitted By</span><span>Description</span></div>{rows.map((commit) => <button key={commit.hash} className={`table-row ${selected === commit.hash ? 'selected' : ''}`} onClick={() => onSelect(commit)}><span className="change-cell"><ChevronRight size={13} /><i>▲</i><code>{commit.shortHash}</code></span><span>{formatDate(commit.date)}</span><span>{commit.author}</span><span>{commit.subject}</span></button>)}{rows.length === 0 && <EmptyTable text="No submitted changes match the current filter." />}</div>
}

function StreamTable({ branches, filter, selected, onSelect, onCheckout, newBranch, onNewBranch, onCreate, busy }: { branches: BranchInfo[]; filter: string; selected?: string; onSelect: (branch: BranchInfo) => void; onCheckout: (branch: BranchInfo) => void; newBranch: string; onNewBranch: (value: string) => void; onCreate: () => void; busy: boolean }): React.JSX.Element {
  const rows = branches.filter((branch) => branch.name.toLowerCase().includes(filter.toLowerCase()))
  return <div className="stream-layout"><div className="branch-tools"><label>New branch:</label><input value={newBranch} onChange={(event) => onNewBranch(event.target.value)} placeholder="feature/name" /><button onClick={onCreate} disabled={!newBranch.trim() || busy}><Plus size={14} />Create</button></div><div className="classic-table stream-table"><div className="table-head"><span>Branch / Stream</span><span>Type</span><span>Latest Change</span><span>Description</span><span /></div>{rows.map((branch) => <div role="button" tabIndex={0} key={branch.name} className={`table-row ${selected === branch.name ? 'selected' : ''}`} onClick={() => onSelect(branch)}><span className="file-name"><GitBranch size={15} />{branch.name}</span><span>{branch.remote ? 'Remote' : 'Local'}</span><code>{branch.hash}</code><span>{branch.subject}</span><span>{branch.current ? <em className="current-label"><Check size={12} />Current</em> : !branch.remote ? <button className="inline-button" onClick={(event) => { event.stopPropagation(); onCheckout(branch) }}>Switch</button> : null}</span></div>)}</div></div>
}

function WorkspacesTable({ paths, active, filter, onOpen }: { paths: string[]; active: string; filter: string; onOpen: (path: string) => void }): React.JSX.Element {
  const rows = paths.filter((path) => path.toLowerCase().includes(filter.toLowerCase()))
  return <div className="classic-table workspaces-table"><div className="table-head"><span>Workspace</span><span>Root</span><span>Status</span></div>{rows.map((path) => <button key={path} className={`table-row ${path === active ? 'selected' : ''}`} onDoubleClick={() => onOpen(path)}><span className="file-name"><Monitor size={15} />{parts(path).name}</span><span>{path}</span><span>{path === active ? 'Current' : 'Recent'}</span></button>)}</div>
}

function DetailContent({ tab, pending, commit, branch, entry, diff, diffLoading }: { tab: DetailTab; pending?: PendingSelection; commit?: CommitInfo; branch?: BranchInfo; entry?: WorkspaceEntry; diff: string; diffLoading: boolean }): React.JSX.Element {
  if (tab === 'diff') return <pre className="detail-diff">{diffLoading ? 'Loading diff...' : diff || 'Select a pending file and choose Diff.'}</pre>
  if (tab === 'jobs') return <div className="detail-empty">Git has no Perforce Jobs equivalent. Issue linking is planned.</div>
  if (tab === 'files') {
    if (pending) return <div className="detail-line"><File size={14} /><strong>{pending.change.path}</strong><span>{pending.staged ? 'Ready to submit' : 'Default changelist'}</span></div>
    return <div className="detail-empty">Select a changelist or submitted change to inspect its files.</div>
  }
  if (pending) return <div className="detail-grid"><strong>File</strong><span>{pending.change.path}</span><strong>Action</strong><span>{changeLabel(pending.change)}</span><strong>Changelist</strong><span>{pending.staged ? 'Ready to submit' : 'Default changelist'}</span></div>
  if (commit) return <div className="detail-grid"><strong>Change</strong><span>{commit.hash}</span><strong>Author</strong><span>{commit.author} &lt;{commit.email}&gt;</span><strong>Date</strong><span>{formatDate(commit.date)}</span><strong>Description</strong><span>{commit.subject}</span></div>
  if (branch) return <div className="detail-grid"><strong>Branch</strong><span>{branch.name}</span><strong>Revision</strong><span>{branch.hash}</span><strong>Upstream</strong><span>{branch.upstream || 'None'}</span></div>
  if (entry) return <div className="detail-grid"><strong>Name</strong><span>{entry.name}</span><strong>Path</strong><span>{entry.path}</span><strong>Type</strong><span>{entry.isDirectory ? 'Folder' : 'File'}</span></div>
  return <div className="detail-empty">Select an item to view details.</div>
}

function SubmitDialog({ staged, message, onMessage, onCancel, onSubmit, busy, conflicts }: { staged: FileChange[]; message: string; onMessage: (value: string) => void; onCancel: () => void; onSubmit: () => void; busy: boolean; conflicts: boolean }): React.JSX.Element {
  return <div className="modal-backdrop"><section className="submit-dialog" role="dialog" aria-modal="true" aria-label="Submit Changelist"><div className="modal-title"><BrandIcon /><strong>Submit Changelist</strong><button onClick={onCancel}><X size={16} /></button></div><div className="modal-body"><div className="field-row"><label>Changelist:</label><strong>Ready to submit</strong></div><label htmlFor="submit-description">Description:</label><textarea id="submit-description" autoFocus value={message} onChange={(event) => onMessage(event.target.value)} placeholder="Enter a description for this change..." /><div className="submit-files-title"><strong>Files</strong><span>{staged.length} files</span></div><div className="submit-files">{staged.map((change) => <div key={change.path}><i className={`change-mark ${change.kind}`}>{changeCode(change)}</i><span>{change.path}</span><em>{changeLabel(change)}</em></div>)}{staged.length === 0 && <p>No files are ready to submit. Use Checkout or Add first.</p>}</div>{conflicts && <div className="modal-warning"><AlertTriangle size={15} />Resolve conflicts before submitting.</div>}</div><div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary-classic" onClick={onSubmit} disabled={!message.trim() || staged.length === 0 || conflicts || busy}>{busy && <LoaderCircle className="spin" size={14} />}Submit</button></div></section></div>
}

function EmptyTable({ text }: { text: string }): React.JSX.Element {
  return <div className="empty-table">{text}</div>
}

function ErrorToast({ message, close }: { message: string; close: () => void }): React.JSX.Element {
  return <div className="error-toast"><AlertTriangle size={17} /><span>{message}</span><button onClick={close}><X size={14} /></button></div>
}

function getMatchCount(tab: MainTab, filter: string, entries: WorkspaceEntry[], changes: FileChange[], commits: CommitInfo[], branches: BranchInfo[], settings: AppSettings): number {
  const query = filter.toLowerCase()
  const matches = (value: string): boolean => value.toLowerCase().includes(query)
  if (tab === 'files') return entries.filter((entry) => matches(entry.name)).length
  if (tab === 'pending') return changes.filter((change) => matches(change.path)).length
  if (tab === 'submitted') return commits.filter((commit) => matches(`${commit.shortHash} ${commit.author} ${commit.subject}`)).length
  if (tab === 'stream') return branches.filter((branch) => matches(branch.name)).length
  return settings.recentRepositories.filter(matches).length
}
