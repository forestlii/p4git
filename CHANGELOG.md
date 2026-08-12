# Changelog

All notable changes to P4Git are documented in this file.

## 0.4.1 — 2026-08-12

- Fixed **New Branch from Here** by replacing the unreliable Electron browser prompt with an in-app branch dialog.
- Suggests a local branch name when starting from a remote-tracking branch and validates the name/start point before switching.
- 修复 **New Branch from Here** 无响应：改用应用内窗口，并为远程分支建议本地名称、提前验证名称和起点。

## 0.4.0 — 2026-08-12

### English

- Enhanced Resolve with the live workspace result, per-conflict Ours/Theirs/Both choices, binary-safe whole-file choices, and configurable external 3-way merge.
- Added a Get Revision dialog for branch, tag, hash, and date lookup with commit/file preview and multi-path restore.
- Added a task progress center with command history, state, and process cancellation.
- Extended Ctrl/Shift/Ctrl+A multi-selection across the main tables, with batch operations where applicable.
- Added Git LFS Lock/Unlock context actions and a lock-management window.
- Added draggable Workspace/Details/Log dividers, resizable Files/Pending columns, full-path tooltips, themes, density, text scale, and optional toolbar labels.

### 中文

- 增强 Resolve：显示工作区结果，支持逐冲突块选择 Ours/Theirs/Both、二进制整文件选边和外部三方合并。
- 新增 Get Revision 窗口：按分支、Tag、哈希或日期定位，预览后恢复多个工作区路径。
- 新增带命令记录、状态和取消功能的任务进度中心。
- 主表格统一支持 Ctrl/Shift/Ctrl+A 多选，并在适用位置执行批量操作。
- 新增 Git LFS Lock/Unlock 右键操作与锁管理窗口。
- Workspace、Details、Log 分隔线可拖动；Files/Pending 列宽可调；新增完整路径提示、主题、密度、字号和工具栏文字开关。

## 0.3.0 — 2026-08-12

### English

- Completed the daily Git workflow with automatic conflict detection and Resolve launch after Merge, Rebase, Cherry-pick, Revert, or Get Latest failures.
- Added repository-local Shelve/Unshelve for named changelists, preserving their file assignments when restored.
- Added remote management, a push preview/target dialog, branch rename, and Incoming/Outgoing branch comparison.
- Added Amend Last Commit with an explicit history-rewrite warning and operation-state indicators for conflicts and Continue readiness.
- Expanded real-repository integration coverage to 19 tests.

### 简体中文

- 补齐日常 Git 主流程：Merge、Rebase、Cherry-pick、Revert 或 Get Latest 失败后自动检测冲突并打开 Resolve。
- 新增仓库本地 Changelist Shelve/Unshelve，恢复时保留原文件归组。
- 新增 Remote 管理、Push 目标与提交预览窗口、分支重命名，以及 Incoming/Outgoing 分支比较。
- 新增 Amend Last Commit，并明确提示改写历史；状态栏显示冲突和可 Continue 状态。
- 真实仓库集成测试扩展至 19 项。

## 0.2.0 — 2026-08-12

### English

- Completed P4V-style navigation: editable location bar, history, bookmarks, workspace selector, tree sorting/filtering, advanced filter panel, sortable columns, and expandable Submitted rows.
- Added cancellable Git subprocesses, repository Clone/Init, visual three-way conflict resolution, operation Continue, and safe submitted-commit Revert.
- Replaced the branch-only Stream view with a parent-aware multi-lane Revision/Stream Graph.
- Connected Jobs to GitLab Issues and added an encrypted-token GitLab panel for merge requests, pipelines, issues, external links, and merge-request creation.
- Added integration coverage for Clone/Init, conflicts, merge continuation, commit reverts, revision parents, and self-hosted GitLab remote parsing.

### 简体中文

- 补齐 P4V 风格导航：可编辑位置栏、历史、书签、Workspace 选择、树排序/过滤、高级过滤、可排序表头和 Submitted 行展开。
- 新增可取消 Git 子进程、仓库 Clone/Init、可视化三方冲突解决、继续进行中的操作，以及安全撤销已提交 commit。
- 将仅分支列表的 Stream 视图升级为使用真实 parent 关系的多轨 Revision/Stream Graph。
- 将 Jobs 映射到 GitLab Issues，并新增使用系统加密保存 Token 的 GitLab 面板，可查看 MR、Pipeline、Issue、打开链接和创建 MR。
- 新增 Clone/Init、冲突、合并继续、提交撤销、版本父节点及自建 GitLab 远端解析的集成测试。

## 0.1.4 — 2026-08-12

### English

- Fixed Get Latest on diverged branches: it now fetches first, fast-forwards when safe, and presents an explicit Merge/Rebase/Cancel decision with ahead/behind counts instead of failing with `Not possible to fast-forward`.

### 简体中文

- 修复分支分叉时 Get Latest 直接报 `Not possible to fast-forward`：现在会先 Fetch，可安全快进时自动更新；发生分叉时显示 ahead/behind 数量，并明确提供 Merge、Rebase、Cancel 选择。

## 0.1.3 — 2026-08-11

### English

- Added configurable external file comparison with Beyond Compare defaults, custom argument templates, binary-safe revision materialization, and automatic built-in fallback.

### 简体中文

- 新增可配置的外部文件比较：提供 Beyond Compare 默认参数、自定义模板、保留二进制内容的版本物化，以及失败时自动回退内置 Diff。

## 0.1.2 — 2026-08-11

### English

- Replaced the temporary file-history dialog with a persistent P4V-style History tab for files and folders, including revision restore and Previous/HEAD diffs.

### 简体中文

- 将临时文件历史弹窗替换为文件/目录联动的 P4V 风格常驻 History 页签，支持恢复指定版本以及与 Previous/HEAD 比较。

## 0.1.1 — 2026-08-11

### English

- Added persistent repository-local named changelists with descriptions, drag-and-drop and context-menu assignment, editing, deletion, and per-changelist submission.
- Added Ctrl/Shift/Ctrl+A multi-selection for Pending files, batch moves, and **Move to Changelist > New Changelist...** to create and populate a list in one operation.
- Added isolated submit preparation so submitting one local changelist stages only its files while preserving all other working-tree changes.
- Added a functional Depot tree backed by selectable Git refs and branches.
- Added native object-specific context menus across Depot, Workspace, Pending, Submitted, branches, recent workspaces, and Log.
- Completed Checkout, Add, Delete, Revert, Diff, File History, Time-lapse (Git blame), submitted-file, and submitted-diff interactions.
- Added **Tools > Git** plus contextual **Git** submenus for Stash, Reflog, Merge, Rebase, Cherry-pick, Reset, Tags, branch creation/deletion, Stage/Unstage, and operation aborts.
- Added typed confirmation for Hard Reset and Stash Drop, plus explicit abort commands for conflicted Merge, Rebase, and Cherry-pick operations.
- Optimized tracked-file detection so very large Unity repositories no longer overflow the Git process output buffer.
- Added integration coverage using a real temporary Git repository.

### 简体中文

- 新增仓库本地持久化的命名 Changelist，支持说明、拖拽与右键归组、编辑、删除和按列表提交。
- Pending 文件支持 Ctrl、Shift、Ctrl+A 多选和批量移动；新增 **Move to Changelist > New Changelist...**，可一次创建列表并移入全部选中文件。
- 新增隔离提交准备：提交某个本地 Changelist 时只暂存该列表文件，其他工作区改动保持不变。
- 新增可选择 Git ref 或分支的功能性 Depot 文件树。
- 为 Depot、Workspace、Pending、Submitted、分支、最近工作区和 Log 新增对象相关的原生右键菜单。
- 接通 Checkout、Add、Delete、Revert、Diff、文件历史、Time-lapse（Git blame）、提交文件与提交 Diff 交互。
- 新增 **Tools > Git** 和对象右键 **Git** 子菜单，提供 Stash、Reflog、Merge、Rebase、Cherry-pick、Reset、Tag、分支创建/删除、Stage/Unstage 与中止操作。
- Hard Reset 与 Drop Stash 需要输入确认词；冲突中的 Merge、Rebase、Cherry-pick 可明确中止。
- 优化 tracked 文件检测，避免大型 Unity 仓库超过 Git 进程输出缓冲区。
- 新增基于真实临时 Git 仓库的集成测试。

## 0.1.0 — 2026-08-11

### English

- Added a P4V-style native menu, large action toolbar, location bar, Workspace tree, tabbed tables, details pane, Log, and status bar.
- Added Files, Pending, Submitted, Stream Graph, and Workspaces tabs following the P4V desktop layout.
- Added Ready to submit and Default changelists with drag-and-drop between Git staged and unstaged states.
- Added staged, unstaged, and untracked text diff review.
- Added P4V-named Checkout, Add, Delete, Revert, Diff, Get Latest, and Submit workflows mapped safely to Git.
- Added a Submit Changelist window with file review, conflict blocking, and local commit creation.
- Added recent commit history in the Submitted table and local/remote branches in Stream Graph.
- Added local branch creation and switching.
- Added Fetch, fast-forward-only Pull, and Push with upstream setup.
- Added Git discovery and manual `git.exe` selection for Git for Windows or clients such as UGit.
- Added secure Electron context isolation, typed IPC, repository path validation, and shell-free Git execution.
- Added Windows x64 installer and portable packages.
- Added English and Simplified Chinese README, user documentation, and troubleshooting guides.

### 简体中文

- 新增 P4V 风格原生菜单、大图标操作栏、位置栏、Workspace 树、页签表格、详情面板、Log 和状态栏。
- 新增按照 P4V 桌面布局组织的 Files、Pending、Submitted、Stream Graph、Workspaces 页签。
- 新增 Ready to submit 与 Default changelist，并支持在 Git 已暂存/未暂存状态之间拖拽。
- 新增已暂存、未暂存和未跟踪文本差异审阅。
- 新增映射到 Git 的 Checkout、Add、Delete、Revert、Diff、Get Latest、Submit 操作。
- 新增 Submit Changelist 窗口，支持文件检查、冲突阻止和本地 commit。
- 新增 Submitted 提交历史表格和 Stream Graph 本地/远程分支视图。
- 新增本地分支创建与切换。
- 新增 Fetch、仅快进 Pull，以及自动设置 upstream 的 Push。
- 新增 Git 自动发现和手动选择 `git.exe`，支持 Git for Windows 或 UGit 等客户端。
- 新增 Electron 上下文隔离、类型化 IPC、仓库路径校验和无 shell 的 Git 调用。
- 新增 Windows x64 安装版和便携版。
- 新增英文、简体中文 README、使用文档和故障排查指南。
