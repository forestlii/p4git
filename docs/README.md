[English](README.md) | [简体中文](README.zh-CN.md)

# P4Git Documentation

P4Git is a Windows desktop client that applies a P4V-style workspace and changelist model to existing Git repositories.

## Start Here

- [Installation and first run](getting-started.md) — choose a package, configure Git, and open the first workspace.
- [User guide](user-guide.md) — changes, diffs, commits, history, branches, and remote synchronization.
- [P4V-to-Git operation map](p4v-git-operation-map.md) — implemented mappings, non-equivalents, and Git-native candidates.
- [Troubleshooting](troubleshooting.md) — Git discovery, credentials, pull failures, identity, and Windows warnings.

## Concepts

| P4Git label | Git meaning |
|---|---|
| Depot | Committed file tree from the selected Git ref |
| Workspace | Local Git working tree |
| Default changelist | Unstaged and untracked working-tree changes |
| Named changelist | Persistent local grouping stored under `.git/p4git`; not synchronized |
| Ready to submit | Staged changes in the Git index |
| Submit changes | Deliver and verify a commit on the tracked server branch |
| Fetch | Download remote refs without modifying the working tree |
| Pull | Fast-forward the current branch from its upstream |
| Push | Upload local commits to the upstream remote |

## Current Scope

P4Git can open, clone, or initialize repositories. It delegates Git transport authentication, Git credentials, hooks, filters, and protocols to the selected Git executable. GitLab API tokens are stored separately with operating-system encryption, and untracked files are never deleted implicitly.

## Source Layout

```text
src/main/       Electron main process, Git service, settings, native dialogs
src/preload/    Typed contextBridge API
src/renderer/   React desktop interface
src/shared/     Shared IPC and domain types
```
