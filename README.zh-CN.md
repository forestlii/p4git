[English](README.md) | [简体中文](README.zh-CN.md)

# P4Git — 受 P4V 启发的 Git 桌面客户端

[![Build](https://github.com/forestlii/p4git/actions/workflows/build.yml/badge.svg)](https://github.com/forestlii/p4git/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0c8b87.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/forestlii/p4git?include_prereleases&color=3273a8)](https://github.com/forestlii/p4git/releases)

P4Git 为 Git 团队提供一种接近 P4V 的工作区操作方式。它不要求迁移服务端，可以继续使用现有的 GitLab、GitHub 或自建 Git，通过清晰的变更列表、文件差异、历史、分支和同步操作完成日常版本管理。

![Windows](https://img.shields.io/badge/Windows-10%2B-1b5e9e) ![Git](https://img.shields.io/badge/Git-2.23%2B-f05032) ![Version](https://img.shields.io/badge/version-0.1.0-0c8b87)

## 核心能力

| 模块 | P4Git 提供什么 |
|---|---|
| 工作区 | 打开任意已有 Git 仓库，并快速返回最近使用的工作区 |
| 变更列表 | 将 **Ready to submit**（已暂存）与 **Default changelist**（工作区）明确分开 |
| 审阅 | 在修改索引前查看已暂存、未暂存和未跟踪文件的文本差异 |
| 提交 | 暂存、取消暂存、暂存全部，检查说明并创建本地提交 |
| 历史 | 浏览最近提交、作者、引用和哈希 |
| 分支 | 查看本地和远程分支，新建分支或切换本地分支 |
| 同步 | Fetch、仅快进 Pull，以及自动设置 upstream 的 Push |
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
3. 点击 **打开 Git 工作区**，选择已有本地仓库。
4. 在 **Default changelist** 审阅文件，将需要提交的文件暂存，填写说明并提交。
5. 使用 **Fetch**、**Pull**、**Push** 与已配置的远程仓库同步。

## 文档

完整中英文文档位于 [docs/](docs/README.zh-CN.md)：

- [安装与首次运行](docs/getting-started.zh-CN.md)
- [使用指南](docs/user-guide.zh-CN.md)
- [故障排查](docs/troubleshooting.zh-CN.md)

## 环境要求

- Windows 10 或更高版本，x64
- Git 2.23 或更高版本
- 0.1 版本需要选择一个已经存在的本地 Git 仓库
- Fetch、Pull、Push 需要 Git 已经配置好对应服务端凭据

## 安全设计

- React 页面没有 Node.js 权限，只能通过类型化 IPC 白名单访问 Electron。
- Git 命令通过 `execFile` 参数数组执行，不经过命令行 shell。
- 文件操作会校验路径必须位于当前仓库内部。
- Pull 固定使用 `--ff-only`，避免客户端在用户不知情时制造合并提交。
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

版本 **0.1.0** 是以 Windows 为首要平台的初始版本。仓库克隆、凭据交互、冲突解决、按区块暂存、Git LFS 锁和 GitLab Merge Request 集成仍在规划中。

## 协议

[MIT](LICENSE) © 2026 P4Git contributors。

P4Git 是独立开源项目，与 Perforce Software, Inc. 无隶属或背书关系。P4V 和 Perforce 是其各自所有者的商标。
