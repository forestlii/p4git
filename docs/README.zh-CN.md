[English](README.md) | [简体中文](README.zh-CN.md)

# P4Git 文档

P4Git 是一款 Windows 桌面客户端，它将接近 P4V 的工作区与变更列表模型应用到现有 Git 仓库。

## 从这里开始

- [安装与首次运行](getting-started.zh-CN.md)——选择版本、配置 Git，并打开第一个工作区。
- [使用指南](user-guide.zh-CN.md)——变更、差异、提交、历史、分支和远程同步。
- [P4V 与 Git 操作映射](p4v-git-operation-map.zh-CN.md)——已实现能力、不等价能力与 Git 特有功能候选。
- [故障排查](troubleshooting.zh-CN.md)——Git 发现、凭据、Pull 失败、提交身份和 Windows 警告。

## 概念对应

| P4Git 界面 | 对应的 Git 概念 |
|---|---|
| Depot | 所选 Git 引用中的已提交文件树 |
| 工作区 | 本地 Git 工作树 |
| Default changelist | 未暂存和未跟踪的工作区改动 |
| 命名 Changelist | 保存在 `.git/p4git` 中的本地持久分组，不参与同步 |
| Ready to submit | Git 索引中已暂存的改动 |
| 提交变更 | 创建本地 Git commit |
| Fetch | 下载远程引用，不修改工作区 |
| Pull | 从 upstream 快进当前分支 |
| Push | 将本地提交上传到 upstream |

## 当前范围

P4Git 可以打开、Clone 或 Init 仓库，并将 Git 网络身份验证、Git 凭据、Hooks、Filters 和协议处理交给所选的 Git 可执行程序。GitLab API Token 由 P4Git 使用系统加密单独保存；未跟踪文件仍不会被隐式删除。

## 源码结构

```text
src/main/       Electron 主进程、Git 服务、设置与原生对话框
src/preload/    类型化 contextBridge API
src/renderer/   React 桌面界面
src/shared/     IPC 与领域共享类型
```
