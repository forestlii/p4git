[English](user-guide.md) | [简体中文](user-guide.zh-CN.md)

# User Guide

## Application Layout

- **Header** — current repository, branch, ahead/behind counts, Fetch, Pull, Push, refresh, Explorer, and Git settings.
- **Left navigation** — changelists, commit history, and branches.
- **Changes view** — file lists on the left, diff in the center, and commit controls on the right.
- **Status bar** — Git readiness, upstream branch, and workspace cleanliness.

## Changelists and File Status

P4Git maps the Git index to a P4V-like changelist model:

- **Default changelist** contains unstaged and untracked changes from the working tree.
- **Ready to submit** contains staged changes from the Git index.

A file can appear in both groups when part of it is staged and the working copy has additional changes. Status badges use `M` (modified), `A` (added), `D` (deleted), `R` (renamed), `C` (copied), `?` (untracked), and `!` (conflicted).

### Stage Changes

- **Stage selected** adds the selected path to the index.
- **Stage all** adds every path currently shown in the Default changelist.
- Renames include both the old and new paths so the deletion and addition stay together.

### Unstage Changes

Select a file under Ready to submit and choose **Unstage**. The content remains in the working tree; only the index entry changes.

### Discard Changes

For a tracked, unstaged file, **Discard changes** restores the working-tree content from the index after confirmation. This cannot be undone by P4Git.

P4Git never offers this command for untracked files. Delete or move those files outside P4Git when appropriate.

## Diff Review

Selecting a file opens the corresponding staged or working-tree diff. Additions, deletions, hunk headers, and metadata use distinct colors.

- Untracked text files are displayed as additions.
- Binary untracked files are not previewed.
- Untracked files over 2 MB are not previewed.
- The renderer displays at most 6,000 diff lines to protect responsiveness.

## Commit Changes

1. Stage the exact files to include.
2. Resolve all conflicted files; P4Git disables commit while a conflict is reported.
3. Enter a non-empty message.
4. Select **Commit**.

Git hooks and configured commit policies still run because P4Git calls the real Git executable. A hook failure is shown as an error and the commit is not reported as successful.

## Remote Synchronization

### Fetch

**Fetch** runs `git fetch --all --prune`. It downloads remote refs and removes stale remote-tracking refs without changing local files.

### Pull

**Pull** runs `git pull --ff-only`. It succeeds only when Git can fast-forward the current branch. If local and remote histories diverged, choose and perform the appropriate merge or rebase outside P4Git 0.1.

### Push

When an upstream exists, **Push** runs a normal `git push`. On a new local branch without an upstream, P4Git pushes to `origin` and configures that branch as the upstream.

P4Git disables terminal prompts. HTTPS credentials must already be available through Git Credential Manager, and SSH authentication must already work through the configured key/agent.

## History

The History view shows up to 100 recent commits with subject, author, relative time, short hash, and decorations such as `HEAD`, local branches, and remote refs.

Version 0.1 does not yet include a per-commit file diff or actions such as revert, cherry-pick, reset, and interactive rebase.

## Branches

- Local and remote branches are listed separately.
- The current local branch is highlighted.
- Enter a valid name to create a local branch from the current `HEAD` and switch to it.
- Switch directly between existing local branches.

Remote branches are currently read-only in the interface. Create a tracking branch with Git before opening it in P4Git, or create the desired local branch in the Branches view.

Git prevents a branch switch when local changes would be overwritten; P4Git shows the Git error instead of forcing the operation.

## Workspaces and Settings

P4Git remembers the last workspace and up to eight recent repositories. Selecting a different `git.exe` updates the application setting for future launches.

Use the Explorer button in the header to open the validated repository root in Windows Explorer.

## Operations Deliberately Not Automated

P4Git 0.1 does not silently merge, rebase, delete untracked files, discard staged content, resolve conflicts, or bypass Git hooks. These operations require more context than the initial client can safely infer.
