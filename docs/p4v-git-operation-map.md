[English](p4v-git-operation-map.md) | [简体中文](p4v-git-operation-map.zh-CN.md)

# P4V-to-Git Operation Map

This document records how P4Git maps P4V operations to Git, which capabilities cannot be equivalent, and which Git-native features still need a product location.

## Design references

P4Git follows the official Perforce documentation for [P4V concepts](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/introduction.about.html), the [toolbar](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/using_toolbar.html), [navigation and context menus](https://help.perforce.com/helix-core/server-apps/p4v/2026.1/Content/P4V/using.navigating.html), [Get Latest](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/files.retrieve.html), [Submit](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/files.submit.html), [Revert](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/files.revert.html), and [Diff](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/diff-summary.html).

## Implemented mappings

| P4V concept or action | P4Git / Git strategy | Status |
|---|---|---|
| Depot | Committed tree from a selected upstream, `HEAD`, local branch, or remote branch | Implemented |
| Workspace | Git working tree on disk, including untracked files | Implemented |
| Refresh | Reload status, current tree, commit history, and branches | Implemented |
| Get Latest | Top level uses `git pull --ff-only`; Depot paths restore from the selected ref | Implemented |
| Checkout / Open for edit | `git add` an existing edit; restore and stage a Depot revision; clean files require no lock | Implemented, non-locking |
| Add | `git add` an untracked file | Implemented |
| Delete | `git rm`, or record a deletion already made on disk | Implemented |
| Revert | Restore both index and working tree from `HEAD`; a newly added file is only unstaged | Implemented, confirmed |
| Diff | Working tree, index, Depot ref, and commit diffs | Implemented, textual |
| External Diff tool | User-configured executable with argument templates; Beyond Compare defaults and built-in fallback | Implemented for file diffs |
| Time-lapse View | Per-line commit, author, and date through `git blame` | Implemented, simplified |
| Revision Graph / Stream Graph | List, create, and switch local/remote Git branches | Implemented, simplified |
| Pending changelist | Ready maps to the Git index; persistent repository-local named lists organize unstaged changes | Implemented locally |
| Submit | Create a local commit from the Git index without automatic Push | Implemented |
| Submitted | Git log with context actions for files, diff, and hash copy | Implemented |
| File / folder History | Persistent path-linked History tab backed by Git log, revision restore, and Previous/HEAD diff | Implemented |
| Workspaces | Recently opened local Git repositories | Implemented |
| Native context menus | Object-specific actions for Workspace, Depot, Pending, Submitted, branches, and more | Implemented |
| Log | Operation intent, success, and error output with a native Clear action | Implemented |

## P4V capabilities with no direct core-Git equivalent

These are not represented by misleading no-op behavior. They remain disabled or absent:

- Perforce opened-by state, exclusive Checkout, and server file locking. Git LFS locks are an optional approximation only.
- Server-numbered, shared changelists and server ownership state. P4Git supports multiple named local changelists, but their metadata is clone-local under `.git/p4git` and is not synchronized.
- Server-side Shelve / Unshelve semantics. Git stash is local by default and only an approximation.
- Jobs, Fixes, and submit association without GitLab Issues, GitHub Issues, or another server integration.
- Stream parent/child topology, Merge/Copy workflows, and Resolve. P4Git currently maps only the branch list.
- Centralized Labels. Git tags are similar, but their permissions and mutability differ.
- Workspace Views and client mappings. Git sparse-checkout can approximate only part of this model.
- Server administration such as permissions, users, protection tables, and Obliterate.
- Full P4V Time-lapse playback and rich Revision Graph. External tools are implemented for file diffs, but folder/commit-wide external comparison is not yet provided.
- **Cancel**: the current Git process wrapper does not yet expose a safe cancellation handle, so the control is visible but disabled.

## Git capabilities with no obvious P4V-core location

P4Git now applies the P4V-first placement policy: purely Git-native operations live under **Tools > Git** and in a contextual **Git** submenu on relevant objects. Implemented features are:

- Create/list/apply/pop/drop Stashes.
- Reflog viewing and hash copy.
- Merge, Rebase, Cherry-pick, and matching Abort operations.
- Soft/Mixed/Hard Reset, lightweight Tags, and branch creation from a commit/ref.
- File-level Stage, Unstage, and Stash; safe branch deletion; and per-Workspace Fetch/Pull/Push.

Still to be implemented:

- Clone, Init, remote management, and a dedicated prune UI.
- Amend and interactive Rebase.
- Submodules, worktrees, sparse-checkout, and `.gitignore` editing.
- Git LFS and LFS locks.
- GitLab Merge Requests / GitHub Pull Requests, CI status, and issue linking.
