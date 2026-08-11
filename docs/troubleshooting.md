[English](troubleshooting.md) | [简体中文](troubleshooting.zh-CN.md)

# Troubleshooting

## P4Git Cannot Find Git

Install Git for Windows, or select a compatible `git.exe` from the welcome page or Settings button. Run the candidate manually with `git --version` if verification fails. Git 2.23 or newer is required for `switch` and `restore`.

## The Selected Folder Is Not a Repository

P4Git uses `git rev-parse --show-toplevel`. Select a directory inside a cloned or initialized repository. Repository cloning is not part of version 0.1.

## Fetch, Pull, or Push Reports an Authentication Error

P4Git sets `GIT_TERMINAL_PROMPT=0`, so it never opens a hidden terminal prompt.

- HTTPS: authenticate once with Git Credential Manager or another Git client using the same credential setup.
- SSH: verify `ssh -T git@<host>` and ensure the key or SSH agent is available.
- SSO: authorize the credential for the relevant organization when required.

Restart P4Git after changing environment-level credential or SSH agent configuration.

## Pull Says “Not possible to fast-forward”

Local and upstream histories diverged. P4Git intentionally uses `--ff-only`. Inspect the commits and perform an explicit merge or rebase using your approved team workflow, then refresh P4Git.

## Commit Requires User Name or Email

Configure a repository-specific identity:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

Add `--global` only when the identity should apply to every repository for the current user.

## A Git Hook Rejects the Commit

Read the error shown by P4Git, correct the files or message, and commit again. P4Git does not bypass hooks with `--no-verify`.

## A Diff Is Empty or Truncated

- Binary files may not have a text diff.
- Untracked files larger than 2 MB are not previewed.
- P4Git displays at most 6,000 lines.
- A file with both staged and unstaged content has two distinct diffs; select it in the intended changelist.

## Windows Shows an Unknown Publisher Warning

The initial release is not code-signed. Download only from the official release page, compare the published SHA-256 checksum, and follow your organization’s software policy. Do not suppress SmartScreen globally.

## Portable Settings Remain After Deleting the Executable

The portable package avoids installation, but Electron still stores P4Git settings in the current Windows user profile. Remove the P4Git user-data directory manually only when you also want to forget recent repositories and the selected Git path.

## Reporting a Bug

Open a [GitHub issue](https://github.com/forestlii/p4git/issues) with:

- P4Git version and package type
- Windows and Git versions
- Reproduction steps
- The complete sanitized error message

Never attach tokens, private keys, credential files, or proprietary repository contents.
