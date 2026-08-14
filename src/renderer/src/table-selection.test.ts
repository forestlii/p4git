import { describe, expect, it } from 'vitest'
import { contextSelection } from './table-selection'

describe('table context selection', () => {
  it('preserves every selected row when opening the menu on one selected row', () => {
    expect([...contextSelection(new Set(['first', 'second', 'third']), 'second')]).toEqual([
      'first',
      'second',
      'third'
    ])
  })

  it('focuses only the clicked row when it was outside the selection', () => {
    expect([...contextSelection(new Set(['first', 'second']), 'third')]).toEqual(['third'])
  })
})
