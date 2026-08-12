[English](user-guide.md) | [简体中文](user-guide.zh-CN.md)

# 使用指南

## P4V 风格布局

P4Git 有意沿用 P4V 桌面端的结构，而不是常见 Git 客户端的仪表盘：

- **原生菜单**：File、Edit、Search、View、Actions、Connection、Tools、Window、Help。
- **大图标操作栏**：Refresh、Get Latest、Submit、Checkout、Add、Delete、Revert、Diff、Timelapse、Revgraph、Cancel。
- **位置栏**：经过校验的 Git 仓库根目录和当前查看的工作区目录。
- **Workspace 面板**：左侧 Depot/Workspace 页签下的可展开目录树。
- **主页签**：Files、Pending、Submitted、Stream Graph、Workspaces。
- **详情面板**：主表格下方的 Details、Files、Jobs、Diff Summary。
- **Log 与状态栏**：显示执行过的操作、结果、当前路径、upstream 和就绪状态。

**Timelapse** 使用 Git blame 提供逐行历史。**Revgraph** 会打开使用真实 commit parent 关系绘制的 **Stream Graph**。Git 命令运行时 **Cancel** 会启用，并终止由 P4Git 启动的命令进程树。

位置栏可以直接编辑并按 Enter 导航；右侧按钮提供最近地址、添加/移除书签和书签列表。左侧 Workspace 下拉框切换最近仓库，表格列标题可点击排序；树和主列表各自有过滤入口。Files、History、Pending、Submitted、Stream Graph、Workspaces 都可以关闭，并通过 **View** 菜单中带勾选状态的项目恢复。P4Git 会记住可见/活动页签、各页独立筛选、滚动位置及已挂载视图状态；最后一个可见页签不能关闭。

## Git 操作映射

P4Git 保留 P4V 的操作名称，底层执行 Git：

| P4Git / P4V 操作 | 对应 Git 行为 |
|---|---|
| Refresh | 重新读取 `git status`、历史、分支和当前目录 |
| Get Latest | 先 Fetch；可快进时自动更新，分叉时明确选择 Merge/Rebase |
| Checkout | Workspace 中把已跟踪修改加入 Ready to submit；Depot 中取出所选分支版本后加入 Ready to submit；干净文件无需 Git 锁 |
| Add | 用 `git add` 加入所选未跟踪文件 |
| Delete | `git rm` 删除所选已跟踪文件并暂存删除 |
| Revert | 已跟踪文件恢复到 `HEAD`；新增/未跟踪文件只在单独列出并确认后删除 |
| Diff | 对比工作区、索引、所选 Depot 分支或提交的文本差异 |
| Timelapse | 用 `git blame --line-porcelain` 显示逐行作者、提交和时间 |
| Revgraph | 打开以 commit parent 和 Git 分支绘制的多轨 Revision/Stream Graph |
| Submit | 将 Ready to submit 送达到跟踪的服务器分支并验证 |
| Connection > Fetch | `git fetch --all --prune` |
| Connection > Push | 推送当前分支；需要时自动创建 upstream |

**Checkout 不会模拟 Perforce 独占锁，也不会切换 Git 分支。** 对已有 Workspace 修改，它把文件加入下一次 Submit；对干净文件，它只表示可以开始编辑；从 Depot 执行时会把所选分支版本恢复到 Workspace 并加入下一次 Submit。右键 **Checkout and Open** 还会用系统关联程序打开文件。

## Depot 与 Workspace

P4V 的 Depot 是服务端版本库，Workspace 是本地工作副本。P4Git 采用最接近的 Git 映射：

- **Depot** 显示所选 upstream、`HEAD`、本地或远程分支中的已提交文件树，不显示未跟踪文件。
- **Workspace** 显示磁盘上的真实目录，包括已跟踪、修改和未跟踪文件。
- Depot 顶部下拉框用于切换查看的 Git 引用；从 Depot 右键可 Get Latest Revision、Checkout、Diff、File History、Time-lapse，或定位到 Workspace。
- Workspace 右键可 Checkout、Add、Delete、Revert、Diff、File History、Time-lapse、资源管理器定位，以及定位到 Depot。

文件树遵循 P4V 的“对象图标 + 可叠加徽标”模型：Depot 文件夹为蓝色，Workspace 文件夹为黄色；文件可同时显示多个状态。徽标区分已同步到 head、落后于 upstream、仅存在于 Workspace、未暂存内容不同、自己的 Add/Edit/Delete/Move/Copy、需要 Resolve，以及自己或其他用户持有的 Git LFS Lock。悬停图标可查看完整状态。红色动作徽标表示自己的待提交操作；Git 无法可靠提供的其他用户 Perforce Checkout 状态不会伪造。

## Workspace 与 Files

在左侧 **Workspace** 树展开目录，选择文件夹后，右侧 **Files** 表格会显示其内容。双击文件夹可以打开；发生 Git 改动的文件会显示对应 Action，双击该文件可以查看差异。选择 Workspace 文件或文件夹时，会立即让 **History** 与 **Submitted** 指向该路径，但不会改变当前主页签。Submitted 查询期间先清空旧行；没有提交记录时保持空表。选择 Workspace 根目录即可恢复仓库全部提交。

位置栏与底部状态栏会持续显示当前本地目录。仓库内部的 `.git` 管理目录不会出现在树中。

## Pending 变更列表

P4Git 在 Git 之上增加了一层仅属于当前仓库的 Changelist 管理：

- **Ready to submit** 对应真实的 Git 索引，包含已暂存改动。
- **Default changelist** 包含尚未归入命名列表的未暂存或未跟踪改动。
- **命名 Changelist** 是按任务、功能或修复整理改动的本地持久分组，可以为空，也可以填写说明。

通过 Pending 页的 **New Changelist...** 或 **Actions > New Changelist...** 创建列表。使用 `Ctrl`、`Shift` 或 `Ctrl+A` 多选 Pending 文件，然后把它们拖到某个分组，或右键并使用 **Move to Changelist** 批量归组。多选后的 **Diff Selected Files** 会比较全部选中文件：内置窗口提供接近 P4V 的文件列表以及 Previous/Next 导航；配置外部 Diff 后会把每个文件都交给外部工具，不再只处理焦点行。该子菜单中的 **New Changelist...** 会创建新列表，并立即把全部选中文件移入其中。右键命名列表可提交、编辑、删除，或把其中全部文件移入 Ready。删除列表不会删除任何文件，其中的改动会回到 **Default changelist**。Changelist 默认折叠；每个仓库的展开状态会在切换页签和重启应用后继续保留。

命名列表的归属信息保存在当前仓库的 `.git/p4git/changelists.json` 中。它在应用重启后仍然存在，但只属于当前 clone，也不可能进入 Git commit；列表改名和说明同样保存在这里。

右键本地 Changelist 选择 **Shelve Changelist**，可把该列表文件保存到本地 Git stash 并清理工作区。通过 **Tools > Git > View Shelves** 执行 Unshelve 后，P4Git 会恢复改动及原 Changelist 文件归属。Shelf 只存在于当前 clone，不会自动上传服务器。

把文件移入 **Ready to submit** 会执行暂存；把已暂存文件移回 Default 或命名列表会取消暂存，但不会丢弃工作区内容。部分暂存的文件可能同时出现在 Ready 和本地列表中，因为已暂存版本与工作区版本的差异不同。状态标记包括 `M`（修改）、`A`（新增）、`D`（删除）、`R`（重命名）、`C`（复制）、`?`（未跟踪）和 `!`（冲突）。

## Diff 与 Revert

双击 Pending 文件，或选中后点击 **Diff**，对应的已暂存或未暂存差异会在双栏视图中显示，支持行号、行对齐、字符级高亮、同步滚动以及上一个/下一个差异跳转。未跟踪文本文件按全新内容显示；二进制文件和大于 2 MB 的未跟踪文件不提供预览。

**Revert** 会在确认后同时恢复所选已跟踪文件的索引和工作区内容。对于选中的新增或未跟踪文件，P4Git 会另行列出文件清单并警告永久删除；混合多选时只删除清单中的新文件，其余已跟踪文件恢复到 `HEAD`。这些操作都无法由 P4Git 撤销。

### 外部 Diff 工具

通过 **Tools > Preferences...** 配置 Beyond Compare 或其他比较程序。该页面还可单独配置外部三方 Merge 工具，以及经典/浅色/深色主题、界面密度、字号和工具栏文字。P4Git 为 Beyond Compare 提供的默认模板是：

```text
/solo /readonly /lefttitle={leftTitle} /righttitle={rightTitle} "{left}" "{right}"
```

模板必须包含 `{left}` 和 `{right}`；可选的 `{leftTitle}`、`{rightTitle}` 用于显示易读的左右标题。参数会以数组直接传给可执行程序，不经过命令行 shell。

Windows 首次使用时会自动发现 `C:\Program Files\Beyond Compare 5\BCompare.exe`（也兼容 Beyond Compare 4）。配置外部工具后，HEAD/Workspace、index/Workspace、HEAD/index、Depot ref/Workspace 和 History Previous/HEAD 会优先使用它。P4Git 会生成保留二进制内容的临时只读副本，并清理超过 24 小时的旧副本。工具被禁用、丢失或启动失败时，使用新的 Beyond Compare 风格内置双栏视图。

## Workspace 选择与多窗口

启动时先显示 Workspace 选择器，只预选最近仓库，不会自动连接。**File > New Workspace Window** 打开另一个选择窗口；Workspaces 列表右键可把仓库直接打开到新窗口。仓库选择、分支、页签、任务和取消操作均限定在对应窗口与 Workspace。

## Submit Changelist

1. 右键命名或 Default changelist，选择 **Submit Changelist**；也可以从操作栏或 Actions 菜单提交 **Ready to submit**。
2. 提交本地列表时，P4Git 会只把该列表中的文件准备到 Git 索引，其他列表的改动继续留在工作区。
3. 在 Submit Changelist 窗口检查本次提交的准确文件列表。
4. 输入非空说明并点击 **Submit to Server**。如果说明框原本为空，命名列表的说明会自动作为初始 commit message。

P4Git 会 Fetch、创建本地 commit、需要时 Rebase 到新的 upstream、在不使用 Force Push 的情况下 Push，并核对远端分支的精确哈希。只有全部完成后才报告成功并清除已提交路径的列表归属；命名 Changelist 本身会保留，直到你主动删除。

Rebase 冲突时，Submit 会暂停并进入 Resolve，Continue 将继续同一笔服务器送达事务。断网、权限、保护分支、Hook 或服务器策略拒绝 Push 时，提交会明确显示为 **Local only** 并提供 **Retry Submit**，绝不会误报为已提交。已配置 GitLab 项目时，**Create GitLab MR** 会推送并验证一个 `p4git/*` 来源分支，再向原目标创建 Merge Request；界面会明确提示目标分支只有在 MR 合并后才算提交。历史整理期间，其他未提交 Changelist 会放入内部 Stash 保护并在完成后恢复。确实只想创建本地 commit 时使用 **Tools > Git > Commit Locally**。P4Git 调用配置的真实 Git，因此仓库 Hooks 和提交策略仍会执行。

## Submitted

**Submitted** 表格以 P4V 风格的 Change、Date Submitted、Submitted By、Description 四列显示最近 100 个 Git 提交。选择一行后，完整哈希、作者、时间和主题会显示在 **Details**。

每个提交左侧箭头可原位展开文件列表。右键 **View Details...** 会打开接近 P4V 的详情窗口，显示完整说明、作者、日期、parents 和文件状态。详情中的文件可右键与上一版本或本地 Workspace 版本比较（已配置外部 Diff 时优先使用），也可复制路径；新增/删除使用空版本，重命名会使用旧路径进行正确比较。其他右键操作包括与上一版本的完整 Diff、复制完整 commit hash、用新提交撤销所选变更、Cherry-pick、新建分支或 Tag，以及 Reset 当前分支。**Revert This Commit** 执行 `git revert --no-edit`，保留历史并生成反向提交；如果发生冲突，会转入 Resolve 工作流。交互式 Rebase 暂未提供。

## History

在 Depot 或 Workspace 中选择文件或目录，通过右键 **File History** 打开历史；也可以使用 **View > History** 查看当前选中路径。P4Git 会打开与该路径联动的常驻 **History** 页签，不再使用临时弹窗。

表格显示近似文件版本号、commit hash、日期、作者和说明。选择某个版本后，下方会显示 commit 详情；双击可与上一版本比较。**Get This Revision** 会打开预览窗口，也可输入分支、Tag、完整/短哈希或日期。执行前会显示解析出的提交及变更文件，再恢复选中的工作区路径。

## Stream Graph

**Stream Graph** 在 P4V 对应位置呈现 Git 拓扑。主表根据每个 commit 的 parent 绘制多轨线和合并连接；左侧列出本地和远程分支并标记当前分支。在 **Filter branch names...** 中输入部分名称即可进行不区分大小写的模糊筛选。拖动 Branches/Streams 与 Graph 之间的分隔条可为长分支名扩宽；宽度会自动保存，双击分隔条恢复默认值。可以新建分支，右键分支可切换或以它为起点创建分支。远程分支只读，但可以作为新本地分支的起点。

## Resolve 冲突

通过 **Tools > Git > Resolve Conflicts** 打开三方解决器。文件列表右侧同时显示 Base、Ours、Theirs 和当前工作区 Result。标准冲突块可逐块选择 Ours、Theirs 或 Both，Result 也可继续手工编辑；配置外部三方 Merge 后可直接启动并写回结果。二进制冲突使用整文件 Ours/Theirs 或外部工具。全部解决后使用 **Continue Operation** 继续当前操作。

Merge、Rebase、Cherry-pick、Revert 或 Get Latest 产生冲突时，P4Git 会自动打开 Resolve。状态栏持续显示当前操作、冲突数，以及是否已经可以 Continue。

## 多选、布局、任务与 LFS 锁

Files、Pending、History、Submitted、Revision Graph 和 Workspaces 均支持 `Ctrl`、`Shift`、`Ctrl+A`。支持批处理的右键命令会作用于完整选择。在 Depot 或 Workspace 选中文件/文件夹会显示持续选中态并刷新对应的 History 与 Submitted 数据，但不会改变右侧当前页签。Pending Changelist 文件右键提供 **Show in Depot Tree**、**Show in Workspace Tree** 和 **Show in Explorer**；树定位会逐级展开父目录、选中目标并滚动到可见位置，文件已删除时资源管理器打开原目录。当前页签 Filter 支持 **Contains**、**Starts with**、正则表达式和区分大小写，可匹配可见名称、路径、状态、作者、说明、哈希和 ref；无效正则会明确报错。拖动 Workspace、Details、Log 分隔线可调整工作区；拖动 Files/Pending 列头边缘可为长文件名扩宽，尺寸会跨启动保存，悬停还能查看完整路径。所有模态次级界面都可拖动标题栏改变位置，双击标题栏恢复居中。

Log 旁的 **Tasks** 按钮用于查看命令历史和运行状态。Fetch 开始后，底部会立即显示旋转状态和不确定进度线，慢速远端不再像“点击无反应”；已有 Fetch 运行时会阻止重复启动。**Cancel Running** 会终止活动 Git 进程树。通过 **Tools > Git > Git LFS Locks** 或文件右键 **Git** 子菜单查看、创建、解锁或强制解锁 LFS Lock；Git LFS 或远端锁不可用时会明确显示原因。

## 原生右键菜单

P4Git 按 P4V 的对象上下文策略提供原生右键菜单：树、文件表、Pending 文件、Submitted 提交、分支、Workspace 列表和 Log 各自只显示适用操作。不可用操作会禁用，而不会显示一个点击后无反应的占位按钮。

## 纯 Git 功能

为了不打乱 P4V 的菜单结构，纯 Git 功能集中在 **Tools > Git**，并在对象右键菜单的 **Git** 子菜单中提供上下文入口：

- **Tools > Git**：Stash Changes、Pop Latest Stash、View Stashes、View Reflog、Merge、Rebase、Create Tag，以及 Abort Merge/Rebase/Cherry-pick。
- **Workspace / Pending 文件**：Stage、Unstage 和仅 Stash 所选文件或目录。
- **Submitted 提交**：Cherry-pick、从提交新建分支、创建轻量 Tag，以及 Soft/Mixed/Hard Reset。
- **分支**：Merge 到当前分支、把当前分支 Rebase 到所选分支、创建 Tag 和安全删除已合并的本地分支。远程分支的 **Work in this Stream** 会切换到已有跟踪分支，或自动建立本地跟踪分支后切换。
- **Workspaces**：对指定仓库执行 Fetch、Pull、Push、Stash，并查看 Stashes 或 Reflog。

Merge、Rebase 和 Cherry-pick 发生冲突时，Git 会保留进行中的操作以便解决。可以在 **Tools > Git > Abort Operation** 中明确中止。Hard Reset 和 Drop Stash 需要输入确认词；P4Git 不会静默执行这些不可逆操作。

如果切换会覆盖本地改动，Git 会阻止操作；P4Git 只显示错误，不会强制切换。

## Workspaces

**Workspaces** 页签显示最近仓库。双击表格行即可打开。使用 **File > Open Workspace** 选择已有仓库，使用 **File > Clone Repository** 输入 URL 和父目录，或用 **File > Init Repository** 在所选目录创建新仓库和初始分支。

使用 **Tools > Git Settings** 可以选择 Git for Windows 或 UGit 自带的 `git.exe`。P4Git 会先执行 `git --version` 验证，再保存路径。

## 远程同步

- **Get Latest** 会先 Fetch。可安全快进时自动更新；本地与远程历史分叉时，会显示双方提交数，并要求选择 Merge、Rebase 或 Cancel。
- **Connection > Fetch** 更新远程跟踪引用，不修改本地文件。
- **Connection > Push** 执行普通 Push；新的本地分支会推送到 `origin` 并设置 upstream。

**Connection > Push** 会先打开预览窗口，可选择 Remote、本地分支、远端分支和是否设置 upstream，并查看即将推送的 commit。**Tools > Git > Manage Remotes** 可新增、改名、修改 Fetch/Push URL 或删除 Remote。分支右键提供 Rename 和 **Compare with Current**，后者分别列出 Incoming 与 Outgoing commits。在 Compare 中右键或双击提交可查看完整说明、parents 和变更文件；文件会标注 Added/Modified/Deleted/Renamed/Copied。右键文件可把该提交版本与本地工作区比较；配置外部 Diff 后优先使用，失败时回退到内置文本 Diff。

如果只想把其他分支的部分工作合入当前检出的分支，请先保证工作区干净。打开 **Compare with Current**，用 `Ctrl`、`Shift` 或 `Ctrl+A` 多选 Incoming commits，然后点击 **Merge Selected into <当前分支>**；Revision Graph 也支持多选提交后通过右键执行。输入新本地 Changelist 的名称和说明后，P4Git 会按父子依赖/从旧到新的顺序使用 `cherry-pick --no-commit` 应用提交，最后取消暂存并把所有工作区改动归入该 Changelist，整个过程不会自动创建 Git commit。遇到冲突会打开 Resolve；全部解决后点击 **Continue** 继续剩余队列，结果仍归入同一个 Changelist。**Abort** 会恢复开始时的干净版本并删除临时列表。Merge commit 需要额外指定 mainline parent，因此当前不纳入这项流程。

Compare 会先让 Git 识别当前分支已经包含的等价补丁，并将其放入只读的 **Already integrated (equivalent patch)** 区域，不能再次选择。这样在点击 Merge 前就能解释“该提交已经包含在当前分支中”的情况。

**Tools > Git > Amend Last Commit** 可以更改最近一次提交说明，并把当前 staged 文件加入该提交。Amend 会改变 commit ID；已经共享给他人的提交不应 Amend。

终端交互提示已禁用。HTTPS 凭据需要已经保存在 Git Credential Manager 中；SSH 认证需要通过已有密钥或 Agent 正常工作。

## GitLab Merge Request、CI 与 Jobs

通过 **Tools > Git > GitLab** 打开面板。P4Git 会从常见 HTTPS、SSH 或 `git@host:group/project.git` origin 推导服务地址和项目路径，也可以手工修改。私有项目通常需要 GitLab Personal Access Token；Token 仅在主进程使用，并通过当前 Windows 账户的系统加密能力保存，React 页面不能读回明文。

连接后可浏览打开的 Merge Request、最近 Pipeline 和 Issue；点击条目会在浏览器打开 GitLab。可从当前分支向所选目标分支创建 MR。主窗口下方 **Jobs** 使用 GitLab Issues 作为 P4V Jobs 的近似映射。当前版本不包含 Pipeline Job 实时日志、审批操作或自动把 Issue 关联到 commit。

## 刻意不自动执行的操作

P4Git 不会静默 Merge、Rebase、删除未跟踪文件、丢弃已暂存内容、自动选择冲突版本、绕过 Git Hooks，也不会模拟 Perforce 文件锁。这些操作需要额外上下文，客户端不应该替用户猜测。
