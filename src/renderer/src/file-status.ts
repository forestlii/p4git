import type { FileChange, WorkspaceEntry } from '../../shared/types'

export type P4VEntryBase = 'depot-folder' | 'workspace-folder' | 'depot-file' | 'workspace-file'
export type P4VBadgeKind = 'synced' | 'previous' | 'workspace-only' | 'differs' | 'add' | 'edit' | 'delete' | 'move' | 'copy' | 'resolve' | 'lock-mine' | 'lock-other'

export interface P4VEntryVisual {
  base: P4VEntryBase
  badges: Array<{ kind: P4VBadgeKind; label: string }>
  tooltip: string
}

export function p4vEntryVisual(
  entry: WorkspaceEntry,
  source: 'depot' | 'workspace',
  change?: FileChange,
  lock?: { mine: boolean; owner?: string }
): P4VEntryVisual {
  const base: P4VEntryBase = entry.isDirectory
    ? source === 'depot' ? 'depot-folder' : 'workspace-folder'
    : source === 'depot' ? 'depot-file' : 'workspace-file'
  const baseLabel = entry.isDirectory
    ? source === 'depot' ? 'Folder in the Depot' : 'Folder in the Workspace'
    : source === 'depot' ? 'File in the Depot' : 'File in the Workspace'
  if (entry.isDirectory) return { base, badges: [], tooltip: baseLabel }

  const badges: P4VEntryVisual['badges'] = []
  if (change?.conflicted || change?.kind === 'conflicted') {
    badges.push({ kind: 'resolve', label: 'File needs to be resolved' })
  } else if (change?.kind === 'untracked') {
    badges.push({ kind: 'workspace-only', label: 'File is in the Workspace but not in the Depot' })
  } else if (change?.kind === 'added') {
    if (change.staged) badges.push({ kind: 'add', label: 'File is open for add by you' })
    else badges.push({ kind: 'workspace-only', label: 'File is in the Workspace but not in the Depot' })
    if (change.staged && change.unstaged) badges.push({ kind: 'differs', label: 'Workspace content differs from the staged revision' })
  } else if (change?.kind === 'deleted') {
    badges.push({ kind: 'delete', label: 'File is open for delete by you' })
  } else if (change?.kind === 'renamed') {
    badges.push({ kind: 'move', label: 'File is open for rename or move' })
  } else if (change?.kind === 'copied') {
    badges.push({ kind: 'copy', label: 'File is open for branch or copy' })
  } else if (change) {
    if (change.staged) badges.push({ kind: 'edit', label: 'File is open for edit by you' })
    if (change.unstaged) badges.push({ kind: 'differs', label: 'Workspace file differs from the head revision' })
  } else if (source === 'workspace') {
    if (!entry.tracked) badges.push({ kind: 'workspace-only', label: 'File is in the Workspace but not in the Depot' })
    else if (entry.unsynced) badges.push({ kind: 'previous', label: 'File is synced to a previous server revision' })
    else badges.push({ kind: 'synced', label: 'File is synced to the head revision' })
  }

  if (lock) badges.push({
    kind: lock.mine ? 'lock-mine' : 'lock-other',
    label: lock.mine ? 'File is locked by you' : `File is locked by ${lock.owner || 'another user'}`
  })
  return { base, badges, tooltip: [baseLabel, ...badges.map((badge) => badge.label)].join(' · ') }
}
