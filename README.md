# P4Git

P4Git 是一款受 P4V 工作流启发的 Git 桌面客户端。它保留现有的 GitLab、GitHub 或自建 Git 服务端，用 changelist、文件差异和明确的同步操作，让团队成员更直观地处理日常版本控制。

> P4Git 是独立开源项目，与 Perforce Software, Inc. 无隶属或背书关系。P4V 和 Perforce 是其各自所有者的商标。

## 当前能力

- 打开任意本地 Git 仓库，并记住最近工作区
- 按“Ready to submit / Default changelist”区分已暂存和未暂存文件
- 查看已暂存、未暂存和未跟踪文件的文本差异
- 暂存、取消暂存、暂存全部，以及确认后丢弃已跟踪文件的改动
- 编写提交说明并创建本地 commit
- 查看最近提交历史、引用和作者信息
- 查看本地/远程分支，创建或切换本地分支
- Fetch、仅 fast-forward 的 Pull，以及自动设置 upstream 的 Push
- 自动查找 Git for Windows，也可以手动选择 UGit 内置的 `git.exe`
- Electron 渲染进程隔离、严格 IPC 白名单和无 shell 的 Git 参数调用

## 安装和分发

P4Git 当前以 Windows x64 为首要目标，支持 Windows 10 及以上版本。运行时需要可用的 Git；如果团队电脑只安装了 UGit，可以在欢迎页选择它使用的 `git.exe`。

从源码构建：

```bash
npm install
npm run dist:win
```

产物会生成在 `release/`：

- `P4Git-Setup-<version>-x64.exe`：NSIS 安装程序
- `P4Git-Portable-<version>-x64.exe`：便携版

正式分发前建议购买 Windows 代码签名证书并在 CI 中配置签名。未签名安装包可能触发 Microsoft Defender SmartScreen 提示。

## 本地开发

要求 Node.js 22+ 和 npm。

```bash
npm install
npm run dev
```

质量检查：

```bash
npm run typecheck
npm test
npm run build
```

## 架构

```text
React renderer (无 Node 权限)
          │ typed IPC whitelist
Electron preload (contextBridge)
          │
Electron main process
          ├── GitService → git.exe（execFile，无 shell）
          ├── SettingsStore
          └── native dialogs / Explorer
```

Git 命令始终使用参数数组执行，文件路径会校验为当前仓库内的相对路径。Pull 使用 `--ff-only`，避免客户端在用户不知情时制造 merge commit；丢弃工作区改动必须在界面中确认。

## 路线图

- 提交详情与逐块暂存
- 冲突解决器和三方合并视图
- Git LFS 锁定工作流
- GitLab Merge Request / CI 状态集成
- 多仓库工作区和子模块视图
- macOS、Linux 安装包与自动更新

欢迎通过 Issue 和 Pull Request 参与。项目采用 [MIT License](LICENSE)。
