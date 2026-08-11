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

0.1 版本保留 Timelapse 与 Cancel 的布局位置，但暂时禁用。Revgraph 会打开 Git 分支对应的 **Stream Graph**。

## Git 操作映射

P4Git 保留 P4V 的操作名称，底层执行 Git：

| P4Git / P4V 操作 | 对应 Git 行为 |
|---|---|
| Refresh | 重新读取 `git status`、历史、分支和当前目录 |
| Get Latest | `git pull --ff-only` |
| Checkout | 用 `git add` 将所选已跟踪修改加入待提交列表 |
| Add | 用 `git add` 加入所选未跟踪文件 |
| Delete | 暂存 Git 已检测到的删除 |
| Revert | 确认后恢复未暂存的已跟踪文件 |
| Submit | 用 Ready to submit 创建本地 Git commit |
| Connection > Fetch | `git fetch --all --prune` |
| Connection > Push | 推送当前分支；需要时自动创建 upstream |

**Checkout 不会锁定文件，也不会执行 `git checkout`。** Git 编辑文件前不需要 Open for edit；P4Git 中这个按钮表示“把该已跟踪修改加入下一次 Submit”。

## Workspace 与 Files

在左侧 **Workspace** 树展开目录，选择文件夹后，右侧 **Files** 表格会显示其内容。双击文件夹可以打开；发生 Git 改动的文件会显示对应 Action，双击该文件可以查看差异。

位置栏与底部状态栏会持续显示当前本地目录。仓库内部的 `.git` 管理目录不会出现在树中。

## Pending 变更列表

P4Git 把 Git 索引映射为两个 P4V 风格变更列表：

- **Default changelist** 包含未暂存和未跟踪的工作区改动。
- **Ready to submit** 包含 Git 索引中已暂存的改动。

部分暂存的文件可能同时出现在两个分组，因为已暂存版本和工作区版本拥有不同的差异。状态标记包括 `M`（修改）、`A`（新增）、`D`（删除）、`R`（重命名）、`C`（复制）、`?`（未跟踪）和 `!`（冲突）。

把文件加入 **Ready to submit** 有两种方式：

1. 选中文件，并按其状态使用 **Checkout**、**Add** 或 **Delete**。
2. 从 **Default changelist** 直接拖到 **Ready to submit**。

如果只想从本次提交中移除文件、但保留文件内容，请把它从 **Ready to submit** 拖回 **Default changelist**。这会取消 Git 暂存。

## Diff 与 Revert

双击 Pending 文件，或选中后点击 **Diff**，对应的已暂存或未暂存差异会显示在底部 **Diff Summary**。未跟踪文本文件按全新内容显示；二进制文件和大于 2 MB 的未跟踪文件不提供预览。

对于未暂存的已跟踪文件，**Revert** 会在确认后恢复工作区内容，P4Git 无法撤销该操作。未跟踪文件不能使用 Revert，因此 P4Git 不会隐式删除它们。

## Submit Changelist

1. 把本次需要的文件移入 **Ready to submit**。
2. 点击操作栏或 Actions 菜单中的 **Submit**。
3. 在 Submit Changelist 窗口检查完整文件列表。
4. 输入非空说明并点击 **Submit**。

存在冲突文件时无法提交。操作结果是本地 Git commit，不会自动 Push。P4Git 调用配置的真实 Git，因此仓库 Hooks 和提交策略仍会执行。

## Submitted

**Submitted** 表格以 P4V 风格的 Change、Date Submitted、Submitted By、Description 四列显示最近 100 个 Git 提交。选择一行后，完整哈希、作者、时间和主题会显示在 **Details**。

0.1 版本暂不提供单个提交的文件列表、Cherry-pick、Reset 和交互式 Rebase。

## Stream Graph

**Stream Graph** 在 P4V 对应位置呈现 Git 分支。它会列出本地和远程分支、标记当前分支、从 `HEAD` 创建本地分支，并在已有本地分支之间切换。0.1 版本的远程分支只读。

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
