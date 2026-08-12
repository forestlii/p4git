[English](README.md) | [简体中文](README.zh-CN.md)

# P4Git — A P4V-Inspired Desktop Client for Git

[![Build](https://github.com/forestlii/p4git/actions/workflows/build.yml/badge.svg)](https://github.com/forestlii/p4git/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0c8b87.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/forestlii/p4git?include_prereleases&color=3273a8)](https://github.com/forestlii/p4git/releases)

P4Git gives Git teams a workspace-oriented desktop workflow inspired by P4V. It keeps your existing GitLab, GitHub, or self-hosted Git server and presents daily work as clear changelists, file diffs, history, branches, and explicit sync operations.

![Windows](https://img.shields.io/badge/Windows-10%2B-1b5e9e) ![Git](https://img.shields.io/badge/Git-2.23%2B-f05032) ![Version](https://img.shields.io/badge/version-0.8.0-0c8b87)

## Highlights

| Area | What P4Git provides |
|---|---|
| P4V layout | Native menu, large action toolbar, Workspace tree, tabbed tables, details, Log, and status bar |
| Depot | Browse the committed tree of an upstream, HEAD, local branch, or remote branch |
| Workspace | Browse every local file with P4V-style sync, action, conflict, and LFS-lock badges |
| Changelists | Create persistent local named changelists, move files in batches, and preserve each group's expanded/collapsed state |
| Shelve | Store a changelist as a local Git stash and restore its file assignments on Unshelve |
| Review | Read staged, unstaged, and untracked text diffs before changing the index |
| History | Open a P4V-style History tab for any file or folder, inspect revisions, restore one, or diff it against Previous/HEAD |
| External Diff | Configure Beyond Compare or another executable; file comparisons use it automatically with a built-in fallback |
| Submit | P4V-strict delivery: Fetch, commit, Rebase/Resolve when needed, Push, and verify the exact server ref before reporting success |
| Submitted | Browse path-linked commits; detail files compare against their previous revision or local Workspace |
| Revision / Stream Graph | Render a multi-lane graph from real Git parent relationships, resize the branch pane, and find refs with fuzzy name filtering |
| Selective branch merge | Inspect commit details and changed files, then apply selected commits into a new local Changelist without creating a Git commit |
| Resolve | Resolve individual conflict blocks, edit the merged result, choose whole-file sides, or launch a configured external 3-way merge tool |
| Get Revision | Resolve a branch, tag, hash, or date, preview its commit/files, and restore one or more workspace targets |
| Git LFS locks | Inspect, create, batch unlock, and force-unlock remote Git LFS locks |
| Custom workspace | Drag pane dividers and file columns; select classic/light/dark themes, density, text size, and toolbar labels |
| Task progress | See immediate Fetch activity in the footer and inspect/cancel running Git work in the task center |
| GitLab | Store PATs with OS encryption, view merge requests, pipelines, and issues, and create MRs |
| Navigation | Closable View-managed tabs, linked Workspace/History/Submitted selection, persistent per-tab filters, bookmarks, and sortable columns |
| Sync | Safe Get Latest with automatic fast-forward and explicit Merge/Rebase choice for diverged branches |
| Push / Remotes | Manage remotes, select a target ref, and preview outgoing commits before Push |
| Git discovery | Detect Git for Windows or select the `git.exe` bundled with another client such as UGit |

## Download

Download the latest files from [GitHub Releases](https://github.com/forestlii/p4git/releases/latest):

- **Setup** — installs P4Git, creates shortcuts, and adds an uninstaller.
- **Portable** — runs directly without installation; useful for evaluation or restricted machines.

SHA-256 checksums are published in [SHA256SUMS.txt](SHA256SUMS.txt) and attached to the release.

The current binaries are not code-signed. Windows may show an **Unknown publisher** or Microsoft Defender SmartScreen warning. See [Installation and first run](docs/getting-started.md) before distributing P4Git across a team.

## Quick Start

1. Install P4Git or run the portable executable.
2. Confirm that P4Git finds Git. If it does not, choose a Git for Windows or UGit `git.exe`.
3. Open an existing Git workspace, or use **File > Clone Repository / Init Repository**.
4. Open **Pending**. Create named changelists as needed, then drag files or use their context menu to organize the work.
5. Right-click a changelist and choose **Submit Changelist**, or move files to **Ready to submit** and choose **Submit**.
6. Use **Get Latest** and the **Connection** menu to pull, fetch, or push.

## Documentation

Full documentation lives in [docs/](docs/README.md):

- [Installation and first run](docs/getting-started.md)
- [User guide](docs/user-guide.md)
- [P4V-to-Git operation map](docs/p4v-git-operation-map.md)
- [Troubleshooting](docs/troubleshooting.md)

## Requirements

- Windows 10 or newer, x64
- Git 2.23 or newer
- Existing Git credentials for authenticated fetch/pull/push operations
- A GitLab URL and usually a Personal Access Token with `api` scope for private-project integration

## Safety Model

- The React renderer has no Node.js access; it talks to Electron through a typed IPC allowlist.
- Git is invoked with argument arrays through `execFile`, never through a command shell.
- File operations are restricted to paths inside the selected repository.
- Get Latest fetches first, fast-forwards when safe, and asks before Merge or Rebase when histories diverge.
- Discarding tracked working-tree changes requires confirmation; untracked files are never deleted by P4Git.

## Development

```bash
npm install
npm run dev
```

Validation and Windows packaging:

```bash
npm run build
npm run dist:win
```

The Windows build produces an NSIS installer and a portable executable in `release/`. See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.

## Status

Version **0.8.0** aligns file-state badges and tab management with P4V, adds previous-revision Diff inside Submitted details, and keeps Submitted path filtering in place without unexpected tab switches.

## License

[MIT](LICENSE) © 2026 P4Git contributors.

P4Git is an independent open-source project and is not affiliated with or endorsed by Perforce Software, Inc. P4V and Perforce are trademarks of their respective owner.
