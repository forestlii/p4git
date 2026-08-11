[English](user-guide.md) | [简体中文](user-guide.zh-CN.md)

# User Guide

## P4V-Style Layout

P4Git deliberately follows the P4V desktop structure instead of a conventional Git-client dashboard:

- **Native menu** — File, Edit, Search, View, Actions, Connection, Tools, Window, and Help.
- **Action toolbar** — Refresh, Get Latest, Submit, Checkout, Add, Delete, Revert, Diff, Timelapse, Revgraph, and Cancel.
- **Location bar** — the validated Git repository root and selected workspace directory.
- **Workspace pane** — a collapsible folder tree on the left, under the Depot/Workspace tabs.
- **Main tabs** — Files, Pending, Submitted, Stream Graph, and Workspaces.
- **Details pane** — Details, Files, Jobs, and Diff Summary below the main table.
- **Log and status bar** — executed operations, results, current path, upstream, and readiness.

Timelapse and Cancel are visible for layout and workflow continuity but are disabled in 0.1. Revgraph opens the Git branch view in **Stream Graph**.

## Git Mapping

P4Git keeps P4V action names while using Git underneath:

| P4Git / P4V action | Git operation |
|---|---|
| Refresh | Re-read `git status`, history, branches, and the current directory |
| Get Latest | `git pull --ff-only` |
| Checkout | Stage a selected tracked modification with `git add` |
| Add | Stage a selected untracked file with `git add` |
| Delete | Stage a deletion already detected by Git |
| Revert | Restore an unstaged tracked file after confirmation |
| Submit | Create a local Git commit from Ready to submit |
| Connection > Fetch | `git fetch --all --prune` |
| Connection > Push | Push the current branch and create its upstream when needed |

**Checkout does not lock a file and does not run `git checkout`.** Git allows normal editing without opening a file first; in P4Git the action means “include this tracked edit in the next submit.”

## Workspace and Files

Expand folders in the left **Workspace** tree and select a folder to display its children in **Files**. Double-click a folder to open it. A file that has a Git change shows its action in the table; double-clicking that changed file opens its diff.

The location bar and bottom status bar always show which local directory is being viewed. The `.git` administration directory is never exposed in the tree.

## Pending Changelists

P4Git maps the Git index to two P4V-style changelists:

- **Default changelist** contains unstaged and untracked working-tree changes.
- **Ready to submit** contains staged changes from the Git index.

A partially staged file can appear in both groups because the staged and working-tree versions have different diffs. Status marks are `M` (modified), `A` (added), `D` (deleted), `R` (renamed), `C` (copied), `?` (untracked), and `!` (conflicted).

There are two ways to move a file to **Ready to submit**:

1. Select it and use **Checkout**, **Add**, or **Delete**, according to its action.
2. Drag it from **Default changelist** onto **Ready to submit**.

To remove a file from the next submit without discarding its content, drag it from **Ready to submit** back to **Default changelist**. This unstages the Git index entry.

## Diff and Revert

Double-click a pending file or select it and choose **Diff**. The matching staged or unstaged diff appears under **Diff Summary**. Untracked text files appear as all-new content; binary files and untracked files over 2 MB are not previewed.

For an unstaged tracked file, **Revert** restores the working-tree content after confirmation. P4Git cannot undo this operation. Revert is unavailable for untracked files, so P4Git never deletes them implicitly.

## Submit Changelist

1. Move the intended files into **Ready to submit**.
2. Choose **Submit** from the toolbar or Actions menu.
3. Review the complete file list in the Submit Changelist window.
4. Enter a non-empty description and select **Submit**.

Conflicted files disable submission. The result is a local Git commit; it is not pushed automatically. Git hooks and repository commit policies still run because P4Git invokes the configured Git executable.

## Submitted

The **Submitted** table shows up to 100 recent Git commits using P4V-style columns: Change, Date Submitted, Submitted By, and Description. Selecting a row displays its full hash, author, date, and subject in **Details**.

Per-commit file lists, cherry-pick, reset, and interactive rebase are not included in 0.1.

## Stream Graph

**Stream Graph** maps Git branches into the P4V navigation position. It lists local and remote branches, marks the current branch, creates a local branch from `HEAD`, and switches between existing local branches. Remote branches are read-only in 0.1.

Git blocks a switch that would overwrite local changes; P4Git displays that error and never forces the operation.

## Workspaces

The **Workspaces** tab lists the last workspace and up to eight recent repositories. Double-click a row to open it. Use **File > Open Workspace** to browse for another existing Git repository.

Use **Tools > Git Settings** to select Git for Windows or the `git.exe` bundled with UGit. P4Git verifies the executable with `git --version` before saving it.

## Remote Synchronization

- **Get Latest** uses fast-forward-only pull. If local and remote histories diverge, choose an appropriate merge or rebase outside P4Git 0.1.
- **Connection > Fetch** updates remote-tracking refs without changing local files.
- **Connection > Push** runs a normal push, or pushes to `origin` and sets upstream for a new local branch.

Terminal prompts are disabled. HTTPS credentials must already be available through Git Credential Manager, and SSH authentication must already work through the configured key or agent.

## Operations Deliberately Not Automated

P4Git 0.1 does not silently merge, rebase, delete untracked files, discard staged content, resolve conflicts, bypass Git hooks, or emulate Perforce file locking. These operations require context that the client should not guess.
