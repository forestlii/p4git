import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppSettings } from '../../shared/types'
import type { SettingsStore } from '../settings'
import { expandDiffToolArguments, GitService } from './service'

const execFileAsync = promisify(execFile)
const temporaryRepositories: string[] = []

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync('git', args, { cwd, encoding: 'utf8', windowsHide: true })).stdout
}

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'p4git-service-'))
  temporaryRepositories.push(root)
  await git(root, 'init', '-b', 'main')
  await git(root, 'config', 'user.name', 'P4Git Test')
  await git(root, 'config', 'user.email', 'p4git@example.invalid')
  await writeFile(join(root, 'tracked.txt'), 'initial\n', 'utf8')
  await git(root, 'add', 'tracked.txt')
  await git(root, 'commit', '-m', 'initial')
  return root
}

function service(overrides: Partial<AppSettings> = {}): GitService {
  const settings = {
    get: async (): Promise<AppSettings> => ({ gitPath: 'git', recentRepositories: [], ...overrides }),
    update: async (patch: Partial<AppSettings>): Promise<AppSettings> => ({ recentRepositories: [], ...patch }),
    rememberRepository: async (): Promise<void> => undefined
  } as unknown as SettingsStore
  return new GitService(settings)
}

afterEach(async () => {
  while (temporaryRepositories.length) {
    const target = resolve(temporaryRepositories.pop()!)
    if (target.startsWith(resolve(tmpdir(), 'p4git-service-'))) {
      await rm(target, { recursive: true, force: true, maxRetries: 3 })
    }
  }
})

describe('GitService Git-native operations', () => {
  it('expands external Diff arguments without using a command shell', () => {
    expect(expandDiffToolArguments('/solo /lefttitle="{leftTitle}" "{left}" "{right}"', {
      left: 'C:\\Temp Folder\\left.txt',
      right: 'C:\\Temp Folder\\right.txt',
      leftTitle: 'HEAD version',
      rightTitle: 'Workspace',
    })).toEqual(['/solo', '/lefttitle=HEAD version', 'C:\\Temp Folder\\left.txt', 'C:\\Temp Folder\\right.txt'])
    expect(() => expandDiffToolArguments('"{left}', { left: 'a', right: 'b', leftTitle: 'a', rightTitle: 'b' })).toThrow('引号没有闭合')
  })

  it('loads file and repository history with revision-scoped diffs', async () => {
    const root = await createRepository()
    const subject = service()
    await writeFile(join(root, 'tracked.txt'), 'second revision\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'second revision')

    const fileHistory = await subject.fileHistory(root, 'tracked.txt')
    expect(fileHistory.map((commit) => commit.subject)).toEqual(['second revision', 'initial'])
    expect((await subject.fileHistory(root, '.')).length).toBe(2)
    expect(await subject.fileRevisionDiff(root, 'tracked.txt', fileHistory[0].hash)).toContain('+second revision')
    expect(await subject.fileRevisionDiff(root, 'tracked.txt', fileHistory[1].hash, 'HEAD')).toContain('+second revision')

    const external = service({ diffToolPath: process.execPath, diffToolArguments: '--version "{left}" "{right}"' })
    await expect(external.launchExternalDiff({
      repoPath: root,
      filePath: 'tracked.txt',
      left: { kind: 'git', ref: 'HEAD' },
      right: { kind: 'workspace' },
      leftTitle: 'HEAD',
      rightTitle: 'Workspace'
    })).resolves.toBe(true)
  }, 15_000)

  it('creates, lists, applies, and drops a stash, then reads reflog and tags', async () => {
    const root = await createRepository()
    const subject = service()
    await writeFile(join(root, 'tracked.txt'), 'changed\n', 'utf8')
    await writeFile(join(root, 'untracked.txt'), 'new\n', 'utf8')

    await subject.stash(root, 'test stash')
    const stashes = await subject.stashes(root)
    expect(stashes).toHaveLength(1)
    expect(stashes[0].ref).toBe('stash@{0}')
    expect(stashes[0].subject).toContain('test stash')
    expect((await subject.summary(root)).changes).toHaveLength(0)

    await subject.applyStash(root, stashes[0].ref)
    expect((await subject.summary(root)).changes.map((change) => change.path)).toEqual([
      'tracked.txt',
      'untracked.txt'
    ])

    await git(root, 'reset', '--hard', 'HEAD')
    await git(root, 'clean', '-fd')
    await subject.dropStash(root, stashes[0].ref)
    expect(await subject.stashes(root)).toHaveLength(0)

    await subject.createTag(root, 'v-test', 'HEAD')
    expect((await git(root, 'tag', '--list', 'v-test')).trim()).toBe('v-test')
    expect((await subject.reflog(root, 10)).length).toBeGreaterThan(0)
  }, 15_000)

  it('persists repository-local changelists outside the worktree', async () => {
    const root = await createRepository()
    const subject = service()
    const created = await subject.createChangelist(root, 'Gameplay task', 'Keep these edits together')
    const changelist = created.changelists[0]
    expect(changelist.name).toBe('Gameplay task')

    const assigned = await subject.assignChangelist(root, ['tracked.txt', 'nested/other.txt'], changelist.id)
    expect(assigned.assignments['tracked.txt']).toBe(changelist.id)
    expect(assigned.assignments['nested/other.txt']).toBe(changelist.id)

    const persisted = await service().changelists(root)
    expect(persisted).toEqual(assigned)

    const updated = await subject.updateChangelist(root, changelist.id, 'Gameplay polish', 'Updated description')
    expect(updated.changelists[0].name).toBe('Gameplay polish')
    expect((await git(root, 'status', '--porcelain')).trim()).toBe('')

    await writeFile(join(root, 'selected.txt'), 'selected\n', 'utf8')
    await writeFile(join(root, 'other.txt'), 'other\n', 'utf8')
    await git(root, 'add', 'selected.txt', 'other.txt')
    await subject.prepareChangelist(root, ['selected.txt'])
    expect((await git(root, 'diff', '--cached', '--name-only')).trim()).toBe('selected.txt')

    const deleted = await subject.deleteChangelist(root, changelist.id)
    expect(deleted).toEqual({ changelists: [], assignments: {} })
  }, 15_000)
})
