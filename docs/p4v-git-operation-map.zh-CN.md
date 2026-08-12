[English](p4v-git-operation-map.md) | [简体中文](p4v-git-operation-map.zh-CN.md)

# P4V 与 Git 操作映射

本文记录 P4Git 对 P4V 操作的实现策略、无法完全等价的能力，以及需要确定产品位置的 Git 特有能力。

## 设计依据

P4Git 参考 Perforce 官方文档中的 [P4V 基本概念](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/introduction.about.html)、[工具栏](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/using_toolbar.html)、[导航与右键菜单](https://help.perforce.com/helix-core/server-apps/p4v/2026.1/Content/P4V/using.navigating.html)、[Get Latest](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/files.retrieve.html)、[Submit](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/files.submit.html)、[Revert](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/files.revert.html)和 [Diff](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/diff-summary.html)。

## 已实现映射

| P4V 概念或操作 | P4Git / Git 策略 | 状态 |
|---|---|---|
| Depot | 所选 upstream、`HEAD`、本地或远程分支的已提交文件树 | 已实现 |
| Workspace | 磁盘上的 Git working tree，包含未跟踪文件 | 已实现 |
| Refresh | 重新读取 status、当前文件树、提交历史和分支 | 已实现 |
| Get Latest | 顶层先 Fetch，可快进时自动更新，分叉时询问 Merge/Rebase；Depot 文件/目录从所选 ref 恢复 | 已实现 |
| Checkout / Open for edit | 已修改文件 `git add`；Depot 版本恢复后暂存；干净文件不加锁 | 已实现，非锁定式 |
| Add | `git add` 未跟踪文件 | 已实现 |
| Delete | `git rm`，或登记已经发生的磁盘删除 | 已实现 |
| Revert | 恢复 `HEAD` 的 index 与 working tree；新增文件只取消暂存 | 已实现，有确认 |
| Diff | Working tree、index、Depot ref、commit diff | 已实现，文本显示 |
| 外部 Diff 工具 | 用户配置可执行程序和参数模板；提供 Beyond Compare 默认值与内置回退 | 文件 Diff 已实现 |
| Time-lapse View | `git blame` 逐行作者、提交和时间 | 已实现，简化版 |
| Revision Graph / Stream Graph | 使用 commit parent 关系绘制多轨拓扑，并在同一视图列出本地/远程分支 | 已实现 |
| Resolve | 读取 Git index 的 Base/Ours/Theirs 三个 stage，支持选边、手工合并和 Continue | 已实现 |
| Pending changelist | Ready 映射为 Git index；本地持久化的多个命名列表用于整理未暂存改动 | 已实现，本地语义 |
| Shelve / Unshelve | Changelist 映射为带 P4Git 元数据的本地 Git stash，恢复时还原文件归组 | 已实现，本地语义 |
| Submit | 从 Git index 创建本地 commit，不自动 Push | 已实现 |
| Submitted | Git log；展开文件、Diff、复制 hash，并用 `git revert` 撤销所选提交 | 已实现 |
| Jobs | GitLab Issues | GitLab 项目已配置时实现 |
| 文件/目录 History | 基于 Git log 的路径联动常驻 History 页签，支持恢复版本及与 Previous/HEAD 比较 | 已实现 |
| Workspaces | 最近打开的本地 Git 仓库 | 已实现 |
| 原生右键菜单 | 按 Workspace、Depot、Pending、Submitted、Branch 等对象显示适用操作 | 已实现 |
| Log | 显示命令意图、成功或错误，可右键清空 | 已实现 |

## P4V 有、Git 核心没有直接等价物

以下项目不会用不可靠的假动作伪装；当前保持禁用或未显示：

- Perforce 的 opened-by、独占 Checkout 和服务端文件锁。Git LFS lock 可做可选近似，但普通 Git 不具备。
- 服务端编号、多人共享 Changelist 与服务端归属状态。P4Git 已支持多个本地命名 Changelist，但元数据只保存在当前 clone 的 `.git/p4git` 中，不会同步。
- Shelve / Unshelve 的服务端语义。Git stash 可以近似，但 stash 默认是本地的。
- Fixes 和提交关联没有通用 Git 等价；Jobs 已可选映射到 GitLab Issues。
- Perforce Streams 的父子规则、Merge/Copy 流程仍无直接等价；Git 分支和 commit parent 只提供拓扑近似。
- Labels 的集中式语义。Git tag 是近似物，但权限和移动规则不同。
- Workspace View、映射规则与同一 Depot 的客户端视图。Git sparse-checkout 可提供部分近似。
- 权限、用户、保护表、Obliterate 等服务器管理功能。
- P4V 完整 Time-lapse 播放。文件 Diff 已支持外部工具，但目录和整个 commit 的外部比较尚未提供。

## Git 有、P4V 核心界面没有直接位置的能力

已采用 P4V-first 放置原则：纯 Git 操作进入 **Tools > Git**，同时进入相关对象右键菜单的 **Git** 子菜单。目前已实现：

- Stash 的创建、列表、Apply、Pop 和 Drop。
- Reflog 查看与 hash 复制。
- Merge、Rebase、Cherry-pick，以及对应的 Abort 操作。
- Soft、Mixed、Hard Reset，轻量 Tags，以及从提交/ref 新建分支。
- 文件级 Stage、Unstage、Stash；分支安全删除；指定 Workspace 的 Fetch、Pull、Push。
- File 菜单中的 Clone/Init；GitLab 面板中的 MR 创建、MR/Pipeline/Issue 浏览。
- Remote 管理、Push 提交预览、分支重命名与 Incoming/Outgoing 比较、Amend。

仍待实现：

- remote 管理与独立 prune 界面。
- 交互式 Rebase。
- Submodules、worktrees、sparse-checkout 与 `.gitignore` 编辑。
- Git LFS 与 LFS locks。
- GitHub Pull Request 集成；更完整的 GitLab Job 日志、审批和 Issue 关联。
