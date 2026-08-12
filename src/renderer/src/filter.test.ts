import { describe, expect, it } from 'vitest'
import { filterError, makeFilterExpression, matchesFilter } from './filter'

describe('active-tab filtering', () => {
  it('matches contains and case sensitivity across visible fields', () => {
    expect(matchesFilter(['src/file.ts', 'Alice', 'Fix Audio'], makeFilterExpression('audio', 'contains', false))).toBe(true)
    expect(matchesFilter(['src/file.ts', 'Alice', 'Fix Audio'], makeFilterExpression('audio', 'contains', true))).toBe(false)
  })

  it('applies starts-with to every field rather than only the first concatenated value', () => {
    expect(matchesFilter(['a1b2c3', 'Forest Lii', 'Feature'], makeFilterExpression('For', 'prefix', true))).toBe(true)
    expect(matchesFilter(['a1b2c3', 'Forest Lii', 'Feature'], makeFilterExpression('Lii', 'prefix', true))).toBe(false)
  })

  it('supports regular expressions and reports invalid patterns', () => {
    expect(matchesFilter(['feature/audio'], makeFilterExpression('feature/.+', 'regex', false))).toBe(true)
    expect(filterError(makeFilterExpression('[', 'regex', false))).toContain('Invalid regular expression')
  })
})
