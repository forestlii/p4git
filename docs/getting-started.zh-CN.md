[English](getting-started.md) | [简体中文](getting-started.zh-CN.md)

# 安装与首次运行

本指南帮助你从下载 P4Git 开始，完成第一次本地提交。

## 前置条件

- Windows 10 或更高版本，x64
- Git 2.23 或更高版本
- 一个已经存在的本地 Git 仓库
- 如果仓库需要身份验证，Git 中应当已经配置好可用凭据

P4Git 不捆绑 Git。它可以使用 Git for Windows，也可以使用其他桌面客户端提供的兼容 `git.exe`。

## 选择版本

| 版本 | 适用场景 | 行为 |
|---|---|---|
| `P4Git-Setup-<version>-x64.exe` | 长期日常使用 | 按当前用户安装，可创建开始菜单/桌面快捷方式，并提供标准卸载入口 |
| `P4Git-Portable-<version>-x64.exe` | 试用或没有安装权限的电脑 | 无需安装即可运行，不再使用时删除可执行文件即可 |

两种版本都会在当前 Windows 用户目录中保存应用设置，包括所选 Git 路径和最近仓库。“便携版”指部署方式，不表示完全不留下用户设置。

## Windows 安全提示

当前发布的二进制文件尚未代码签名。Windows 可能显示“未知发布者”或“Windows 已保护你的电脑”。

如果文件来自官方 [P4Git Releases](https://github.com/forestlii/p4git/releases) 页面：

1. 核对文件名和版本是否与 Release 一致。
2. 在 SmartScreen 对话框中点击“更多信息”。
3. 仅在确认来源和校验值可信后选择“仍要运行”。

后续分发计划会加入代码签名。签名用于证明发布者身份和文件完整性，但签名本身并不等于软件绝对安全。

## 配置 Git

P4Git 启动时会依次检查：

1. `PATH` 中是否有 `git`。
2. `Program Files` 下的标准 Git for Windows 安装。
3. `LocalAppData` 下的当前用户 Git for Windows 安装。
4. 之前在 P4Git 中手动选择的 Git 可执行文件。

如果没有找到 Git，请点击 **选择 git.exe**，浏览到兼容的可执行文件。使用 UGit 或其他客户端时，可以选择该应用实际使用的 `git.exe`。P4Git 会先运行 `git --version` 验证文件，再保存路径。

## 打开第一个工作区

1. 点击 **打开 Git 工作区**。
2. 选择一个已有 Git 仓库的根目录，或仓库内部任意目录。
3. P4Git 会解析仓库根目录，并显示当前分支、upstream、远程地址和文件改动。
4. 仓库会加入 **最近工作区**，下次可以快速打开。

## 创建第一次提交

1. 打开 **Pending**；可以先点击 **New Changelist...**，为当前任务创建一个列表。
2. 把文件拖入该列表，或通过文件右键的 **Move to Changelist** 归组。
3. 双击文件或点击 **Diff**，在底部 Diff Summary 面板审阅差异。
4. 右键目标列表选择 **Submit Changelist**，检查准确的文件清单、填写说明并提交。

这一步只创建本地 Git commit，不会自动 Push。确认需要发布到远程后，使用 **Connection > Push**。

## 下一步

- 阅读[使用指南](user-guide.zh-CN.md)，了解所有工作区操作。
- 如果 Git、凭据或 Pull 行为有问题，请查看[故障排查](troubleshooting.zh-CN.md)。
