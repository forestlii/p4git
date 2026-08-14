[English](README.md) | [简体中文](README.zh-CN.md)

# P4Git — 受 P4V 启发的 Git 桌面客户端

[![Build](https://github.com/forestlii/p4git/actions/workflows/build.yml/badge.svg)](https://github.com/forestlii/p4git/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0c8b87.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/forestlii/p4git?include_prereleases&color=3273a8)](https://github.com/forestlii/p4git/releases)

P4Git 为 Git 团队提供一种接近 P4V 的工作区操作方式。它不要求迁移服务端，可以继续使用现有的 GitLab、GitHub 或自建 Git，通过清晰的变更列表、文件差异、历史、分支和同步操作完成日常版本管理。

![Windows](https://img.shields.io/badge/Windows-10%2B-1b5e9e) ![Git](https://img.shields.io/badge/Git-2.23%2B-f05032) ![Version](https://img.shields.io/badge/version-0.18.0-0c8b87)

## 核心能力

| 模块 | P4Git 提供什么 |
|---|---|
| P4V 布局 | 原生菜单、大图标操作栏、Workspace 树、页签表格、详情、Log 与状态栏 |
| Depot | 浏览所选 upstream、HEAD、本地或远程分支的已提交文件树 |
| 工作区 | 浏览全部本地文件并显示 P4V 风格徽标；仓库级元数据缓存保证目录展开响应速度 |
| 变更列表 | 创建本地命名 Changelist，批量归组文件，并记住每个列表的展开/折叠状态 |
| Shelve | 把一个 Changelist 保存为本地 Git stash，并在 Unshelve 时恢复文件归组 |
| 审阅 | 在修改索引前查看已暂存、未暂存和未跟踪文件的文本差异 |
| History | 为文件或目录打开 P4V 风格 History 页签，查看版本、恢复指定版本，或与 Previous/HEAD 比较 |
| Diff | 内置 MIT 开源 CodeMirror MergeView：完整文件双栏对齐、字符高亮、搜索、折叠及差异跳转；仍支持自动发现 Beyond Compare 5 |
| 提交 | P4V 严格送达：Fetch、commit、必要时 Rebase/Resolve、Push，并验证服务器引用后才报告成功 |
| Submitted | 懒加载按路径联动的提交；Change Details 显示完整路径、查看来源/包含分支，并支持复制标题、描述和提交信息 |
| Revision / Stream Graph | 支持单选或多选提交，并选择全部放入本地 Changelist 或使用 Cherry-pick 创建真实提交 |
| 选择性分支合并 | 按祖先顺序把全部选中提交应用到新建本地 Changelist，不自动创建 Git commit |
| Resolve | 冲突时自动使用已配置的外部三方 Merge 工具、逐文件复检结果，失败时回退内置逐块/整文件解决器 |
| Get Revision | 输入分支、Tag、哈希或日期，预览目标提交和文件后恢复一个或多个工作区路径 |
| Git LFS 锁 | 查看、创建、批量解锁和强制解锁远端 Git LFS Lock |
| 个性化工作区 | 拖动面板分隔线和文件列；选择经典/浅色/深色主题、密度、字号及工具栏文字 |
| 任务进度 | Fetch 时立即在底部显示运行状态，并可在任务中心查看或取消 Git 任务 |
| GitLab | 使用系统加密存储 PAT，查看 Merge Request、Pipeline 和 Issue，并创建 MR |
| 导航 | Depot/Workspace 与 History/Submitted 联动、View 管理的可关闭页签、各页独立持久筛选、书签和可排序表头 |
| 树定位 | Changelist 文件可定位到 Depot/Workspace 树并自动展开、选中和滚动；树选中持续驱动 History/Submitted |
| Workspaces | P4V 风格选择器与独立多窗口；New Workspace 可只登记服务器 URL，不 Fetch、也不展开任何文件 |
| 次级窗口 | 所有模态次级界面均可拖动，双击标题栏恢复居中 |
| 同步 | 安全 Get Latest：可快进时自动更新，分叉时明确选择 Merge 或 Rebase |
| Push / Remote | 管理 Remote，选择远端与目标分支，并在 Push 前预览提交 |
| Git 发现 | 自动查找 Git for Windows，也可选择 UGit 等客户端自带的 `git.exe` |

## 下载

从 [GitHub Releases](https://github.com/forestlii/p4git/releases/latest) 下载最新版本：

- **安装版（Setup）**：安装 P4Git、创建快捷方式，并提供标准卸载入口。
- **便携版（Portable）**：无需安装即可运行，适合试用或没有安装权限的电脑。

SHA-256 校验值会写入 [SHA256SUMS.txt](SHA256SUMS.txt)，并作为 Release 附件发布。

当前二进制文件尚未进行代码签名，Windows 可能提示“未知发布者”或 Microsoft Defender SmartScreen 警告。团队分发前请先阅读[安装与首次运行](docs/getting-started.zh-CN.md)。

## 快速开始

1. 安装 P4Git，或者直接运行便携版。
2. 确认 P4Git 找到了 Git；如果没有，请选择 Git for Windows 或 UGit 使用的 `git.exe`。
3. 打开已有 Git 工作区；需要立即下载时使用 **Clone**，只想登记服务器并保持空目录直到 Get Latest 时使用 **New Workspace**，全新本地仓库则使用 **Init**。
4. 打开 **Pending**；按任务创建命名 Changelist，通过拖拽或文件右键菜单整理改动。
5. 右键目标列表选择 **Submit Changelist**，或把文件移到 **Ready to submit** 后点击 **Submit**。
6. 使用 **Get Latest** 和 **Connection** 菜单执行 Pull、Fetch 或 Push。

## 文档

完整中英文文档位于 [docs/](docs/README.zh-CN.md)：

- [安装与首次运行](docs/getting-started.zh-CN.md)
- [使用指南](docs/user-guide.zh-CN.md)
- [P4V 与 Git 操作映射](docs/p4v-git-operation-map.zh-CN.md)
- [故障排查](docs/troubleshooting.zh-CN.md)

## 环境要求

- Windows 10 或更高版本，x64
- Git 2.23 或更高版本
- Fetch、Pull、Push 需要 Git 已经配置好对应服务端凭据
- GitLab 面板需要自建 GitLab/GitLab.com 地址；私有项目通常需要 `api` scope 的 Personal Access Token

## 安全设计

- React 页面没有 Node.js 权限，只能通过类型化 IPC 白名单访问 Electron。
- Git 命令通过 `execFile` 参数数组执行，不经过命令行 shell。
- 文件操作会校验路径必须位于当前仓库内部。
- Get Latest 先 Fetch；可安全快进时自动更新，历史分叉时先询问 Merge 或 Rebase，不会擅自改写历史。
- 丢弃已跟踪文件改动前必须确认；P4Git 不会删除未跟踪文件。

## 本地开发

```bash
npm install
npm run dev
```

执行验证并生成 Windows 安装包：

```bash
npm run build
npm run dist:win
```

Windows 构建会在 `release/` 中生成 NSIS 安装版和便携版。参与开发前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 当前状态

版本 **0.8.0** 按 P4V 对齐文件状态徽标与页签管理，在 Submitted 详情中加入上一版本 Diff，并让 Submitted 路径筛选保持当前页签、不再意外跳转。

## 协议

[MIT](LICENSE) © 2026 P4Git contributors。

P4Git 是独立开源项目，与 Perforce Software, Inc. 无隶属或背书关系。P4V 和 Perforce 是其各自所有者的商标。
