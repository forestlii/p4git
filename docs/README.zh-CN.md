[English](README.md) | [简体中文](README.zh-CN.md)

# P4Git 文档

P4Git 是一款 Windows 桌面客户端，它将接近 P4V 的工作区与变更列表模型应用到现有 Git 仓库。

## 从这里开始

- [安装与首次运行](getting-started.zh-CN.md)——选择版本、配置 Git，并打开第一个工作区。
- [使用指南](user-guide.zh-CN.md)——变更、差异、提交、历史、分支和远程同步。
- [故障排查](troubleshooting.zh-CN.md)——Git 发现、凭据、Pull 失败、提交身份和 Windows 警告。

## 概念对应

| P4Git 界面 | 对应的 Git 概念 |
|---|---|
| 工作区 | 本地 Git 工作树 |
| Default changelist | 未暂存和未跟踪的工作区改动 |
| Ready to submit | Git 索引中已暂存的改动 |
| 提交变更 | 创建本地 Git commit |
| Fetch | 下载远程引用，不修改工作区 |
| Pull | 从 upstream 快进当前分支 |
| Push | 将本地提交上传到 upstream |

## 当前范围

P4Git 0.1 操作已经存在的仓库，并将身份验证、凭据存储、Hooks、Filters 和网络协议交给所选的 Git 可执行程序处理。目前暂不提供 Clone、Merge/Rebase 界面、凭据弹窗、冲突编辑器和未跟踪文件删除功能。

## 源码结构

```text
src/main/       Electron 主进程、Git 服务、设置与原生对话框
src/preload/    类型化 contextBridge API
src/renderer/   React 桌面界面
src/shared/     IPC 与领域共享类型
```
