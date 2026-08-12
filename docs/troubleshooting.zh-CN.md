[English](troubleshooting.md) | [简体中文](troubleshooting.zh-CN.md)

# 故障排查

## P4Git 找不到 Git

安装 Git for Windows，或者在欢迎页/设置按钮中选择兼容的 `git.exe`。验证失败时，可以手动运行候选文件的 `git --version`。`switch` 和 `restore` 要求 Git 2.23 或更高版本。

## 所选目录不是仓库

P4Git 使用 `git rev-parse --show-toplevel` 解析根目录。请选择已经 Clone 或 Init 的仓库内部目录，或使用 **File > Clone Repository / Init Repository**。

## Fetch、Pull 或 Push 提示身份验证失败

P4Git 设置了 `GIT_TERMINAL_PROMPT=0`，不会在后台弹出隐藏的终端输入提示。

- HTTPS：先使用 Git Credential Manager 或共享相同凭据配置的其他 Git 客户端完成一次登录。
- SSH：验证 `ssh -T git@<host>`，并确认密钥或 SSH Agent 可用。
- SSO：组织要求时，需要为对应凭据授权 SSO。

修改环境级凭据或 SSH Agent 配置后，请重启 P4Git。

## Get Latest 检测到分支分叉

P4Git 会先 Fetch，但不会立即修改本地历史；随后显示本地和远端各自独有的提交数量，并让你选择 **Merge**、**Rebase** 或 **Cancel**。Merge 保留双方历史，可能创建合并提交；Rebase 产生线性历史，但会改写本地提交 ID。如果工作区变更阻止操作，请先用 Changelist 整理，再 Stash 或 Submit。

## Commit 要求用户名或邮箱

为当前仓库配置提交身份：

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

只有当该身份需要应用于当前用户的全部仓库时，才添加 `--global`。

## Git Hook 拒绝提交

阅读 P4Git 显示的错误，修正文件或提交说明后重新提交。P4Git 不会使用 `--no-verify` 绕过 Hooks。

## 差异为空或被截断

- 二进制文件可能没有文本差异。
- CodeMirror 内置文本 Diff 每侧上限为 8 MB；超限文件请配置外部 Diff 工具。
- P4Git 最多显示 6,000 行差异。
- 同时存在已暂存和未暂存内容的文件有两份不同差异，请在正确的变更列表中选择它。

## Windows 显示“未知发布者”

当前二进制文件尚未代码签名。请只从官方 Release 页面下载，对比公开的 SHA-256 校验值，并遵循所在组织的软件安装规范。不要在系统中全局关闭 SmartScreen。

## 删除便携版后仍保留设置

便携版不执行安装，但 Electron 仍会在当前 Windows 用户目录中保存 P4Git 设置。只有确实需要清除最近仓库和所选 Git 路径时，才手动删除 P4Git 用户数据目录。

## 报告问题

在 [GitHub Issues](https://github.com/forestlii/p4git/issues) 中提供：

- P4Git 版本与安装包类型
- Windows 和 Git 版本
- 复现步骤
- 完整且已经脱敏的错误信息

不要附加 Token、私钥、凭据文件或公司私有仓库内容。
