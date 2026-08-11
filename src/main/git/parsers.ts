import type { BranchInfo, ChangeKind, CommitInfo, FileChange } from '../../shared/types'

function kindFromCode(code: string): ChangeKind {
  if (code.includes('U') || code === 'AA' || code === 'DD') return 'conflicted'
  if (code.includes('R')) return 'renamed'
  if (code.includes('C')) return 'copied'
  if (code.includes('A')) return 'added'
  if (code.includes('D')) return 'deleted'
  return 'modified'
}

export function parsePorcelainV2(output: string): FileChange[] {
  const records = output.split('\0')
  const changes: FileChange[] = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record || record.startsWith('#') || record.startsWith('! ')) continue

    if (record.startsWith('? ')) {
      changes.push({
        path: record.slice(2),
        kind: 'untracked',
        staged: false,
        unstaged: true,
        conflicted: false
      })
      continue
    }

    if (record.startsWith('u ')) {
      const fields = record.split(' ')
      changes.push({
        path: fields.slice(10).join(' '),
        kind: 'conflicted',
        staged: true,
        unstaged: true,
        conflicted: true
      })
      continue
    }

    if (record.startsWith('1 ') || record.startsWith('2 ')) {
      const renamed = record.startsWith('2 ')
      const fields = record.split(' ')
      const xy = fields[1]
      const pathIndex = renamed ? 9 : 8
      const filePath = fields.slice(pathIndex).join(' ')
      const oldPath = renamed ? records[index + 1] : undefined
      if (renamed) index += 1
      changes.push({
        path: filePath,
        oldPath,
        kind: kindFromCode(xy),
        staged: xy[0] !== '.',
        unstaged: xy[1] !== '.',
        conflicted: xy.includes('U')
      })
    }
  }

  return changes.sort((left, right) => left.path.localeCompare(right.path))
}

export function parseLog(output: string): CommitInfo[] {
  return output
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, shortHash, author, email, date, subject, decoration = ''] = record.split('\x1f')
      return {
        hash,
        shortHash,
        author,
        email,
        date,
        subject,
        refs: decoration
          .split(',')
          .map((ref) => ref.trim())
          .filter(Boolean)
      }
    })
}

export function parseBranches(output: string): BranchInfo[] {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [name, fullName, head, upstream, hash, subject] = line.split('\x1f')
      return {
        name,
        current: head === '*',
        remote: fullName.startsWith('refs/remotes/'),
        upstream: upstream || undefined,
        hash,
        subject
      }
    })
}
