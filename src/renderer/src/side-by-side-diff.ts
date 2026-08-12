export type DiffTone = 'context' | 'removed' | 'added' | 'empty'

export interface DiffCell {
  line?: number
  text: string
  tone: DiffTone
}

export interface SideBySideRow {
  kind: 'header' | 'line'
  header?: string
  left: DiffCell
  right: DiffCell
  different: boolean
}

export interface ParsedSideBySideDiff {
  leftTitle: string
  rightTitle: string
  rows: SideBySideRow[]
  differences: number[]
  message?: string
}

export interface CharacterSegment {
  text: string
  changed: boolean
}

function titleFromHeader(line: string, fallback: string): string {
  const value = line.slice(4).split('\t')[0].trim()
  return value && value !== '/dev/null' ? value.replace(/^a\//, '').replace(/^b\//, '') : fallback
}

export function characterSegments(value: string, other: string): CharacterSegment[] {
  if (!value) return []
  let prefix = 0
  while (prefix < value.length && prefix < other.length && value[prefix] === other[prefix]) prefix += 1
  let suffix = 0
  while (suffix < value.length - prefix && suffix < other.length - prefix && value[value.length - 1 - suffix] === other[other.length - 1 - suffix]) suffix += 1
  const result: CharacterSegment[] = []
  if (prefix) result.push({ text: value.slice(0, prefix), changed: false })
  const middleEnd = suffix ? value.length - suffix : value.length
  if (middleEnd > prefix) result.push({ text: value.slice(prefix, middleEnd), changed: true })
  if (suffix) result.push({ text: value.slice(value.length - suffix), changed: false })
  return result
}

export function parseUnifiedDiff(content: string): ParsedSideBySideDiff {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let leftTitle = 'Previous'
  let rightTitle = 'Current'
  for (const line of lines) {
    if (line.startsWith('--- ')) leftTitle = titleFromHeader(line, 'Empty')
    else if (line.startsWith('+++ ')) rightTitle = titleFromHeader(line, 'Empty')
  }
  const rows: SideBySideRow[] = []
  let leftLine = 0
  let rightLine = 0
  let inHunk = false
  let removed: Array<{ line: number; text: string }> = []
  let added: Array<{ line: number; text: string }> = []

  const flushChanges = (): void => {
    const count = Math.max(removed.length, added.length)
    for (let index = 0; index < count; index += 1) {
      const left = removed[index]
      const right = added[index]
      rows.push({
        kind: 'line',
        left: left ? { line: left.line, text: left.text, tone: 'removed' } : { text: '', tone: 'empty' },
        right: right ? { line: right.line, text: right.text, tone: 'added' } : { text: '', tone: 'empty' },
        different: true
      })
    }
    removed = []
    added = []
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flushChanges()
      inHunk = false
      rows.push({ kind: 'header', header: line.slice('diff --git '.length), left: { text: '', tone: 'empty' }, right: { text: '', tone: 'empty' }, different: false })
      continue
    }
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/)
    if (hunk) {
      flushChanges()
      inHunk = true
      leftLine = Number(hunk[1])
      rightLine = Number(hunk[2])
      rows.push({ kind: 'header', header: line, left: { text: '', tone: 'empty' }, right: { text: '', tone: 'empty' }, different: false })
      continue
    }
    if (!inHunk) {
      if (/^(Binary files |GIT binary patch)/.test(line)) rows.push({ kind: 'header', header: line, left: { text: '', tone: 'empty' }, right: { text: '', tone: 'empty' }, different: false })
      continue
    }
    if (line.startsWith('\\ No newline at end of file')) continue
    if (line.startsWith('-')) {
      removed.push({ line: leftLine++, text: line.slice(1) })
      continue
    }
    if (line.startsWith('+')) {
      added.push({ line: rightLine++, text: line.slice(1) })
      continue
    }
    flushChanges()
    if (line.startsWith(' ')) {
      const text = line.slice(1)
      rows.push({ kind: 'line', left: { line: leftLine++, text, tone: 'context' }, right: { line: rightLine++, text, tone: 'context' }, different: false })
    }
  }
  flushChanges()
  const differences = rows.flatMap((row, index) => row.different ? [index] : [])
  const trimmed = content.trim()
  return {
    leftTitle,
    rightTitle,
    rows,
    differences,
    message: rows.length ? undefined : trimmed || 'No textual differences.'
  }
}
