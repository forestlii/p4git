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

**Timelapse** uses Git blame for line-level history. **Revgraph** opens the Git branch view in **Stream Graph**. **Cancel** remains disabled only because the current synchronous Git operations cannot yet be cancelled safely.

## Git Mapping

P4Git keeps P4V action names while using Git underneath:

| P4Git / P4V action | Git operation |
|---|---|
| Refresh | Re-read `git status`, history, branches, and the current directory |
| Get Latest | `git pull --ff-only` |
| Checkout | Move a tracked Workspace edit to Ready to submit; or retrieve a selected Depot revision and make it ready to submit; clean Git files require no lock |
| Add | Stage a selected untracked file with `git add` |
| Delete | Remove a tracked file with `git rm` and stage the deletion |
| Revert | Restore both the index and working copy to `HEAD`; an added file remains on disk |
| Diff | Compare the worktree, index, selected Depot ref, or a submitted commit |
| Timelapse | Show per-line author, commit, and date using `git blame --line-porcelain` |
| Revgraph | Open the Git branch mapping in Stream Graph |
| Submit | Create a local Git commit from Ready to submit |
| Connection > Fetch | `git fetch --all --prune` |
| Connection > Push | Push the current branch and create its upstream when needed |

**Checkout does not emulate a Perforce exclusive lock and does not switch Git branches.** For an edited Workspace file it includes the file in the next submit; for a clean file it records that no Git lock is needed; from Depot it restores the selected branch revision into the Workspace and includes it in the next submit. **Checkout and Open** also launches the file through its Windows association.

## Depot and Workspace

P4V defines Depot as the server-side version repository and Workspace as the local working copy. P4Git uses the closest Git mapping:

- **Depot** shows the committed tree of a selected upstream, `HEAD`, local branch, or remote branch. It excludes untracked files.
- **Workspace** shows the real on-disk tree, including tracked, modified, and untracked files.
- The Depot selector changes the Git ref being browsed. Depot context menus provide Get Latest Revision, Checkout, Diff, File History, Time-lapse, and Show in Workspace Tree.
- Workspace context menus provide Checkout, Add, Delete, Revert, Diff, File History, Time-lapse, Explorer reveal, and Show in Depot Tree.

## Workspace and Files

Expand folders in the left **Workspace** tree and select a folder to display its children in **Files**. Double-click a folder to open it. A file that has a Git change shows its action in the table; double-clicking that changed file opens its diff.

The location bar and bottom status bar always show which local directory is being viewed. The `.git` administration directory is never exposed in the tree.

## Pending Changelists

P4Git adds a repository-local changelist layer on top of Git:

- **Ready to submit** is the real Git index and contains staged changes.
- **Default changelist** contains unstaged or untracked changes that have not been assigned to a named list.
- **Named changelists** are persistent local groups for a task, feature, or fix. They may be empty and include an optional description.

Choose **New Changelist...** in Pending or **Actions > New Changelist...** to create a list. Use `Ctrl`, `Shift`, or `Ctrl+A` to select multiple pending files, then drag them onto a group or right-click and use **Move to Changelist**. The submenu's **New Changelist...** command creates a list and immediately moves the entire selection into it. Right-click a named list to submit, edit, delete, or move all of its files to Ready. Deleting a list never deletes files: its assigned changes return to **Default changelist**.

Named-list assignments are stored inside the current repository at `.git/p4git/changelists.json`. They survive application restarts, remain local to that clone, and cannot enter a Git commit. Renames and descriptions are saved there as well.

Moving a file to **Ready to submit** stages it. Moving a staged file to Default or a named list unstages it without discarding working-copy content. A partially staged file can appear in Ready and a local list because the staged and working-tree versions have different diffs. Status marks are `M` (modified), `A` (added), `D` (deleted), `R` (renamed), `C` (copied), `?` (untracked), and `!` (conflicted).

## Diff and Revert

Double-click a pending file or select it and choose **Diff**. The matching staged or unstaged diff appears under **Diff Summary**. Untracked text files appear as all-new content; binary files and untracked files over 2 MB are not previewed.

After confirmation, **Revert** restores both the index and working-tree content of a tracked file. P4Git cannot undo this operation. A newly added file is unstaged but remains on disk. A never-added untracked file cannot be reverted, so P4Git never deletes it implicitly.

### External Diff tool

Open **Tools > Preferences...** to configure Beyond Compare or another comparison executable. Browse to the program and edit the argument template if necessary. P4Git's Beyond Compare default is:

```text
/solo /readonly /lefttitle={leftTitle} /righttitle={rightTitle} "{left}" "{right}"
```

The template must contain `{left}` and `{right}`; optional `{leftTitle}` and `{rightTitle}` placeholders provide readable pane names. Arguments are passed directly to the executable without a command shell.

Once configured, file-level Diff actions automatically use the external tool for HEAD/Workspace, index/Workspace, HEAD/index, Depot-ref/Workspace, and History Previous/HEAD comparisons. P4Git creates temporary read-only comparison copies, preserving binary data, and removes stale copies after 24 hours. Folder-history diffs and whole-commit diffs remain in the built-in Diff Summary. If the configured program is missing or cannot launch, P4Git reports the problem and falls back to the built-in viewer. Choose **Disable** in Preferences to return to the built-in viewer for all comparisons.

## Submit Changelist

1. Right-click a named or Default changelist and choose **Submit Changelist**. You can also submit **Ready to submit** from the toolbar or Actions menu.
2. For a local list, P4Git prepares the Git index with only that list's files; changes in every other list remain in the working tree.
3. Review the exact file list in the Submit Changelist window.
4. Enter a non-empty description and select **Submit**. A named list's description is used as the initial commit message when the field is empty.

After a successful commit, assignments for committed paths are removed. The named changelist itself remains available for later work until you delete it.

Conflicted files disable submission. The result is a local Git commit; it is not pushed automatically. Git hooks and repository commit policies still run because P4Git invokes the configured Git executable.

## Submitted

The **Submitted** table shows up to 100 recent Git commits using P4V-style columns: Change, Date Submitted, Submitted By, and Description. Selecting a row displays its full hash, author, date, and subject in **Details**.

Right-click a commit to view its changed-file list, open its full diff against the previous revision, copy its complete hash, Cherry-pick it, create a branch or tag, or reset the current branch. Interactive rebase is not yet included.

## History

Select a file or folder in Depot or Workspace and choose **File History** from its context menu, or use **View > History** for the current selection. P4Git opens a persistent **History** tab linked to that path rather than a temporary dialog.

The table lists Git revisions with an approximate file revision number, commit hash, date, author, and description. Select a revision to inspect its commit details in the lower pane. Double-click to diff it against its previous revision. The revision context menu also provides **Get This Revision**, **Diff Against Previous Revision**, **Diff Against Head**, **View Submitted Change**, and **Copy Commit Hash**. Getting a revision changes only the selected workspace path and asks for confirmation first.

## Stream Graph

**Stream Graph** maps Git branches into the P4V navigation position. It lists local and remote branches, marks the current branch, creates branches, and switches between existing local branches. Right-click a branch to switch or create a new branch from that exact starting point. Remote branches are read-only but may be used as a new local branch's starting point.

## Native Context Menus

P4Git follows P4V's object-context strategy with native menus. Trees, Files, Pending files, Submitted commits, branches, Workspaces, and Log expose only relevant operations. Inapplicable operations are disabled instead of acting as dead placeholders.

## Git-Native Features

Purely Git-native features are grouped under **Tools > Git** to preserve P4V's menu structure. Contextual entry points also appear under a **Git** submenu in native object menus:

- **Tools > Git** — Stash Changes, Pop Latest Stash, View Stashes, View Reflog, Merge, Rebase, Create Tag, and Abort Merge/Rebase/Cherry-pick.
- **Workspace / Pending files** — Stage, Unstage, and stash only the selected file or directory.
- **Submitted commits** — Cherry-pick, create a branch, create a lightweight tag, and Soft/Mixed/Hard Reset.
- **Branches** — merge into the current branch, rebase the current branch onto the selection, create a tag, and safely delete a merged local branch.
- **Workspaces** — Fetch, Pull, Push, Stash, and inspect Stashes or Reflog for the selected repository.

If Merge, Rebase, or Cherry-pick encounters conflicts, Git keeps the operation in progress for resolution. Use **Tools > Git > Abort Operation** to stop it explicitly. Hard Reset and Drop Stash require typed confirmation; P4Git never runs these irreversible operations silently.

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
