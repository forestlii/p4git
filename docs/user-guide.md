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

**Timelapse** uses Git blame for line-level history. **Revgraph** opens a **Stream Graph** rendered from real commit-parent relationships. **Cancel** is enabled while a Git command is running and terminates the process tree started by P4Git.

The location field is editable and navigates on Enter; adjacent controls expose location history and bookmarks. Use the Workspace selector for recent repositories, click column headings to sort, and use the separate tree and table filters to narrow views. Files, History, Pending, Submitted, Stream Graph, and Workspaces can all be closed; checked entries under **View** restore them. P4Git remembers visible and active tabs, per-tab filters, scroll positions, and mounted view state. The last visible tab cannot be closed.

## Git Mapping

P4Git keeps P4V action names while using Git underneath:

| P4Git / P4V action | Git operation |
|---|---|
| Refresh | Re-read `git status`, history, branches, and the current directory |
| Get Latest | Fetch, automatic fast-forward, or an explicit Merge/Rebase choice when diverged |
| Checkout | Move a tracked Workspace edit to Ready to submit; or retrieve a selected Depot revision and make it ready to submit; clean Git files require no lock |
| Add | Stage a selected untracked file with `git add` |
| Delete | Remove a tracked file with `git rm` and stage the deletion |
| Revert | Restore tracked files to `HEAD`; delete selected added/untracked files only after an explicit warning |
| Diff | Compare the worktree, index, selected Depot ref, or a submitted commit |
| Timelapse | Show per-line author, commit, and date using `git blame --line-porcelain` |
| Revgraph | Open a multi-lane Revision/Stream Graph from commit parents and Git branches |
| Submit | Deliver Ready to submit to the tracked server branch and verify it |
| Connection > Fetch | `git fetch --all --prune` |
| Connection > Push | Push the current branch and create its upstream when needed |

**Checkout does not emulate a Perforce exclusive lock and does not switch Git branches.** For an edited Workspace file it includes the file in the next submit; for a clean file it records that no Git lock is needed; from Depot it restores the selected branch revision into the Workspace and includes it in the next submit. **Checkout and Open** also launches the file through its Windows association.

## Depot and Workspace

P4V defines Depot as the server-side version repository and Workspace as the local working copy. P4Git uses the closest Git mapping:

- **Depot** shows the committed tree of a selected upstream, `HEAD`, local branch, or remote branch. It excludes untracked files.
- **Workspace** shows the real on-disk tree, including tracked, modified, and untracked files.
- The Depot selector changes the Git ref being browsed. Depot context menus provide Get Latest Revision, Checkout, Diff, File History, Time-lapse, and Show in Workspace Tree.
- Workspace context menus provide Checkout, Add, Delete, Revert, Diff, File History, Time-lapse, Explorer reveal, and Show in Depot Tree.

The trees follow P4V's object-and-badge model: Depot folders are blue, Workspace folders are yellow, and files can carry more than one status badge. The badges distinguish synced-to-head, an older upstream revision, Workspace-only content, unstaged differences, your add/edit/delete/move/copy actions, files needing Resolve, and Git LFS locks owned by you or another user. Hover an icon for its full status. Red action badges describe your pending operations; P4Git does not fabricate other-user Perforce checkout state that Git cannot provide.

## Workspace and Files

Expand folders in the left **Workspace** tree and select a folder to display its children in **Files**. Double-click a folder to open it. A file that has a Git change shows its action in the table; double-clicking that changed file opens its diff. Selecting a Workspace file or folder immediately scopes **History** and **Submitted** to commits that touched that path, without changing the active main tab. Submitted clears stale rows while the new query runs and stays empty when the path has no commits. Select the Workspace root to return to the repository-wide log.

The location bar and bottom status bar always show which local directory is being viewed. The `.git` administration directory is never exposed in the tree.

## Pending Changelists

P4Git adds a repository-local changelist layer on top of Git:

- **Ready to submit** is the real Git index and contains staged changes.
- **Default changelist** contains unstaged or untracked changes that have not been assigned to a named list.
- **Named changelists** are persistent local groups for a task, feature, or fix. They may be empty and include an optional description.

Choose **New Changelist...** in Pending or **Actions > New Changelist...** to create a list. Use `Ctrl`, `Shift`, or `Ctrl+A` to select multiple pending files, then drag them onto a group or right-click and use **Move to Changelist**. **Diff Selected Files** opens every selected comparison: the built-in window provides a P4V-style file list and Previous/Next navigation, while a configured external Diff tool receives every file instead of only the focused row. The submenu's **New Changelist...** command creates a list and immediately moves the entire selection into it. Right-click a named list to submit, edit, delete, or move all of its files to Ready. Deleting a list never deletes files: its assigned changes return to **Default changelist**. Changelists start collapsed, and each repository's expanded groups are remembered across tab changes and application restarts.

Named-list assignments are stored inside the current repository at `.git/p4git/changelists.json`. They survive application restarts, remain local to that clone, and cannot enter a Git commit. Renames and descriptions are saved there as well.

Right-click a local changelist and choose **Shelve Changelist** to save its files in a local Git stash and clean them from the workspace. **Tools > Git > View Shelves** restores both the changes and their original changelist assignments. Shelves are clone-local and are not uploaded automatically.

Moving a file to **Ready to submit** stages it. Moving a staged file to Default or a named list unstages it without discarding working-copy content. A partially staged file can appear in Ready and a local list because the staged and working-tree versions have different diffs. Status marks are `M` (modified), `A` (added), `D` (deleted), `R` (renamed), `C` (copied), `?` (untracked), and `!` (conflicted).

## Diff and Revert

Double-click a pending file or select it and choose **Diff** to open the full left and right files in the MIT-licensed CodeMirror MergeView bundled offline with P4Git. It provides line numbers, side-by-side alignment, character-level highlights, synchronized scrolling, unchanged-section folding, long-line wrapping, `Ctrl+F` search, and Previous/Next Difference navigation. Built-in text comparison is limited to 8 MB per side; binary or oversized files show an explicit message and can use an external tool.

After confirmation, **Revert** restores both the index and working-tree content of tracked files. Selected added or untracked files are listed in a separate warning because Revert permanently deletes them from disk. A mixed multi-selection restores tracked files and deletes only the explicitly listed new files. P4Git cannot undo either operation.

### External Diff tool

Open **Tools > Preferences...** to configure Beyond Compare or another comparison executable. The same page configures a separate external 3-way Merge tool and the classic/light/dark theme, density, text scale, and toolbar labels. P4Git's Beyond Compare default is:

```text
/solo /readonly /lefttitle={leftTitle} /righttitle={rightTitle} "{left}" "{right}"
```

The template must contain `{left}` and `{right}`; optional `{leftTitle}` and `{rightTitle}` placeholders provide readable pane names. Arguments are passed directly to the executable without a command shell.

On Windows, P4Git automatically discovers `C:\Program Files\Beyond Compare 5\BCompare.exe` (and Beyond Compare 4) on first use. A configured external tool is preferred for HEAD/Workspace, index/Workspace, HEAD/index, Depot-ref/Workspace, and History Previous/HEAD comparisons. P4Git creates temporary read-only copies, preserves binary data, and removes stale copies after 24 hours. If the tool is disabled, missing, or cannot launch, the offline bundled CodeMirror MergeView is used.

## Workspace selection and multiple windows

Launch opens the Workspace chooser and preselects the most recently used repository without connecting automatically. **New Workspace...** creates an empty local repository with only an `origin` URL; it deliberately performs no network request, Fetch, Clone, or checkout. The selected local directory must be empty. **File > New Workspace Window** opens another chooser, while a Workspaces-row context menu can open that repository directly in a new window. Repository selection, branch, tabs, tasks, and cancellation are scoped to that window and Workspace.

## Submit Changelist

1. Right-click a named or Default changelist and choose **Submit Changelist**. You can also submit **Ready to submit** from the toolbar or Actions menu.
2. For a local list, P4Git prepares the Git index with only that list's files; changes in every other list remain in the working tree.
3. Review the exact file list in the Submit Changelist window.
4. Enter a non-empty description and select **Submit to Server**. A named list's description is used as the initial commit message when the field is empty.

P4Git Fetches, creates the local commit, rebases onto a newer upstream when needed, Pushes without force, and verifies the exact remote branch hash. Only then does it report success and remove assignments for committed paths. The named changelist itself remains available for later work until you delete it.

If Rebase conflicts, Submit pauses in Resolve and Continue resumes the same server-delivery transaction. If networking, permissions, protected-branch rules, hooks, or server policy reject Push, the commit stays visibly **Local only** with **Retry Submit**; it is never reported as submitted. For a configured GitLab project, **Create GitLab MR** pushes a verified `p4git/*` source branch and creates a Merge Request to the original target; the UI explicitly says that the target is not submitted until the MR is merged. Other dirty changelists are protected in an internal stash while history is rebased and are restored afterward. Use **Tools > Git > Commit Locally** for an intentionally local-only commit. Git hooks and repository policies still run because P4Git invokes the configured Git executable.

## Submitted

The **Submitted** table loads the complete Git history in 100-row pages using P4V-style columns: Change, Date Submitted, Submitted By, and Description. More rows load near the scroll boundary. Selecting a row displays its full hash, author, date, and subject in **Details**.

The disclosure arrow expands a commit's changed files in place. **View Details...** opens a P4V-style window with the title, complete description, author, date, parents, viewing source, every local/remote branch that contains the commit, and changed-file statuses. Git commits are not owned by one branch, so the containing-branch list is the accurate equivalent of a P4V Stream label. Every top value, title, and description has an explicit Copy action. Right-click a file in that window to compare it with its previous revision or the local Workspace copy (using the configured external Diff tool when available), or copy its path. Add/delete and rename comparisons use empty or old-path sources as appropriate. Other context actions expose the full diff against the parent, full-hash copy, a history-preserving `git revert --no-edit`, Cherry-pick, branch/tag creation, and Reset. Revert conflicts enter the Resolve workflow. Interactive rebase is not yet included.

## History

Select a file or folder in Depot or Workspace and choose **File History** from its context menu, or use **View > History** for the current selection. P4Git opens a persistent **History** tab linked to that path rather than a temporary dialog.

The table lists Git revisions with an approximate file revision number, commit hash, date, author, and description. Select a revision to inspect its commit details in the lower pane. Double-click to diff it against its previous revision. **Get This Revision** opens a preview that also accepts a branch, tag, full/short hash, or date. It shows the resolved commit and changed files before restoring the selected workspace paths.

## Stream Graph

**Stream Graph** occupies the equivalent P4V location for Git topology. Its table draws lanes and merge edges from commit parents; the sidebar lists local and remote branches and marks the current branch. Type part of a branch name in **Filter branch names...** for a case-insensitive fuzzy match. Drag the divider between Branches/Streams and Graph to reveal long names; the width persists, and double-clicking the divider resets it. Branch context actions can switch or create a branch from the selected ref. Remote branches are read-only but can seed a local branch.

## Resolving conflicts

Open **Tools > Git > Resolve Conflicts** for the three-way resolver. When conflicts are created, P4Git first launches the configured external 3-way Merge tool for each file with Base/Ours/Theirs/Result inputs and waits for it to close. An auto-detected/configured Beyond Compare Diff executable is also reused for three-way Merge when no separate Merge executable is set. P4Git rechecks the file after each tool exit and does not stage a text result that still contains Git conflict markers. Missing tools, cancellation, launch errors, or unresolved results fall back to the built-in resolver. There the selected file shows Base, Ours, Theirs, and the current workspace Result; standard conflict blocks can be resolved one at a time with Ours, Theirs, or Both, and binary conflicts use whole-file choices. After every file is resolved, **Continue Operation** resumes the active operation.

If Merge, Rebase, Cherry-pick, Revert, selective Changelist merge, Submit/Rebase, or Get Latest produces conflicts, P4Git starts that external-first Resolve flow automatically. The status bar shows the operation, conflict count, and when Continue is ready.

## Selection, Layout, Tasks, and LFS Locks

Use `Ctrl`, `Shift`, or `Ctrl+A` in Files, Pending, History, Submitted, Revision Graph, and Workspaces. Context actions apply to the complete selection when batching is supported. Selecting a file or folder in either Depot or Workspace keeps a visible selected state and refreshes scoped History and Submitted data without changing the active right-hand tab. Pending Changelist files include **Show in Depot Tree**, **Show in Workspace Tree**, and **Show in Explorer**. Tree reveal loads and expands every parent, selects the target, and scrolls it into view; deleted files open their former containing folder in Explorer. The active-tab filter supports **Contains**, **Starts with**, regular expressions, and optional case matching across visible names, paths, actions, authors, descriptions, hashes, and refs; invalid expressions are reported instead of silently matching nothing. Drag the Workspace, Details, and Log dividers to resize the workbench; drag Files/Pending header edges to resize long-name columns. Sizes persist between launches, and full paths appear as hover tooltips. Every modal secondary dialog can be moved by dragging its title bar; double-click the title bar to re-center it.

The **Tasks** button next to Log opens command history and running-process status. Fetch displays an animated footer status and indeterminate progress line immediately, so a slow remote cannot look like an ignored click; starting a duplicate Fetch while one is active is blocked. **Cancel Running** terminates active Git process trees. Open **Tools > Git > Git LFS Locks** or a file's **Git** context submenu to inspect, create, unlock, or force-unlock LFS locks. P4Git reports when Git LFS or remote locking is unavailable.

## Native Context Menus

P4Git follows P4V's object-context strategy with native menus. Trees, Files, Pending files, Submitted commits, branches, Workspaces, and Log expose only relevant operations. Inapplicable operations are disabled instead of acting as dead placeholders.

## Git-Native Features

Purely Git-native features are grouped under **Tools > Git** to preserve P4V's menu structure. Contextual entry points also appear under a **Git** submenu in native object menus:

- **Tools > Git** — Stash Changes, Pop Latest Stash, View Stashes, View Reflog, Merge, Rebase, Create Tag, and Abort Merge/Rebase/Cherry-pick.
- **Workspace / Pending files** — Stage, Unstage, and stash only the selected file or directory.
- **Submitted commits** — Cherry-pick, create a branch, create a lightweight tag, and Soft/Mixed/Hard Reset.
- **Branches** — merge into the current branch, rebase the current branch onto the selection, create a tag, and safely delete a merged local branch. **Work in this Stream** on a remote branch switches to its existing tracking branch or creates and switches to a local tracking branch.
- **Workspaces** — Fetch, Pull, Push, Stash, and inspect Stashes or Reflog for the selected repository.

If Merge, Rebase, or Cherry-pick encounters conflicts, Git keeps the operation in progress for resolution. Use **Tools > Git > Abort Operation** to stop it explicitly. Hard Reset and Drop Stash require typed confirmation; P4Git never runs these irreversible operations silently.

Git blocks a switch that would overwrite local changes; P4Git displays that error and never forces the operation.

## Workspaces

**Workspaces** lists recent repositories. Double-click a row to open it. Use **File > Open Workspace** for an existing repository, **File > Clone Repository** to download and check out a server repository immediately, **File > New Workspace** to configure a server while leaving the local tree empty, or **File > Init Repository** to create an unrelated local repository with a selected initial branch. On an empty remote-backed Workspace, Fetch downloads refs only; the first Get Latest discovers the advertised default branch, creates its local tracking branch, and checks out the files. Get Latest refuses this first checkout if local files have already been added.

Use **Tools > Git Settings** to select Git for Windows or the `git.exe` bundled with UGit. P4Git verifies the executable with `git --version` before saving it.

## Remote Synchronization

- **Get Latest** fetches first. It fast-forwards automatically when safe; if local and remote histories diverge, it displays the number of commits on each side and asks you to Merge, Rebase, or Cancel.
- **Connection > Fetch** updates remote-tracking refs without changing local files.
- **Connection > Push** runs a normal push, or pushes to `origin` and sets upstream for a new local branch.

**Connection > Push** first opens a preview where you select the remote, local/remote branch mapping, and upstream behavior, then inspect outgoing commits. **Tools > Git > Manage Remotes** adds, renames, edits Fetch/Push URLs, or removes remotes. Branch context menus include Rename and **Compare with Current**, which lists Incoming and Outgoing commits separately. Right-click or double-click a commit in Compare to inspect its full message, parents, and changed files. Each file reports Added/Modified/Deleted/Renamed/Copied status; right-click it to compare that revision with the local workspace. A configured external Diff tool is preferred, with the built-in text diff as fallback.

To bring only specific work from another branch into the branch currently checked out, first make the workspace clean. Open **Compare with Current**, select one or more Incoming commits with `Ctrl`, `Shift`, or `Ctrl+A`, and choose **Merge Selected into <current>**. The same action is available by multi-selecting commits in Revision Graph and opening the context menu. Enter a name and description for the new local Changelist. P4Git applies the commits in parent/oldest-first order with `cherry-pick --no-commit`, resets the index afterward, and assigns every resulting workspace change to that Changelist: no Git commit is created automatically. If a commit conflicts, Resolve opens; after resolving all files, **Continue** processes the remaining queue and keeps all results in the same Changelist. **Abort** restores the clean starting revision and removes the temporary list. Merge commits are not selectable because Git requires an explicit mainline parent.

Compare asks Git to identify patch-equivalent commits already contained in the current branch. These appear in the read-only **Already integrated (equivalent patch)** section and cannot be selected, avoiding the misleading “already contained” message after Merge is pressed.

**Tools > Git > Amend Last Commit** changes the latest message and includes currently staged files. Amend changes the commit ID and should not be used on a commit already shared with teammates.

Terminal prompts are disabled. HTTPS credentials must already be available through Git Credential Manager, and SSH authentication must already work through the configured key or agent.

## GitLab merge requests, CI, and Jobs

Open **Tools > Git > GitLab**. P4Git infers common HTTPS, SSH, and `git@host:group/project.git` origins, while still allowing manual server/project settings. Private projects usually need a GitLab Personal Access Token. The token is used only in the main process, encrypted for the current operating-system account, and never returned as plaintext to the React renderer.

The panel lists open merge requests, recent pipelines, and issues, opens entries in the browser, and creates a merge request from the current branch to a selected target. The main **Jobs** detail tab maps P4V Jobs to GitLab Issues. Pipeline job logs, approvals, and automatic commit/issue linking are not part of this version.

## Operations Deliberately Not Automated

P4Git does not silently merge, rebase, delete untracked files, discard staged content, choose a conflict side, bypass Git hooks, or emulate Perforce file locking. These operations require context that the client should not guess.
