[English](README.md) | [简体中文](README.zh-CN.md)

# P4Git Documentation

P4Git is a Windows desktop client that applies a P4V-style workspace and changelist model to existing Git repositories.

## Start Here

- [Installation and first run](getting-started.md) — choose a package, configure Git, and open the first workspace.
- [User guide](user-guide.md) — changes, diffs, commits, history, branches, and remote synchronization.
- [Troubleshooting](troubleshooting.md) — Git discovery, credentials, pull failures, identity, and Windows warnings.

## Concepts

| P4Git label | Git meaning |
|---|---|
| Workspace | Local Git working tree |
| Default changelist | Unstaged and untracked working-tree changes |
| Ready to submit | Staged changes in the Git index |
| Submit changes | Create a local Git commit |
| Fetch | Download remote refs without modifying the working tree |
| Pull | Fast-forward the current branch from its upstream |
| Push | Upload local commits to the upstream remote |

## Current Scope

P4Git 0.1 operates on existing repositories and delegates authentication, credential storage, hooks, filters, and network protocols to the selected Git executable. It deliberately does not implement clone, merge/rebase UI, a credential dialog, conflict editing, or untracked-file deletion yet.

## Source Layout

```text
src/main/       Electron main process, Git service, settings, native dialogs
src/preload/    Typed contextBridge API
src/renderer/   React desktop interface
src/shared/     Shared IPC and domain types
```
