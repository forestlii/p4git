import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  History,
  LoaderCircle,
  Minus,
  PanelLeft,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AppSettings,
  BranchInfo,
  CommitInfo,
  FileChange,
  GitHealth,
  RepositorySummary
} from '../../shared/types'

type ViewName = 'changes' | 'history' | 'branches'

interface Selection {
  path: string
  staged: boolean
  untracked: boolean
}

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '')
    .trim()
}

function fileBadge(change: FileChange): string {
  switch (change.kind) {
    case 'added':
      return 'A'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'copied':
      return 'C'
    case 'untracked':
      return '?'
    case 'conflicted':
      return '!'
    default:
      return 'M'
  }
}

function compactPath(filePath: string): { name: string; directory: string } {
  const normalized = filePath.replaceAll('\\', '/')
  const index = normalized.lastIndexOf('/')
  return index < 0
    ? { name: normalized, directory: '' }
    : { name: normalized.slice(index + 1), directory: normalized.slice(0, index) }
}

function timeAgo(value: string): string {
  const timestamp = new Date(value).getTime()
  const delta = Date.now() - timestamp
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(
    new Date(value)
  )
}

function BrandMark(): React.JSX.Element {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span>P4</span>
      <GitBranch size={13} strokeWidth={3} />
    </div>
  )
}

function FileRow({
  change,
  staged,
  selected,
  onSelect
}: {
  change: FileChange
  staged: boolean
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const path = compactPath(change.path)
  return (
    <button className={`file-row ${selected ? 'selected' : ''}`} onClick={onSelect} title={change.path}>
      <span className={`file-status status-${change.kind}`}>{fileBadge(change)}</span>
      <span className="file-copy">
        <span className="file-name">{path.name}</span>
        {path.directory && <span className="file-directory">{path.directory}</span>}
      </span>
      <ChevronRight size={14} className="row-chevron" />
      <span className="sr-only">{staged ? '已暂存' : '未暂存'}</span>
    </button>
  )
}

function EmptyDiff(): React.JSX.Element {
  return (
    <div className="empty-panel">
      <div className="empty-icon">
        <Code2 size={28} />
      </div>
      <h3>选择一个文件查看差异</h3>
      <p>已暂存和工作区中的改动会分别显示，操作方式接近 P4V 的 changelist。</p>
    </div>
  )
}

function DiffViewer({ selection, content, loading }: { selection?: Selection; content: string; loading: boolean }): React.JSX.Element {
  if (!selection) return <EmptyDiff />
  if (loading) {
    return (
      <div className="empty-panel">
        <LoaderCircle className="spin" size={28} />
        <p>正在读取差异…</p>
      </div>
    )
  }
  const lines = content.split('\n').slice(0, 6000)
  return (
    <section className="diff-panel">
      <div className="panel-title diff-title">
        <div>
          <strong>{compactPath(selection.path).name}</strong>
          <span>{selection.path}</span>
        </div>
        <span className="mode-pill">{selection.staged ? 'STAGED' : 'WORKSPACE'}</span>
      </div>
      <div className="diff-code" role="region" aria-label={`${selection.path} 的差异`}>
        {lines.map((line, index) => {
          const kind = line.startsWith('+') && !line.startsWith('+++')
            ? 'addition'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'deletion'
              : line.startsWith('@@')
                ? 'hunk'
                : line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')
                  ? 'meta'
                  : ''
          return (
            <div className={`diff-line ${kind}`} key={`${index}-${line.slice(0, 20)}`}>
              <span className="line-number">{index + 1}</span>
              <code>{line || ' '}</code>
            </div>
          )
        })}
        {!content && <div className="diff-empty">没有可显示的文本差异。</div>}
        {content.split('\n').length > 6000 && <div className="diff-truncated">差异过大，仅显示前 6000 行。</div>}
      </div>
    </section>
  )
}

function App(): React.JSX.Element {
  const [health, setHealth] = useState<GitHealth>({ available: false })
  const [settings, setSettings] = useState<AppSettings>({ recentRepositories: [] })
  const [repository, setRepository] = useState<RepositorySummary>()
  const [view, setView] = useState<ViewName>('changes')
  const [selection, setSelection] = useState<Selection>()
  const [diff, setDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [history, setHistory] = useState<CommitInfo[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [message, setMessage] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [busy, setBusy] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async (repoPath?: string) => {
    const target = repoPath ?? repository?.root
    if (!target) return
    const summary = await window.p4git.getStatus(target)
    setRepository(summary)
    if (view === 'history') setHistory(await window.p4git.getHistory(summary.root))
    if (view === 'branches') setBranches(await window.p4git.getBranches(summary.root))
  }, [repository?.root, view])

  const openRepository = useCallback(async (repoPath: string) => {
    setBusy('open')
    setError(undefined)
    try {
      const summary = await window.p4git.openRepository(repoPath)
      setRepository(summary)
      setSelection(undefined)
      setDiff('')
      setView('changes')
      setSettings(await window.p4git.getSettings())
    } catch (reason) {
      setError(friendlyError(reason))
    } finally {
      setBusy(undefined)
    }
  }, [])

  useEffect(() => {
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
    if (!repository || !selection) return
    const current = selection
    setDiffLoading(true)
    window.p4git
      .getDiff({
        repoPath: repository.root,
        filePath: current.path,
        staged: current.staged,
        untracked: current.untracked
      })
      .then(setDiff)
      .catch((reason) => setError(friendlyError(reason)))
      .finally(() => setDiffLoading(false))
  }, [repository?.root, selection])

  useEffect(() => {
    if (!repository) return
    if (view === 'history' && history.length === 0) {
      window.p4git.getHistory(repository.root).then(setHistory).catch((reason) => setError(friendlyError(reason)))
    }
    if (view === 'branches' && branches.length === 0) {
      window.p4git.getBranches(repository.root).then(setBranches).catch((reason) => setError(friendlyError(reason)))
    }
  }, [branches.length, history.length, repository, view])

  const staged = useMemo(() => repository?.changes.filter((change) => change.staged) ?? [], [repository])
  const workspace = useMemo(() => repository?.changes.filter((change) => change.unstaged) ?? [], [repository])
  const conflicts = repository?.changes.some((change) => change.conflicted) ?? false
  const selectedChange = selection
    ? repository?.changes.find((change) => change.path === selection.path)
    : undefined

  function changePaths(change: FileChange): string[] {
    return change.oldPath ? [change.path, change.oldPath] : [change.path]
  }

  async function chooseRepository(): Promise<void> {
    const repoPath = await window.p4git.chooseRepository()
    if (repoPath) await openRepository(repoPath)
  }

  async function chooseGit(): Promise<void> {
    const next = await window.p4git.chooseGitExecutable()
    if (!next) return
    setHealth(next)
    if (next.available) setNotice('Git 可执行程序已配置。')
    else setError(next.error)
  }

  async function perform(label: string, action: () => Promise<unknown>, success?: string): Promise<void> {
    setBusy(label)
    setError(undefined)
    try {
      await action()
      await refresh()
      if (success) setNotice(success)
    } catch (reason) {
      setError(friendlyError(reason))
    } finally {
      setBusy(undefined)
    }
  }

  async function changeView(next: ViewName): Promise<void> {
    setView(next)
    if (!repository) return
    try {
      if (next === 'history') setHistory(await window.p4git.getHistory(repository.root))
      if (next === 'branches') setBranches(await window.p4git.getBranches(repository.root))
    } catch (reason) {
      setError(friendlyError(reason))
    }
  }

  async function commit(): Promise<void> {
    if (!repository || !message.trim()) return
    await perform('commit', () => window.p4git.commit(repository.root, message), '变更已提交到本地仓库。')
    setMessage('')
    setSelection(undefined)
  }

  async function discardSelected(): Promise<void> {
    if (!repository || !selection || selection.untracked) return
    const confirmed = window.confirm(`确定丢弃 ${selection.path} 的未暂存改动吗？此操作无法由 P4Git 撤销。`)
    if (!confirmed) return
    await perform(
      'discard',
      () => window.p4git.discard(repository.root, [selection.path]),
      '工作区改动已丢弃。'
    )
    setSelection(undefined)
  }

  async function createBranch(): Promise<void> {
    if (!repository || !newBranch.trim()) return
    await perform(
      'branch',
      () => window.p4git.checkout({ repoPath: repository.root, branch: newBranch, create: true }),
      `已创建并切换到 ${newBranch.trim()}。`
    )
    setNewBranch('')
    setBranches(await window.p4git.getBranches(repository.root))
  }

  if (!repository) {
    return (
      <main className="welcome-shell">
        <div className="welcome-topbar">
          <div className="brand-lockup"><BrandMark /><strong>P4Git</strong><span>Desktop</span></div>
          <button className="icon-button" onClick={() => void chooseGit()} title="配置 Git"><Settings size={18} /></button>
        </div>
        <section className="welcome-content">
          <div className="welcome-copy">
            <span className="eyebrow">P4V workflow. Git underneath.</span>
            <h1>把 Git 工作区，<br />变得一目了然。</h1>
            <p>用熟悉的 changelist、差异审阅和提交工作流操作现有 Git 仓库。无需迁移服务端，GitLab、GitHub 与自建 Git 都可以继续使用。</p>
            <div className="welcome-actions">
              <button className="primary large" onClick={() => void chooseRepository()} disabled={!health.available || Boolean(busy)}>
                {busy === 'open' ? <LoaderCircle className="spin" size={18} /> : <FolderGit2 size={18} />}
                打开 Git 工作区
              </button>
              {!health.available && <button className="secondary large" onClick={() => void chooseGit()}><Settings size={18} />选择 git.exe</button>}
            </div>
          </div>
          <div className="workspace-preview" aria-hidden="true">
            <div className="preview-header"><BrandMark /><span>depot / gameplay</span><span className="preview-dot" /></div>
            <div className="preview-body">
              <div className="preview-sidebar"><span /><span /><span /><span /></div>
              <div className="preview-list">
                <small>DEFAULT CHANGELIST</small>
                <div><i className="green">A</i><b>player_controller.cpp</b></div>
                <div><i className="amber">M</i><b>input_config.json</b></div>
                <div><i className="red">D</i><b>legacy_camera.cpp</b></div>
              </div>
              <div className="preview-diff"><em>+ void Jump()</em><span>  if (grounded)</span><em>+   velocity.y = force;</em><del>- oldJump();</del></div>
            </div>
          </div>
          <div className={`git-health ${health.available ? 'healthy' : 'unhealthy'}`}>
            {health.available ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{health.available ? `${health.version} · ${health.path}` : health.error || '正在检查 Git…'}</span>
          </div>
          {settings.recentRepositories.length > 0 && (
            <div className="recent-list">
              <span>最近工作区</span>
              {settings.recentRepositories.map((repoPath) => (
                <button key={repoPath} onClick={() => void openRepository(repoPath)}><Clock3 size={14} />{repoPath}</button>
              ))}
            </div>
          )}
        </section>
        {error && <Toast kind="error" text={error} onClose={() => setError(undefined)} />}
        {notice && <Toast kind="notice" text={notice} onClose={() => setNotice(undefined)} />}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup compact"><BrandMark /><strong>P4Git</strong></div>
        <div className="repo-identity">
          <button className="repo-name" onClick={() => void chooseRepository()} title="切换工作区">
            <FolderGit2 size={16} /><strong>{repository.name}</strong><span>{repository.root}</span>
          </button>
          <div className="branch-chip"><GitBranch size={14} />{repository.branch}</div>
          {repository.ahead > 0 && <span className="sync-count"><ArrowUp size={12} />{repository.ahead}</span>}
          {repository.behind > 0 && <span className="sync-count"><ArrowDown size={12} />{repository.behind}</span>}
        </div>
        <div className="header-actions">
          <ToolbarButton icon={<Download size={16} />} label="Fetch" busy={busy === 'fetch'} onClick={() => void perform('fetch', () => window.p4git.fetch(repository.root), '已获取远程更新。')} />
          <ToolbarButton icon={<ArrowDown size={16} />} label="Pull" busy={busy === 'pull'} onClick={() => void perform('pull', () => window.p4git.pull(repository.root), '已快进到远程版本。')} />
          <ToolbarButton icon={<Upload size={16} />} label="Push" busy={busy === 'push'} onClick={() => void perform('push', () => window.p4git.push(repository.root), '本地提交已推送。')} />
          <button className="icon-button" onClick={() => void perform('refresh', () => refresh())} title="刷新"><RefreshCw size={17} className={busy === 'refresh' ? 'spin' : ''} /></button>
          <button className="icon-button" onClick={() => void window.p4git.revealRepository(repository.root)} title="在资源管理器中打开"><ExternalLink size={17} /></button>
          <button className="icon-button" onClick={() => void chooseGit()} title="设置 Git"><Settings size={17} /></button>
        </div>
      </header>

      <aside className="nav-sidebar">
        <div className="nav-label">WORKSPACE</div>
        <NavButton icon={<PanelLeft size={17} />} label="变更列表" active={view === 'changes'} count={repository.changes.length} onClick={() => void changeView('changes')} />
        <NavButton icon={<History size={17} />} label="提交历史" active={view === 'history'} onClick={() => void changeView('history')} />
        <NavButton icon={<GitBranch size={17} />} label="分支" active={view === 'branches'} onClick={() => void changeView('branches')} />
        <div className="nav-spacer" />
        <div className="connection-card">
          <span className="connection-dot" />
          <div><strong>{repository.remoteUrl ? 'Origin connected' : 'Local repository'}</strong><span>{repository.remoteUrl ?? '尚未配置远程仓库'}</span></div>
        </div>
      </aside>

      <section className="workspace-area">
        {view === 'changes' && (
          <div className="changes-layout">
            <section className="changes-list panel">
              <div className="panel-title"><div><strong>变更列表</strong><span>{repository.changes.length} 个文件有改动</span></div></div>
              <ChangeGroup title="READY TO SUBMIT" count={staged.length} accent="teal" empty="暂存文件后会出现在这里">
                {staged.map((change) => <FileRow key={`s-${change.path}`} change={change} staged selected={selection?.path === change.path && selection.staged} onSelect={() => setSelection({ path: change.path, staged: true, untracked: false })} />)}
              </ChangeGroup>
              <ChangeGroup title="DEFAULT CHANGELIST" count={workspace.length} accent="blue" empty="工作区是干净的">
                {workspace.map((change) => <FileRow key={`w-${change.path}`} change={change} staged={false} selected={selection?.path === change.path && !selection.staged} onSelect={() => setSelection({ path: change.path, staged: false, untracked: change.kind === 'untracked' })} />)}
              </ChangeGroup>
            </section>
            <DiffViewer selection={selection} content={diff} loading={diffLoading} />
            <aside className="submit-panel panel">
              <div className="panel-title"><div><strong>提交变更</strong><span>创建本地 Git commit</span></div></div>
              <div className="submit-body">
                <label htmlFor="commit-message">提交说明</label>
                <textarea id="commit-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="说明这次变更解决了什么…" />
                <div className="submit-summary"><span><Boxes size={15} />已暂存文件</span><strong>{staged.length}</strong></div>
                {conflicts && <div className="inline-warning"><AlertTriangle size={15} />请先解决冲突再提交</div>}
                <button className="primary commit-button" disabled={!message.trim() || staged.length === 0 || conflicts || Boolean(busy)} onClick={() => void commit()}>
                  {busy === 'commit' ? <LoaderCircle className="spin" size={17} /> : <GitCommitHorizontal size={17} />}提交 {staged.length || ''} 个文件
                </button>
                <div className="file-actions">
                  {selection && !selection.staged && selectedChange && <button onClick={() => void perform('stage', () => window.p4git.stage(repository.root, changePaths(selectedChange)))}><Plus size={15} />暂存所选</button>}
                  {selection?.staged && selectedChange && <button onClick={() => void perform('unstage', () => window.p4git.unstage(repository.root, changePaths(selectedChange)))}><Minus size={15} />取消暂存</button>}
                  {selection && !selection.staged && !selection.untracked && <button className="danger-text" onClick={() => void discardSelected()}><RotateCcw size={15} />丢弃改动</button>}
                </div>
                {workspace.length > 0 && <button className="secondary full" onClick={() => void perform('stage-all', () => window.p4git.stage(repository.root, [...new Set(workspace.flatMap(changePaths))]))}><FilePlus2 size={16} />暂存全部</button>}
              </div>
            </aside>
          </div>
        )}

        {view === 'history' && <HistoryView commits={history} loading={busy === 'refresh'} />}
        {view === 'branches' && (
          <BranchesView
            branches={branches}
            newBranch={newBranch}
            onNewBranch={setNewBranch}
            onCreate={() => void createBranch()}
            onCheckout={(branch) => void perform('checkout', () => window.p4git.checkout({ repoPath: repository.root, branch }), `已切换到 ${branch}。`).then(() => window.p4git.getBranches(repository.root).then(setBranches))}
            busy={Boolean(busy)}
          />
        )}
      </section>

      <footer className="status-bar">
        <span><span className="connection-dot" />Git ready</span>
        <span>{repository.upstream ? `Tracking ${repository.upstream}` : 'No upstream'}</span>
        <span className="status-spacer" />
        <span>{repository.changes.length === 0 ? 'Workspace clean' : `${repository.changes.length} changed`}</span>
      </footer>
      {error && <Toast kind="error" text={error} onClose={() => setError(undefined)} />}
      {notice && <Toast kind="notice" text={notice} onClose={() => setNotice(undefined)} />}
    </main>
  )
}

function ToolbarButton({ icon, label, busy, onClick }: { icon: React.ReactNode; label: string; busy: boolean; onClick: () => void }): React.JSX.Element {
  return <button className="toolbar-button" disabled={busy} onClick={onClick}>{busy ? <LoaderCircle className="spin" size={16} /> : icon}<span>{label}</span></button>
}

function NavButton({ icon, label, active, count, onClick }: { icon: React.ReactNode; label: string; active: boolean; count?: number; onClick: () => void }): React.JSX.Element {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <em>{count}</em>}</button>
}

function ChangeGroup({ title, count, accent, empty, children }: { title: string; count: number; accent: string; empty: string; children: React.ReactNode }): React.JSX.Element {
  return <div className="change-group"><div className="change-group-title"><span className={`group-accent ${accent}`} /><strong>{title}</strong><em>{count}</em></div>{count ? children : <div className="group-empty">{empty}</div>}</div>
}

function HistoryView({ commits }: { commits: CommitInfo[]; loading: boolean }): React.JSX.Element {
  return (
    <section className="full-panel panel history-view">
      <div className="panel-title"><div><strong>提交历史</strong><span>最近 {commits.length} 个提交</span></div></div>
      <div className="history-head"><span>提交</span><span>作者</span><span>时间</span><span>Hash</span></div>
      <div className="history-list">
        {commits.map((commit, index) => (
          <div className="commit-row" key={commit.hash}>
            <div className="commit-graph"><span className={index === 0 ? 'head' : ''} />{index < commits.length - 1 && <i />}</div>
            <div className="commit-subject"><strong>{commit.subject}</strong><div>{commit.refs.map((ref) => <em key={ref}>{ref.replace('HEAD -> ', '')}</em>)}</div></div>
            <span>{commit.author}</span><span>{timeAgo(commit.date)}</span><code>{commit.shortHash}</code>
          </div>
        ))}
        {!commits.length && <div className="empty-panel compact"><History size={28} /><h3>还没有提交</h3></div>}
      </div>
    </section>
  )
}

function BranchesView({ branches, newBranch, onNewBranch, onCreate, onCheckout, busy }: { branches: BranchInfo[]; newBranch: string; onNewBranch: (value: string) => void; onCreate: () => void; onCheckout: (branch: string) => void; busy: boolean }): React.JSX.Element {
  const local = branches.filter((branch) => !branch.remote)
  const remote = branches.filter((branch) => branch.remote)
  return (
    <section className="branches-layout">
      <div className="panel branch-create"><div className="panel-title"><div><strong>新建分支</strong><span>从当前 HEAD 创建</span></div></div><div className="branch-create-body"><label htmlFor="branch-name">分支名称</label><input id="branch-name" value={newBranch} onChange={(event) => onNewBranch(event.target.value)} placeholder="feature/my-change" /><button className="primary" disabled={!newBranch.trim() || busy} onClick={onCreate}><GitBranch size={16} />创建并切换</button></div></div>
      <div className="panel branch-list"><div className="panel-title"><div><strong>本地分支</strong><span>{local.length} branches</span></div></div>{local.map((branch) => <BranchRow key={branch.name} branch={branch} onCheckout={onCheckout} busy={busy} />)}</div>
      <div className="panel branch-list remote-list"><div className="panel-title"><div><strong>远程分支</strong><span>{remote.length} branches</span></div></div>{remote.map((branch) => <BranchRow key={branch.name} branch={branch} onCheckout={onCheckout} busy />)}</div>
    </section>
  )
}

function BranchRow({ branch, onCheckout, busy }: { branch: BranchInfo; onCheckout: (branch: string) => void; busy: boolean }): React.JSX.Element {
  return <div className={`branch-row ${branch.current ? 'current' : ''}`}><span className="branch-icon"><GitBranch size={16} /></span><div><strong>{branch.name.replace(/^remotes\//, '')}</strong><span>{branch.subject}</span></div><code>{branch.hash}</code>{branch.current ? <em><Check size={13} />当前</em> : <button disabled={busy || branch.remote} onClick={() => onCheckout(branch.name)}>切换</button>}</div>
}

function Toast({ kind, text, onClose }: { kind: 'error' | 'notice'; text: string; onClose: () => void }): React.JSX.Element {
  return <div className={`toast ${kind}`}>{kind === 'error' ? <AlertTriangle size={17} /> : <Check size={17} />}<span>{text}</span><button onClick={onClose}><X size={15} /></button></div>
}

export default App
