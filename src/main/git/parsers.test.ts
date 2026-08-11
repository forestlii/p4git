import { describe, expect, it } from 'vitest'
import { parseBranches, parseLog, parsePorcelainV2 } from './parsers'

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
