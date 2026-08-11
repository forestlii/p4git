[English](getting-started.md) | [简体中文](getting-started.zh-CN.md)

# Installation and First Run

This guide takes you from a downloaded P4Git package to the first local commit.

## Prerequisites

- Windows 10 or newer, x64
- Git 2.23 or newer
- An existing local Git repository
- Credentials already configured in Git when the repository requires authentication

P4Git does not bundle Git in version 0.1. It can use Git for Windows or a compatible `git.exe` shipped with another desktop client.

## Choose a Package

| Package | Best for | Behavior |
|---|---|---|
| `P4Git-Setup-<version>-x64.exe` | Normal daily use | Installs per user, can create Start menu/desktop shortcuts, and registers an uninstaller |
| `P4Git-Portable-<version>-x64.exe` | Evaluation or restricted machines | Runs without installation; delete the executable when no longer needed |

Both packages store application settings in the current Windows user profile, including the selected Git path and recent repositories. “Portable” describes deployment, not a zero-trace privacy mode.

## Windows Security Warning

The 0.1 binaries are not code-signed. Windows may display **Unknown publisher** or **Windows protected your PC**.

If you downloaded the file from the official [P4Git Releases](https://github.com/forestlii/p4git/releases) page:

1. Verify that the file name and version match the release.
2. Open **More info** in the SmartScreen dialog.
3. Choose **Run anyway** only if you trust the source and checksum.

Code signing is planned for a later distribution setup. A signature proves publisher identity and file integrity; it is not, by itself, a guarantee that software is safe.

## Configure Git

At startup, P4Git checks:

1. `git` available on `PATH`.
2. The standard Git for Windows installation under `Program Files`.
3. A per-user Git for Windows installation under `LocalAppData`.
4. A Git executable previously selected in P4Git.

If Git is not found, select **Choose git.exe** and browse to a compatible executable. For UGit or another client, locate the `git.exe` used by that application. P4Git verifies the file by running `git --version` before saving it.

## Open the First Workspace

1. Select **Open Git workspace**.
2. Choose the root directory of an existing Git repository, or any directory inside it.
3. P4Git resolves the repository root and displays its current branch, upstream, remote, and changes.
4. The repository is added to **Recent workspaces** for quick access next time.

## Create the First Commit

1. Open **Pending** and select a file under **Default changelist**.
2. Choose **Checkout** for a modified file or **Add** for an untracked file. You can also drag files to **Ready to submit**.
3. Double-click a file or choose **Diff** to review it in the bottom Diff Summary pane.
4. Choose **Submit**, enter a description in the Submit Changelist window, and submit.

This creates a local Git commit. It does not automatically push. Use **Connection > Push** when you are ready to publish the commit to the remote.

## Next Steps

- Read the [User guide](user-guide.md) for every workspace operation.
- Read [Troubleshooting](troubleshooting.md) if Git, credentials, or pull behavior needs attention.
