import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppSettings } from '../../shared/types'
import type { SettingsStore } from '../settings'
import { expandDiffToolArguments, expandMergeToolArguments, GitService } from './service'

const execFileAsync = promisify(execFile)
const temporaryRepositories: string[] = []
const normalizeLines = (value: string): string => value.replace(/\r\n/g, '\n')

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
    expect(expandMergeToolArguments('"{theirs}" "{ours}" "{base}" "{result}"', {
      base: 'C:\\Temp Folder\\base.txt', ours: 'ours.txt', theirs: 'theirs.txt', result: 'result.txt'
    })).toEqual(['theirs.txt', 'ours.txt', 'C:\\Temp Folder\\base.txt', 'result.txt'])
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
    await expect(subject.resolveRevision(root, 'HEAD')).resolves.toMatchObject({ subject: 'second revision', files: [{ path: 'tracked.txt', kind: 'M' }] })
    await expect(subject.resolveRevision(root, new Date(Date.now() + 60_000).toISOString())).resolves.toMatchObject({ subject: 'second revision' })

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
    expect(deleted).toEqual({ changelists: [], assignments: {}, shelves: [] })
  }, 15_000)

  it('fast-forwards Get Latest and reports diverged branches without changing local history', async () => {
    const root = await createRepository()
    const remote = await mkdtemp(join(tmpdir(), 'p4git-service-'))
    const peer = await mkdtemp(join(tmpdir(), 'p4git-service-'))
    temporaryRepositories.push(remote, peer)
    await git(remote, 'init', '--bare')
    await git(root, 'remote', 'add', 'origin', remote)
    await git(root, 'push', '--set-upstream', 'origin', 'main')
    await git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main')
    await git(peer, 'clone', remote, '.')
    await git(peer, 'config', 'user.name', 'P4Git Peer')
    await git(peer, 'config', 'user.email', 'peer@example.invalid')

    await writeFile(join(peer, 'remote.txt'), 'remote one\n', 'utf8')
    await git(peer, 'add', 'remote.txt')
    await git(peer, 'commit', '-m', 'remote one')
    await git(peer, 'push')

    const subject = service()
    await expect(subject.pull(root)).resolves.toMatchObject({
      outcome: 'fast-forwarded',
      upstream: 'origin/main',
      ahead: 0,
      behind: 1
    })

    await writeFile(join(root, 'local.txt'), 'local\n', 'utf8')
    await git(root, 'add', 'local.txt')
    await git(root, 'commit', '-m', 'local work')
    await writeFile(join(peer, 'remote.txt'), 'remote two\n', 'utf8')
    await git(peer, 'add', 'remote.txt')
    await git(peer, 'commit', '-m', 'remote two')
    await git(peer, 'push')

    const headBefore = (await git(root, 'rev-parse', 'HEAD')).trim()
    await expect(subject.pull(root)).resolves.toMatchObject({
      outcome: 'diverged',
      upstream: 'origin/main',
      ahead: 1,
      behind: 1
    })
    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(headBefore)
  }, 20_000)

  it('builds a parent-aware revision graph and reverts a submitted change', async () => {
    const root = await createRepository()
    const subject = service()
    await writeFile(join(root, 'tracked.txt'), 'changed by submitted commit\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'change to undo')
    const change = (await git(root, 'rev-parse', 'HEAD')).trim()

    const graph = await subject.graph(root)
    expect(graph[0]).toMatchObject({ hash: change, subject: 'change to undo' })
    expect(graph[0].parents).toHaveLength(1)
    await expect(subject.commitDetails(root, change)).resolves.toMatchObject({
      hash: change,
      message: 'change to undo',
      files: [{ kind: 'M', path: 'tracked.txt' }]
    })

    await subject.revertCommits(root, [change])
    expect(normalizeLines(await readFile(join(root, 'tracked.txt'), 'utf8'))).toBe('initial\n')
    expect((await git(root, 'log', '-1', '--format=%s')).trim()).toContain('Revert')
  }, 15_000)

  it('loads three-way conflict content, resolves it, and continues the merge', async () => {
    const root = await createRepository()
    const subject = service()
    await git(root, 'switch', '-c', 'feature')
    await writeFile(join(root, 'tracked.txt'), 'feature version\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'feature edit')
    await git(root, 'switch', 'main')
    await writeFile(join(root, 'tracked.txt'), 'main version\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'main edit')
    await expect(git(root, 'merge', 'feature')).rejects.toBeDefined()

    const conflicts = await subject.conflicts(root)
    await expect(subject.operationState(root)).resolves.toMatchObject({ operation: 'merge', conflicts: 1, canContinue: false, canAbort: true })
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      path: 'tracked.txt',
      binary: false,
      base: 'initial\n',
      ours: 'main version\n',
      theirs: 'feature version\n',
      result: expect.stringContaining('<<<<<<<')
    })

    await subject.resolveConflict(root, 'tracked.txt', 'manual', 'combined version\n')
    expect(await subject.conflicts(root)).toHaveLength(0)
    await expect(subject.operationState(root)).resolves.toMatchObject({ operation: 'merge', conflicts: 0, canContinue: true })
    await subject.continueOperation(root)
    expect(await readFile(join(root, 'tracked.txt'), 'utf8')).toBe('combined version\n')
    expect((await subject.graph(root))[0].parents).toHaveLength(2)
  }, 20_000)

  it('selectively merges multiple commits into the current branch in parent order', async () => {
    const root = await createRepository()
    const subject = service()
    await git(root, 'switch', '-c', 'feature')
    await writeFile(join(root, 'first.txt'), 'first selected change\n', 'utf8')
    await git(root, 'add', 'first.txt')
    await git(root, 'commit', '-m', 'selected first')
    const first = (await git(root, 'rev-parse', 'HEAD')).trim()
    await writeFile(join(root, 'second.txt'), 'second selected change\n', 'utf8')
    await git(root, 'add', 'second.txt')
    await git(root, 'commit', '-m', 'selected second')
    const second = (await git(root, 'rev-parse', 'HEAD')).trim()
    await git(root, 'switch', 'main')

    await subject.cherryPickCommits(root, [second, first])

    expect(normalizeLines(await readFile(join(root, 'first.txt'), 'utf8'))).toBe('first selected change\n')
    expect(normalizeLines(await readFile(join(root, 'second.txt'), 'utf8'))).toBe('second selected change\n')
    expect((await git(root, 'log', '-2', '--format=%s')).trim().split(/\r?\n/)).toEqual(['selected second', 'selected first'])
    const comparison = await subject.compareBranch(root, 'feature')
    expect(comparison.incoming).toEqual([])
    expect(comparison.integrated.map((commit) => commit.subject)).toEqual(['selected second', 'selected first'])
    await expect(subject.cherryPickCommits(root, [first])).rejects.toThrow('已经包含在当前分支中')
  }, 20_000)

  it('keeps the remaining selected commits queued while a conflict is resolved', async () => {
    const root = await createRepository()
    const subject = service()
    await git(root, 'switch', '-c', 'feature')
    await writeFile(join(root, 'tracked.txt'), 'feature version\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'selected conflict')
    const conflicting = (await git(root, 'rev-parse', 'HEAD')).trim()
    await writeFile(join(root, 'after-conflict.txt'), 'remaining selected change\n', 'utf8')
    await git(root, 'add', 'after-conflict.txt')
    await git(root, 'commit', '-m', 'selected after conflict')
    const remaining = (await git(root, 'rev-parse', 'HEAD')).trim()
    await git(root, 'switch', 'main')
    await writeFile(join(root, 'tracked.txt'), 'main version\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'main edit')

    await expect(subject.cherryPickCommits(root, [remaining, conflicting])).rejects.toBeDefined()
    await expect(subject.operationState(root)).resolves.toMatchObject({ operation: 'cherry-pick', conflicts: 1, canContinue: false })
    await subject.resolveConflict(root, 'tracked.txt', 'manual', 'resolved selected version\n')
    await subject.continueOperation(root)

    expect(await readFile(join(root, 'tracked.txt'), 'utf8')).toBe('resolved selected version\n')
    expect(normalizeLines(await readFile(join(root, 'after-conflict.txt'), 'utf8'))).toBe('remaining selected change\n')
    expect((await git(root, 'log', '-2', '--format=%s')).trim().split(/\r?\n/)).toEqual(['selected after conflict', 'selected conflict'])
    await expect(subject.operationState(root)).resolves.toMatchObject({ operation: undefined, conflicts: 0 })
  }, 20_000)

  it('applies selected commits into a new local changelist without creating commits', async () => {
    const root = await createRepository()
    const subject = service()
    await git(root, 'switch', '-c', 'feature')
    await writeFile(join(root, 'first.txt'), 'first local changelist change\n', 'utf8')
    await git(root, 'add', 'first.txt')
    await git(root, 'commit', '-m', 'local changelist first')
    const first = (await git(root, 'rev-parse', 'HEAD')).trim()
    await writeFile(join(root, 'second.txt'), 'second local changelist change\n', 'utf8')
    await git(root, 'add', 'second.txt')
    await git(root, 'commit', '-m', 'local changelist second')
    const second = (await git(root, 'rev-parse', 'HEAD')).trim()
    await git(root, 'switch', 'main')
    const head = (await git(root, 'rev-parse', 'HEAD')).trim()

    const result = await subject.selectiveMergeCommits({
      repoPath: root,
      refs: [second, first],
      changelistName: 'Merge feature selection',
      description: 'Keep selected work local'
    })

    expect(result).toMatchObject({ applied: 2, total: 2, conflicted: false })
    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(head)
    expect((await git(root, 'diff', '--cached', '--name-only')).trim()).toBe('')
    expect((await subject.summary(root)).changes.map((change) => change.path)).toEqual(['first.txt', 'second.txt'])
    expect(result.state.assignments).toMatchObject({ 'first.txt': result.changelist.id, 'second.txt': result.changelist.id })
    await expect(subject.operationState(root)).resolves.toMatchObject({ operation: undefined, conflicts: 0 })
  }, 20_000)

  it('resumes a conflicted no-commit selective merge and keeps all files in its changelist', async () => {
    const root = await createRepository()
    const subject = service()
    await git(root, 'switch', '-c', 'feature')
    await writeFile(join(root, 'tracked.txt'), 'feature selective version\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'selective conflict')
    const conflicting = (await git(root, 'rev-parse', 'HEAD')).trim()
    await writeFile(join(root, 'after-conflict.txt'), 'queued no-commit change\n', 'utf8')
    await git(root, 'add', 'after-conflict.txt')
    await git(root, 'commit', '-m', 'selective queued')
    const queued = (await git(root, 'rev-parse', 'HEAD')).trim()
    await git(root, 'switch', 'main')
    await writeFile(join(root, 'tracked.txt'), 'main selective version\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'main before selective merge')
    const head = (await git(root, 'rev-parse', 'HEAD')).trim()

    const paused = await subject.selectiveMergeCommits({ repoPath: root, refs: [queued, conflicting], changelistName: 'Conflicted selection' })
    expect(paused).toMatchObject({ applied: 0, total: 2, conflicted: true })
    expect(paused.state.assignments['tracked.txt']).toBe(paused.changelist.id)
    await expect(subject.operationState(root)).resolves.toMatchObject({ operation: 'cherry-pick', conflicts: 1, changelistId: paused.changelist.id })

    await subject.resolveConflict(root, 'tracked.txt', 'manual', 'resolved selective version\n')
    await subject.continueOperation(root)

    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(head)
    expect((await git(root, 'diff', '--cached', '--name-only')).trim()).toBe('')
    expect(normalizeLines(await readFile(join(root, 'after-conflict.txt'), 'utf8'))).toBe('queued no-commit change\n')
    const state = await subject.changelists(root)
    expect(state.assignments).toMatchObject({ 'tracked.txt': paused.changelist.id, 'after-conflict.txt': paused.changelist.id })
    await expect(subject.operationState(root)).resolves.toMatchObject({ operation: undefined, conflicts: 0 })
  }, 25_000)

  it('aborts a conflicted selective merge back to its clean starting point', async () => {
    const root = await createRepository()
    const subject = service()
    await git(root, 'switch', '-c', 'feature')
    await writeFile(join(root, 'tracked.txt'), 'feature abort version\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'abort conflict source')
    const source = (await git(root, 'rev-parse', 'HEAD')).trim()
    await git(root, 'switch', 'main')
    await writeFile(join(root, 'tracked.txt'), 'main abort version\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await git(root, 'commit', '-m', 'main before abort')
    const head = (await git(root, 'rev-parse', 'HEAD')).trim()

    const paused = await subject.selectiveMergeCommits({ repoPath: root, refs: [source], changelistName: 'Temporary conflicted selection' })
    expect(paused.conflicted).toBe(true)
    await subject.abort(root, 'cherry-pick')

    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(head)
    expect((await git(root, 'status', '--porcelain')).trim()).toBe('')
    expect((await subject.changelists(root)).changelists).toEqual([])
    await expect(subject.operationState(root)).resolves.toMatchObject({ operation: undefined, conflicts: 0 })
  }, 20_000)

  it('shelves and unshelves one local changelist while restoring assignments', async () => {
    const root = await createRepository()
    const subject = service()
    const created = await subject.createChangelist(root, 'UI task', 'shelf round trip')
    const id = created.changelists[0].id
    await writeFile(join(root, 'tracked.txt'), 'shelved edit\n', 'utf8')
    await writeFile(join(root, 'new.txt'), 'new shelf file\n', 'utf8')
    await subject.assignChangelist(root, ['tracked.txt', 'new.txt'], id)

    const shelved = await subject.shelveChangelist(root, id, 'UI task', 'shelf round trip', ['tracked.txt', 'new.txt'])
    expect(shelved.shelves).toHaveLength(1)
    expect((await subject.summary(root)).changes).toHaveLength(0)
    expect(shelved.assignments).toEqual({})

    const restored = await subject.unshelve(root, shelved.shelves[0].hash)
    expect(restored.shelves).toHaveLength(0)
    expect(restored.assignments).toMatchObject({ 'tracked.txt': id, 'new.txt': id })
    expect((await subject.summary(root)).changes.map((change) => change.path)).toEqual(['new.txt', 'tracked.txt'])
  }, 20_000)

  it('manages remotes, previews pushes, compares and renames branches, and amends commits', async () => {
    const root = await createRepository()
    const remote = await mkdtemp(join(tmpdir(), 'p4git-service-'))
    temporaryRepositories.push(remote)
    await git(remote, 'init', '--bare')
    const subject = service()
    await subject.saveRemote(root, undefined, 'team', remote)
    expect(await subject.remotes(root)).toMatchObject([{ name: 'team', fetchUrl: remote, pushUrl: remote }])

    const preview = await subject.pushPreview({ repoPath: root, remote: 'team', localBranch: 'main', remoteBranch: 'main', setUpstream: true })
    expect(preview.commits.map((commit) => commit.subject)).toEqual(['initial'])
    await subject.pushTo(preview)
    expect((await git(remote, 'show-ref', '--heads', 'main')).trim()).toContain('refs/heads/main')

    await subject.checkout(root, 'from-remote', true, 'team/main')
    expect((await git(root, 'branch', '--show-current')).trim()).toBe('from-remote')
    expect((await git(root, 'rev-parse', 'from-remote')).trim()).toBe((await git(root, 'rev-parse', 'team/main')).trim())
    await subject.checkout(root, 'main')
    await subject.checkout(root, 'from-main', true, 'main')
    expect((await git(root, 'branch', '--show-current')).trim()).toBe('from-main')
    await expect(subject.checkout(root, 'bad branch', true, 'main')).rejects.toThrow('分支名称无效')
    await subject.checkout(root, 'main')

    await git(root, 'switch', '-c', 'feature')
    await writeFile(join(root, 'feature.txt'), 'feature\n', 'utf8')
    await git(root, 'add', 'feature.txt')
    await git(root, 'commit', '-m', 'feature work')
    const comparison = await subject.compareBranch(root, 'main')
    expect(comparison.outgoing.map((commit) => commit.subject)).toEqual(['feature work'])
    await subject.renameBranch(root, 'feature', 'renamed-feature')
    expect((await git(root, 'branch', '--show-current')).trim()).toBe('renamed-feature')
    await subject.commit(root, 'amended feature work', true)
    expect((await git(root, 'log', '-1', '--format=%s')).trim()).toBe('amended feature work')
    await subject.deleteRemote(root, 'team')
    expect(await subject.remotes(root)).toEqual([])
  }, 25_000)

  it('initializes and clones repositories into explicitly selected directories', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'p4git-service-'))
    temporaryRepositories.push(parent)
    const initialized = join(parent, 'initialized')
    const cloned = join(parent, 'cloned')
    const subject = service()

    await expect(subject.initRepository({ directory: initialized, initialBranch: 'develop' })).resolves.toBe(initialized)
    expect((await git(initialized, 'branch', '--show-current')).trim()).toBe('develop')
    const initializedSummary = await subject.summary(initialized)
    expect(initializedSummary).toMatchObject({ branch: 'develop', changes: [] })
    expect(initializedSummary.root.replaceAll('\\', '/').toLowerCase()).toBe((await git(initialized, 'rev-parse', '--show-toplevel')).trim().replaceAll('\\', '/').toLowerCase())
    await expect(subject.history(initialized)).resolves.toEqual([])
    await expect(subject.graph(initialized)).resolves.toEqual([])
    await expect(subject.listTree(initialized, 'HEAD')).resolves.toEqual([])
    await writeFile(join(initialized, 'README.md'), '# Initialized\n', 'utf8')
    await git(initialized, 'config', 'user.name', 'P4Git Test')
    await git(initialized, 'config', 'user.email', 'p4git@example.invalid')
    await git(initialized, 'add', 'README.md')
    await git(initialized, 'commit', '-m', 'initial')

    await expect(subject.cloneRepository({ url: initialized, parentDirectory: parent, folderName: 'cloned' })).resolves.toBe(cloned)
    expect(normalizeLines(await readFile(join(cloned, 'README.md'), 'utf8'))).toBe('# Initialized\n')
  }, 20_000)
})
