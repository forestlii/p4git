import { describe, expect, it } from 'vitest'
import { parseBlame, parseBranches, parseLog, parsePorcelainV2, parseReflog, parseRevisionFiles, parseStashes } from './parsers'

describe('parsePorcelainV2', () => {
  it('parses staged, unstaged, untracked, renamed, and conflicted files', () => {
    const output = [
      '1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb src/staged file.ts',
      '1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa src/working.ts',
      '? notes/todo.txt',
      '2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 src/new name.ts',
      'src/old name.ts',
      'u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc src/conflict.ts',
      ''
    ].join('\0')

    expect(parsePorcelainV2(output)).toEqual([
      {
        path: 'notes/todo.txt',
        kind: 'untracked',
        staged: false,
        unstaged: true,
        conflicted: false
      },
      {
        path: 'src/conflict.ts',
        kind: 'conflicted',
        staged: true,
        unstaged: true,
        conflicted: true
      },
      {
        path: 'src/new name.ts',
        oldPath: 'src/old name.ts',
        kind: 'renamed',
        staged: true,
        unstaged: false,
        conflicted: false
      },
      {
        path: 'src/staged file.ts',
        oldPath: undefined,
        kind: 'modified',
        staged: true,
        unstaged: false,
        conflicted: false
      },
      {
        path: 'src/working.ts',
        oldPath: undefined,
        kind: 'modified',
        staged: false,
        unstaged: true,
        conflicted: false
      }
    ])
  })
})

describe('parseLog', () => {
  it('parses commit records and decorations', () => {
    const output = [
      'abcdef\x1fabcdef\x1fAlice\x1falice@example.com\x1f2026-08-11T10:00:00+08:00\x1fInitial commit\x1fHEAD -> main, origin/main\x1e'
    ].join('')

    expect(parseLog(output)).toEqual([
      {
        hash: 'abcdef',
        shortHash: 'abcdef',
        author: 'Alice',
        email: 'alice@example.com',
        date: '2026-08-11T10:00:00+08:00',
        subject: 'Initial commit',
        refs: ['HEAD -> main', 'origin/main']
      }
    ])
  })
})

describe('parseBranches', () => {
  it('distinguishes local and remote refs', () => {
    const output = [
      'main\x1frefs/heads/main\x1f*\x1forigin/main\x1fabc1234\x1fLatest',
      'origin/main\x1frefs/remotes/origin/main\x1f \x1f\x1fabc1234\x1fLatest'
    ].join('\n')

    expect(parseBranches(output)).toEqual([
      {
        name: 'main',
        current: true,
        remote: false,
        upstream: 'origin/main',
        hash: 'abc1234',
        subject: 'Latest'
      },
      {
        name: 'origin/main',
        current: false,
        remote: true,
        upstream: undefined,
        hash: 'abc1234',
        subject: 'Latest'
      }
    ])
  })
})

describe('parseBlame', () => {
  it('maps porcelain metadata to individual source lines', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567'
    const output = [
      `${hash} 1 7 1`,
      'author Alice',
      'author-time 1786413600',
      '\tconst answer = 42',
      ''
    ].join('\n')

    expect(parseBlame(output)).toEqual([{
      hash,
      author: 'Alice',
      date: '2026-08-11T02:00:00.000Z',
      lineNumber: 7,
      content: 'const answer = 42'
    }])
  })
})

describe('parseRevisionFiles', () => {
  it('parses ordinary changes and rename pairs from nul-separated output', () => {
    const output = ['M', 'src/app.ts', 'A', 'README.md', 'R100', 'old.ts', 'new.ts', ''].join('\0')
    expect(parseRevisionFiles(output)).toEqual([
      { kind: 'M', path: 'src/app.ts' },
      { kind: 'A', path: 'README.md' },
      { kind: 'R', path: 'new.ts', oldPath: 'old.ts' }
    ])
  })
})

describe('parseStashes', () => {
  it('parses stash refs and subjects', () => {
    const output = 'stash@{0}\x1f012345\x1f2026-08-11T12:00:00+08:00\x1fOn main: work in progress\x1e'
    expect(parseStashes(output)).toEqual([{
      ref: 'stash@{0}',
      hash: '012345',
      date: '2026-08-11T12:00:00+08:00',
      subject: 'On main: work in progress'
    }])
  })
})

describe('parseReflog', () => {
  it('parses reflog selectors and operations', () => {
    const output = '0123456789\x1f0123456\x1fHEAD@{0}\x1f2026-08-11T12:00:00+08:00\x1fcommit: feature\x1e'
    expect(parseReflog(output)).toEqual([{
      hash: '0123456789',
      shortHash: '0123456',
      selector: 'HEAD@{0}',
      date: '2026-08-11T12:00:00+08:00',
      subject: 'commit: feature'
    }])
  })
})
