import { describe, expect, it } from 'vitest'
import type { FileChange, WorkspaceEntry } from '../../shared/types'
import { p4vEntryVisual } from './file-status'

const file = (overrides: Partial<WorkspaceEntry> = {}): WorkspaceEntry => ({ name: 'file.txt', path: 'file.txt', isDirectory: false, tracked: true, ...overrides })
const change = (overrides: Partial<FileChange> = {}): FileChange => ({ path: 'file.txt', kind: 'modified', staged: false, unstaged: true, conflicted: false, ...overrides })

describe('P4V-style file visuals', () => {
  it('distinguishes synced, previous, and workspace-only files', () => {
    expect(p4vEntryVisual(file(), 'workspace').badges.map((badge) => badge.kind)).toEqual(['synced'])
    expect(p4vEntryVisual(file({ unsynced: true }), 'workspace').badges.map((badge) => badge.kind)).toEqual(['previous'])
    expect(p4vEntryVisual(file({ tracked: false }), 'workspace').badges.map((badge) => badge.kind)).toEqual(['add'])
  })

  it('shows every non-ignored untracked file as an Add action', () => {
    expect(p4vEntryVisual(file({ tracked: false }), 'workspace', change({ kind: 'untracked' })).badges.map((badge) => badge.kind)).toEqual(['add'])
    expect(p4vEntryVisual(file({ tracked: false, ignored: true }), 'workspace').badges).toEqual([])
  })

  it('uses red action semantics and supports combined badges', () => {
    expect(p4vEntryVisual(file(), 'workspace', change({ staged: true, unstaged: true })).badges.map((badge) => badge.kind)).toEqual(['edit', 'differs'])
    expect(p4vEntryVisual(file({ tracked: false }), 'workspace', change({ kind: 'added', staged: true, unstaged: false })).badges.map((badge) => badge.kind)).toEqual(['add'])
    expect(p4vEntryVisual(file(), 'workspace', change({ kind: 'conflicted', conflicted: true }), { mine: false, owner: 'Alice' }).badges.map((badge) => badge.kind)).toEqual(['resolve', 'lock-other'])
  })

  it('keeps Depot and Workspace folder identities distinct without invented action badges', () => {
    const folder = file({ name: 'src', path: 'src', isDirectory: true })
    expect(p4vEntryVisual(folder, 'depot')).toMatchObject({ base: 'depot-folder', badges: [] })
    expect(p4vEntryVisual(folder, 'workspace', change())).toMatchObject({ base: 'workspace-folder', badges: [] })
  })
})
