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

**Timelapse** 使用 Git blame 提供逐行历史。**Revgraph** 会打开 Git 分支对应的 **Stream Graph**。只有无法安全取消的同步 Git 进程所对应的 **Cancel** 暂时禁用。

## Git 操作映射

P4Git 保留 P4V 的操作名称，底层执行 Git：

| P4Git / P4V 操作 | 对应 Git 行为 |
|---|---|
| Refresh | 重新读取 `git status`、历史、分支和当前目录 |
| Get Latest | `git pull --ff-only` |
| Checkout | Workspace 中把已跟踪修改加入 Ready to submit；Depot 中取出所选分支版本后加入 Ready to submit；干净文件无需 Git 锁 |
| Add | 用 `git add` 加入所选未跟踪文件 |
| Delete | `git rm` 删除所选已跟踪文件并暂存删除 |
| Revert | 确认后把所选文件的索引和工作树恢复到 `HEAD`；Add 文件保留在磁盘 |
| Diff | 对比工作区、索引、所选 Depot 分支或提交的文本差异 |
| Timelapse | 用 `git blame --line-porcelain` 显示逐行作者、提交和时间 |
| Revgraph | 打开以 Git 分支映射的 Stream Graph |
| Submit | 用 Ready to submit 创建本地 Git commit |
| Connection > Fetch | `git fetch --all --prune` |
| Connection > Push | 推送当前分支；需要时自动创建 upstream |

**Checkout 不会模拟 Perforce 独占锁，也不会切换 Git 分支。** 对已有 Workspace 修改，它把文件加入下一次 Submit；对干净文件，它只表示可以开始编辑；从 Depot 执行时会把所选分支版本恢复到 Workspace 并加入下一次 Submit。右键 **Checkout and Open** 还会用系统关联程序打开文件。

## Depot 与 Workspace

P4V 的 Depot 是服务端版本库，Workspace 是本地工作副本。P4Git 采用最接近的 Git 映射：

- **Depot** 显示所选 upstream、`HEAD`、本地或远程分支中的已提交文件树，不显示未跟踪文件。
- **Workspace** 显示磁盘上的真实目录，包括已跟踪、修改和未跟踪文件。
- Depot 顶部下拉框用于切换查看的 Git 引用；从 Depot 右键可 Get Latest Revision、Checkout、Diff、File History、Time-lapse，或定位到 Workspace。
- Workspace 右键可 Checkout、Add、Delete、Revert、Diff、File History、Time-lapse、资源管理器定位，以及定位到 Depot。

## Workspace 与 Files

在左侧 **Workspace** 树展开目录，选择文件夹后，右侧 **Files** 表格会显示其内容。双击文件夹可以打开；发生 Git 改动的文件会显示对应 Action，双击该文件可以查看差异。

位置栏与底部状态栏会持续显示当前本地目录。仓库内部的 `.git` 管理目录不会出现在树中。

## Pending 变更列表

P4Git 在 Git 之上增加了一层仅属于当前仓库的 Changelist 管理：

- **Ready to submit** 对应真实的 Git 索引，包含已暂存改动。
- **Default changelist** 包含尚未归入命名列表的未暂存或未跟踪改动。
- **命名 Changelist** 是按任务、功能或修复整理改动的本地持久分组，可以为空，也可以填写说明。

通过 Pending 页的 **New Changelist...** 或 **Actions > New Changelist...** 创建列表。使用 `Ctrl`、`Shift` 或 `Ctrl+A` 多选 Pending 文件，然后把它们拖到某个分组，或右键并使用 **Move to Changelist** 批量归组。该子菜单中的 **New Changelist...** 会创建新列表，并立即把全部选中文件移入其中。右键命名列表可提交、编辑、删除，或把其中全部文件移入 Ready。删除列表不会删除任何文件，其中的改动会回到 **Default changelist**。

命名列表的归属信息保存在当前仓库的 `.git/p4git/changelists.json` 中。它在应用重启后仍然存在，但只属于当前 clone，也不可能进入 Git commit；列表改名和说明同样保存在这里。

把文件移入 **Ready to submit** 会执行暂存；把已暂存文件移回 Default 或命名列表会取消暂存，但不会丢弃工作区内容。部分暂存的文件可能同时出现在 Ready 和本地列表中，因为已暂存版本与工作区版本的差异不同。状态标记包括 `M`（修改）、`A`（新增）、`D`（删除）、`R`（重命名）、`C`（复制）、`?`（未跟踪）和 `!`（冲突）。

## Diff 与 Revert

双击 Pending 文件，或选中后点击 **Diff**，对应的已暂存或未暂存差异会显示在底部 **Diff Summary**。未跟踪文本文件按全新内容显示；二进制文件和大于 2 MB 的未跟踪文件不提供预览。

**Revert** 会在确认后同时恢复所选已跟踪文件的索引和工作区内容，P4Git 无法撤销该操作。已 Add 的新文件会取消暂存但保留磁盘内容；从未 Add 的未跟踪文件不能 Revert，因此 P4Git 不会隐式删除它们。

### 外部 Diff 工具

通过 **Tools > Preferences...** 配置 Beyond Compare 或其他比较程序。选择可执行文件，并按工具需要修改参数模板。P4Git 为 Beyond Compare 提供的默认模板是：

```text
/solo /readonly /lefttitle={leftTitle} /righttitle={rightTitle} "{left}" "{right}"
```

模板必须包含 `{left}` 和 `{right}`；可选的 `{leftTitle}`、`{rightTitle}` 用于显示易读的左右标题。参数会以数组直接传给可执行程序，不经过命令行 shell。

配置后，文件级 Diff 会自动优先使用外部工具，包括 HEAD/Workspace、index/Workspace、HEAD/index、Depot ref/Workspace，以及 History 的 Previous/HEAD 比较。P4Git 会生成保留二进制内容的临时只读比较副本，并清理超过 24 小时的旧副本。目录 History Diff 和整个 commit 的 Diff 仍显示在内置 Diff Summary。如果程序丢失或启动失败，P4Git 会提示错误并自动回退到内置视图。在 Preferences 中点击 **Disable** 可完全恢复内置 Diff。

## Submit Changelist

1. 右键命名或 Default changelist，选择 **Submit Changelist**；也可以从操作栏或 Actions 菜单提交 **Ready to submit**。
2. 提交本地列表时，P4Git 会只把该列表中的文件准备到 Git 索引，其他列表的改动继续留在工作区。
3. 在 Submit Changelist 窗口检查本次提交的准确文件列表。
4. 输入非空说明并点击 **Submit**。如果说明框原本为空，命名列表的说明会自动作为初始 commit message。

提交成功后，已提交路径的列表归属会被清除；命名 Changelist 本身会保留，直到你主动删除，方便后续继续使用。

存在冲突文件时无法提交。操作结果是本地 Git commit，不会自动 Push。P4Git 调用配置的真实 Git，因此仓库 Hooks 和提交策略仍会执行。

## Submitted

**Submitted** 表格以 P4V 风格的 Change、Date Submitted、Submitted By、Description 四列显示最近 100 个 Git 提交。选择一行后，完整哈希、作者、时间和主题会显示在 **Details**。

右键提交可查看文件列表、与上一版本的完整 Diff、复制完整 commit hash、Cherry-pick、新建分支或 Tag，以及 Reset 当前分支。交互式 Rebase 暂未提供。

## History

在 Depot 或 Workspace 中选择文件或目录，通过右键 **File History** 打开历史；也可以使用 **View > History** 查看当前选中路径。P4Git 会打开与该路径联动的常驻 **History** 页签，不再使用临时弹窗。

表格显示近似文件版本号、commit hash、日期、作者和说明。选择某个版本后，下方会显示 commit 详情；双击可与上一版本比较。版本右键菜单还提供 **Get This Revision**、**Diff Against Previous Revision**、**Diff Against Head**、**View Submitted Change** 和 **Copy Commit Hash**。恢复版本只修改选中的工作区路径，并会先要求确认。

## Stream Graph

**Stream Graph** 在 P4V 对应位置呈现 Git 分支。它会列出本地和远程分支、标记当前分支、新建分支，并在已有本地分支之间切换。右键分支可切换，或以该分支为起点新建分支。远程分支只读，但可以作为新本地分支的起点。

## 原生右键菜单

P4Git 按 P4V 的对象上下文策略提供原生右键菜单：树、文件表、Pending 文件、Submitted 提交、分支、Workspace 列表和 Log 各自只显示适用操作。不可用操作会禁用，而不会显示一个点击后无反应的占位按钮。

## 纯 Git 功能

为了不打乱 P4V 的菜单结构，纯 Git 功能集中在 **Tools > Git**，并在对象右键菜单的 **Git** 子菜单中提供上下文入口：

- **Tools > Git**：Stash Changes、Pop Latest Stash、View Stashes、View Reflog、Merge、Rebase、Create Tag，以及 Abort Merge/Rebase/Cherry-pick。
- **Workspace / Pending 文件**：Stage、Unstage 和仅 Stash 所选文件或目录。
- **Submitted 提交**：Cherry-pick、从提交新建分支、创建轻量 Tag，以及 Soft/Mixed/Hard Reset。
- **分支**：Merge 到当前分支、把当前分支 Rebase 到所选分支、创建 Tag 和安全删除已合并的本地分支。
- **Workspaces**：对指定仓库执行 Fetch、Pull、Push、Stash，并查看 Stashes 或 Reflog。

Merge、Rebase 和 Cherry-pick 发生冲突时，Git 会保留进行中的操作以便解决。可以在 **Tools > Git > Abort Operation** 中明确中止。Hard Reset 和 Drop Stash 需要输入确认词；P4Git 不会静默执行这些不可逆操作。

如果切换会覆盖本地改动，Git 会阻止操作；P4Git 只显示错误，不会强制切换。

## Workspaces

**Workspaces** 页签显示最后一个工作区和最多 8 个最近仓库。双击表格行即可打开。使用 **File > Open Workspace** 可以选择另一个已有 Git 仓库。

使用 **Tools > Git Settings** 可以选择 Git for Windows 或 UGit 自带的 `git.exe`。P4Git 会先执行 `git --version` 验证，再保存路径。

## 远程同步

- **Get Latest** 只允许快进 Pull。本地与远程历史分叉时，请在 P4Git 0.1 之外选择合适的 Merge 或 Rebase。
- **Connection > Fetch** 更新远程跟踪引用，不修改本地文件。
- **Connection > Push** 执行普通 Push；新的本地分支会推送到 `origin` 并设置 upstream。

终端交互提示已禁用。HTTPS 凭据需要已经保存在 Git Credential Manager 中；SSH 认证需要通过已有密钥或 Agent 正常工作。

## 刻意不自动执行的操作

P4Git 0.1 不会静默 Merge、Rebase、删除未跟踪文件、丢弃已暂存内容、解决冲突、绕过 Git Hooks，也不会模拟 Perforce 文件锁。这些操作需要额外上下文，客户端不应该替用户猜测。
