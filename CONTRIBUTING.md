# Contributing

感谢参与 P4Git。

1. 从 `main` 创建功能分支。
2. 保持主进程 IPC 接口最小化，不要向 renderer 暴露 Node.js 或任意命令执行能力。
3. 新增 Git 输出解析时补充单元测试。
4. 提交前运行 `npm run build`。

Bug 报告请包含操作系统、P4Git 版本、Git 版本、复现步骤和脱敏后的错误信息。请勿提交访问令牌、私钥、仓库凭据或公司源代码。
