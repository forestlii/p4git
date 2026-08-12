import { describe, expect, it } from 'vitest'
import { characterSegments, parseUnifiedDiff } from './side-by-side-diff'

describe('Beyond Compare-style side-by-side diff model', () => {
  it('aligns replacement, deletion, addition, and context lines', () => {
    const parsed = parseUnifiedDiff('--- a/demo.txt\n+++ b/demo.txt\n@@ -2,4 +2,4 @@\n same\n-old value\n+new value\n-deleted\n kept\n+added\n')
    expect(parsed.leftTitle).toBe('demo.txt')
    expect(parsed.rightTitle).toBe('demo.txt')
    expect(parsed.rows.filter((row) => row.different)).toEqual([
      expect.objectContaining({ left: expect.objectContaining({ line: 3, text: 'old value', tone: 'removed' }), right: expect.objectContaining({ line: 3, text: 'new value', tone: 'added' }) }),
      expect.objectContaining({ left: expect.objectContaining({ line: 4, text: 'deleted', tone: 'removed' }), right: expect.objectContaining({ tone: 'empty' }) }),
      expect.objectContaining({ left: expect.objectContaining({ tone: 'empty' }), right: expect.objectContaining({ line: 5, text: 'added', tone: 'added' }) })
    ])
    expect(parsed.differences).toHaveLength(3)
  })

  it('marks only the changed middle of a modified line', () => {
    expect(characterSegments('hello old world', 'hello new world')).toEqual([
      { text: 'hello ', changed: false },
      { text: 'old', changed: true },
      { text: ' world', changed: false }
    ])
  })

  it('preserves binary and error messages that are not unified diffs', () => {
    expect(parseUnifiedDiff('Binary file — preview is not available.').message).toContain('Binary file')
  })
})
