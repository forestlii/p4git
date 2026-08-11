# Changelog

All notable changes to P4Git are documented in this file.

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
