# Changelog

All notable changes to P4Git are documented in this file.

## 0.18.0 — 2026-08-14

### English

- Added **New Workspace...** to the startup connection dialog and File menu. It accepts a Git server URL and empty local directory, initializes Git with `origin`, and opens without contacting the server, Fetching refs, Cloning, or checking out files.
- New remote-backed Workspaces distinguish the deferred operations clearly: Fetch downloads refs without touching files, while the first Get Latest discovers the server's advertised default branch, creates the local tracking branch, and populates the Workspace.
- New Workspace rejects non-empty local directories, and the first Get Latest refuses to overwrite files added before synchronization.
- Added an integration test with a two-commit bare server repository proving that creation remains empty and the first Get Latest establishes `origin/main` correctly.

### 中文

- 启动连接界面和 File 菜单新增 **New Workspace...**：填写 Git 服务器 URL 与空本地目录后，只初始化 Git 并登记 `origin`，不连接服务器、不 Fetch、不 Clone、也不 Checkout 文件。
- 空的远端 Workspace 明确区分延迟操作：Fetch 只下载引用、不改变文件；第一次 Get Latest 会识别服务器公布的默认分支、创建本地跟踪分支并填充 Workspace。
- New Workspace 会拒绝非空本地目录；首次同步前如果加入了本地文件，Get Latest 也会拒绝覆盖。
- 新增两提交裸服务器集成测试，验证创建后目录保持为空，并在首次 Get Latest 后正确建立 `origin/main`。

## 0.17.0 — 2026-08-14

### English

- Submitted Change Details now reports the branch used to open the change and every local/remote branch whose tip contains the commit. The viewing branch is ordered first, matching Git's many-branches-per-commit model without pretending a commit has one owner.
- Commit title and full description now have explicit Copy actions alongside the existing copyable hashes, author, date, parents, branch information, and full changed-file paths.
- Merge, Rebase, Cherry-pick, Revert, selective Changelist merge, Submit/Rebase, and Get Latest conflicts now automatically invoke the configured three-way Merge tool for every conflict and wait for each result.
- An auto-detected or configured Beyond Compare Diff executable is reused as the three-way Merge tool when no separate Merge executable is configured. Each returned result is rechecked; unresolved markers, cancellation, missing executables, and launch failures fall back safely to built-in Resolve.

### 中文

- Submitted Change Details 现在显示打开该提交时所处的来源分支，以及能够到达该 Commit 的全部本地/远程分支；查看来源排在首位，遵循“一个 Git Commit 可同时存在于多个分支”的真实语义。
- Commit 标题和完整说明增加明确的复制按钮；原有 Hash、作者、日期、Parents、分支信息以及完整变更路径也继续支持复制。
- Merge、Rebase、Cherry-pick、Revert、选择性 Changelist 合并、Submit/Rebase 和 Get Latest 产生冲突后，会自动逐文件调用已配置的三方 Merge 工具并等待结果。
- 未单独配置 Merge 程序时，自动发现或配置的 Beyond Compare Diff 程序会复用于三方合并；每个返回结果都会复检，仍含冲突标记、取消、程序缺失或启动失败时安全回退内置 Resolve。

## 0.16.0 — 2026-08-13

### English

- Fixed Depot/Workspace selection painting outside the left pane while Pending is active. The tree now has an isolated paint boundary while preserving horizontal scrolling for long names.
- Submitted Change Details shows complete current and previous file paths with wrapping instead of ellipses.
- Submitted Change Details metadata is selectable and every top field has an explicit Copy action, including full commit and parent hashes.
- Stream Graph right-click selection now uses a synchronous snapshot so all Ctrl/Shift-selected rows reach the operation, rather than occasionally falling back to the focused commit.
- Multi-commit Changelist merges order every selected commit by ancestry even when unselected commits occur between them; all selected patches are applied and conflicts continue through the existing Resolve workflow.
- The Submitted/Stream Graph Git submenu now separates **Merge Selected Commits into New Changelist** from a real single/multi-commit **Cherry-pick** command. Cherry-pick creates Git commits and continues remaining selections after Resolve.

### 中文

- 修复 Pending 激活时 Depot/Workspace 选中背景越出左侧面板的问题；树增加独立绘制边界，同时保留长文件名的横向滚动。
- Submitted Change Details 中当前路径和旧路径改为完整换行显示，不再使用省略号。
- Submitted Change Details 顶部信息可选中，并为每个字段提供明确的 Copy 操作，包括完整 Commit 与 Parent Hash。
- Stream Graph 右键操作改用同步的多选快照，确保 Ctrl/Shift 选中的所有行都会传入操作，不再偶发退化为焦点提交。
- 多提交 Changelist 合并按祖先关系排列全部选中提交，即使中间夹有未选提交也能保持正确顺序；冲突继续使用现有 Resolve 流程处理剩余提交。
- Submitted/Stream Graph 的 Git 子菜单将 **合并选中提交到新 Changelist** 与真正的单条/多条 **Cherry-pick** 分离；Cherry-pick 会创建 Git Commit，并在 Resolve 后继续剩余选择。

## 0.15.0 — 2026-08-13

### English

- Workspace expansion builds tracked and upstream-difference metadata once per repository instead of starting three Git processes for every folder. Duplicate loads are coalesced and the former 24/48-folder automatic prefetch fan-out is removed.
- Ignored state is checked only for immediate untracked entries of the opened directory and cached, avoiding a repository-wide ignored-file scan in large Unity workspaces.
- Tree filtering, status sorting, and file/lock lookup use memoized indexes; off-screen rows use layout containment hints, making expansion and collapse responsive with large cached trees.
- Submitted history appears before the heavier revision graph finishes in the background. A persistent filter no longer forces every remaining page to load, repeated upstream/local-only checks are shared, and Git log no longer runs a separate HEAD probe.
- Selecting a Branch/Stream shows that ref's paged **first-parent** Submitted history, keeping merge submissions while excluding commits that only entered through a merged side branch.

### 中文

- Workspace 展开目录时，tracked 与远端差异元数据改为每个仓库只构建一次，不再为每个目录启动 3 个 Git 进程；重复加载会合并，原先自动预取 24/48 个目录的进程风暴已移除。
- ignored 状态只检查当前打开目录直属的未跟踪条目并缓存，避免在大型 Unity Workspace 中全仓扫描 ignored 文件。
- 树筛选、状态排序、文件状态和 Lock 查找改用记忆化索引，屏幕外行启用布局隔离，大型树的展开与收起都更顺畅。
- Submitted 会先于较重的 Revision Graph 显示；持久 Filter 不再强制一次加载全部剩余历史页，upstream/local-only 检查会共享，Git log 也不再额外探测一次 HEAD。
- 选中 Branch/Stream 后显示该引用可分页的 **first-parent** Submitted 历史：保留 Merge 提交本身，同时排除仅通过旁支 Merge 进入的内部提交。

## 0.14.0 — 2026-08-13

### English

- Repository, file, and folder History/Submitted views now page through the complete Git history in stable 100-row batches, load near the scroll boundary, deduplicate by commit hash, and ignore stale responses after navigation or branch changes.
- Long commit lists use browser content virtualization hints so off-screen cells do not pay full rendering cost; loading and end-of-history states are visible.
- The Workspace selector shows every recent repository's current branch, including disabled status for missing repositories, and refreshes after opening or switching branches.
- **Get Latest** now respects the selected Workspace/Depot file or folder. It fetches first, updates only that path from the appropriate upstream/ref, and refuses to overwrite overlapping local changes.
- Branches/Streams rows are left-click selectable. The right side shows that branch's Submitted records with paging, expansion and multi-selection; the existing context command applies selected commits into a new local Changelist and enters Resolve on conflicts.

### 中文

- 仓库、文件和文件夹的 History/Submitted 现在以稳定的每页 100 条加载完整 Git 历史；接近滚动底部时续载，以提交 Hash 去重，并在切换路径或分支后丢弃过期响应。
- 长提交列表使用浏览器内容虚拟化提示，屏幕外 Cell 不再承担完整渲染成本，同时明确显示加载中和已到历史末尾状态。
- 左侧 Workspace 切换器显示所有最近仓库的当前分支，路径失效时禁用，并在打开仓库或切换分支后刷新。
- **Get Latest** 支持当前选中的 Workspace/Depot 文件或文件夹：先 Fetch，再从对应 upstream/ref 仅更新所选范围；范围内存在本地变更时拒绝覆盖。
- Branches/Streams 支持左键选中，右侧显示该分支可分页、展开和多选的 Submitted；右键沿用现有命令，把选中提交应用到新的本地 Changelist，冲突时进入 Resolve。

## 0.13.0 — 2026-08-13

### English

- Built-in comparisons now open in one reusable standalone Diff window. Each comparison gets a Chrome-style tab that can be selected or closed independently, including Pending multi-selection batches.
- Horizontal scrollbars remain available at the bottom of both CodeMirror and unified side-by-side comparisons instead of appearing only after scrolling to the end of the document.
- Depot and Workspace folders expand immediately, load missing children asynchronously, prefetch the next directory level, cache repository roots, and reduce repeated Git metadata processes.
- The connection screen refreshes recent Workspaces and shows the current Git branch beside every valid entry; missing repositories are identified and disabled.
- Non-ignored files that exist only in the Workspace use a green `+` and the `add` action. The redundant top-toolbar Add button was removed; its Git staging command remains available from menus and Pending workflows.

### 中文

- 内置比较统一在可复用的独立 Diff 窗口中打开；每次比较使用一个类似 Chrome 的页签，可独立切换和关闭，Pending 多选也会一次生成多个页签。
- CodeMirror 和统一补丁双栏比较的底部横向滚动条保持可见，不再需要先滚动到文档末尾。
- Depot/Workspace 文件夹点击后立即展开，缺失内容在后台加载，同时预取下一层目录、缓存仓库根路径并减少重复 Git 元数据进程。
- 登录界面会刷新 Recent Workspace，并在每个有效工作区旁显示当前 Git 分支；路径失效的工作区会明确标记并禁用。
- 仓库中不存在、本地存在且未被忽略的文件统一显示绿色 `+` 和 `add` 状态；删除了顶部重复的 Add 按钮，Git 暂存仍可通过菜单和 Pending 流程使用。

## 0.8.0 — 2026-08-12

### English

- Submitted-change detail files now offer **Diff Against Previous Revision** as well as local Workspace comparison, including rename-aware external Diff inputs.
- Depot and Workspace trees now use P4V-style blue/yellow object icons and composable file badges for synced, previous, Workspace-only, differs, add/edit/delete/move/copy, resolve, and Git LFS lock states.
- Workspace status detection identifies files changed on the upstream since the merge base and retains pending deleted files in the tree; Depot continues to show only committed objects from the selected Git ref.
- Files, History, Pending, Submitted, Stream Graph, and Workspaces can all be closed and restored from checked **View** menu entries. Visibility, active tab, per-tab filters, scroll position, and mounted view state persist.
- Selecting a Workspace file or folder while Submitted is active now clears stale rows immediately, loads the path-scoped log, and remains on Submitted; an empty history produces an empty table.

### 中文

- Submitted 详情中的文件新增 **Diff Against Previous Revision**，同时保留本地 Workspace 比较；外部 Diff 可正确处理重命名前后的不同路径。
- Depot/Workspace 树改用 P4V 风格蓝色/黄色对象图标，并可叠加同步、落后、仅本地、内容不同、Add/Edit/Delete/Move/Copy、待 Resolve 和 Git LFS Lock 徽标。
- Workspace 会识别 merge-base 之后远端改动的文件，并保留待删除文件；Depot 继续只显示所选 Git ref 中真实存在的已提交对象。
- Files、History、Pending、Submitted、Stream Graph、Workspaces 均可关闭，并从带勾选状态的 **View** 菜单恢复；显示状态、活动页签、各页筛选、滚动位置和已挂载视图状态会保留。
- Submitted 活动时点击 Workspace 文件或文件夹，会立即清空旧行并加载路径范围提交，同时保持 Submitted；没有历史时显示空表。

## 0.7.0 — 2026-08-12

### English

- Revert now lists newly added files and requires explicit confirmation before permanently deleting them; tracked files in the same selection are restored to `HEAD`.
- Added a P4V-style **View Details...** window to Submitted commit context menus, including metadata, complete description, changed files, status, local Diff, and path copy.
- Pending Changelists start collapsed and persist expanded/collapsed state per repository across tab switches and application restarts.
- Branch switching now reloads Client identity, upstream, Workspace/Depot trees, history, graph, Changelists, and operation state as one consistent snapshot.
- Workspace file/folder selection automatically prepares path-linked History and filters Submitted to commits affecting that path.
- Rebuilt active-tab filtering with working Contains, Starts with, Regex, Match case, Clear, invalid-regex feedback, multi-field matching, and accurate counts.

### 中文

- Revert 新增文件前会列出将永久删除的文件并要求明确确认；同一选择中的已跟踪文件恢复到 `HEAD`。
- Submitted 提交右键新增 P4V 风格 **View Details...** 窗口，展示元数据、完整说明、文件及状态，并支持本地 Diff 和复制路径。
- Pending Changelist 默认折叠，按仓库持久记录展开/折叠状态，切换页签或重启后保持。
- 切换分支后统一重载 Client 标识、upstream、Workspace/Depot 树、历史、提交图、Changelist 和操作状态。
- 点击 Workspace 文件或文件夹会自动准备对应 History，并让 Submitted 只显示影响该路径的提交。
- 重做活动页签 Filter：Contains、Starts with、Regex、Match case、Clear、非法正则提示、多字段匹配和结果计数均实际生效。

## 0.6.1 — 2026-08-12

### English

- Pending now exposes **Diff Selected Files** when multiple rows are selected.
- The built-in batch Diff window lists every selected file, loads comparisons independently, reports per-file failures, and supports Previous/Next navigation.
- A configured external Diff tool is launched for every selected file instead of only the focused row.

### 中文

- Pending 多选后右键菜单显示 **Diff Selected Files**。
- 内置批量 Diff 窗口列出全部选中文件，独立加载每个比较、显示单文件错误，并支持 Previous/Next 导航。
- 配置外部 Diff 后会为每个选中文件启动比较，不再只处理焦点行。

## 0.6.0 — 2026-08-12

### English

- Added immediate Fetch feedback with an animated footer indicator, progress line, duplicate-run protection, and task-center visibility.
- Made the Stream Graph branch pane horizontally resizable and added case-insensitive fuzzy branch-name filtering.
- Added Compare commit details, changed-file status, and per-file comparison against the local workspace with external-diff support.
- Changed selective merge to create a named local Changelist and apply commits without creating a Git commit; Resolve continues the queued sequence after conflicts.
- Detects and separates patch-equivalent commits that are already integrated into the current branch.
- Made integration tests portable across Windows and Linux line endings and path separators.

### 中文

- Fetch 现在会立即显示底部动画、进度线和任务中心记录，并阻止重复启动。
- Stream Graph 分支栏支持横向拖动调宽，并可按分支名称进行不区分大小写的模糊筛选。
- Compare 支持查看提交详情、变更文件状态，并对单个文件执行“提交版本与本地工作区”比较；配置外部 Diff 后会优先使用。
- 选择性合并现在会新建命名本地 Changelist，并在不创建 Git commit 的情况下应用提交；冲突解决后继续剩余队列。
- 合并前识别并单独显示当前分支中已经存在的等价补丁。
- 集成测试兼容 Windows/Linux 的换行符和路径分隔符。

## 0.5.0 — 2026-08-12

### English

- Added selective branch merging from **Compare with Current** and Revision Graph, with Ctrl/Shift/Ctrl+A commit selection.
- Applies selected commits in parent-aware order, rejects already-applied equivalent patches, and completes conflict-free sequences automatically.
- Integrates with Resolve so **Continue** resumes all queued commits after conflicts are resolved.

### 中文

- 在 **Compare with Current** 与 Revision Graph 中新增选择性分支合并，支持 Ctrl/Shift/Ctrl+A 多选提交。
- 按父子依赖顺序应用提交，拦截已经合入的等价补丁；无冲突时自动完成整个队列。
- 与 Resolve 流程集成；解决冲突后点击 **Continue** 会继续完成剩余提交。

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
