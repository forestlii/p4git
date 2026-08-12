import { describe, expect, it } from 'vitest'
import { clampDialogTranslation } from './dialog-drag'

describe('draggable secondary dialogs', () => {
  it('moves freely while keeping the dialog inside the viewport', () => {
    const rectangle = { left: 200, top: 100, right: 800, bottom: 500 }
    const viewport = { width: 1000, height: 700 }
    expect(clampDialogTranslation({ x: 0, y: 0 }, { x: 75, y: 40 }, rectangle, viewport)).toEqual({ x: 75, y: 40 })
    expect(clampDialogTranslation({ x: 0, y: 0 }, { x: -500, y: -300 }, rectangle, viewport)).toEqual({ x: -200, y: -100 })
    expect(clampDialogTranslation({ x: 0, y: 0 }, { x: 500, y: 400 }, rectangle, viewport)).toEqual({ x: 200, y: 200 })
  })

  it('adds movement to an existing translated position', () => {
    expect(clampDialogTranslation(
      { x: 30, y: -20 },
      { x: 25, y: 10 },
      { left: 230, top: 80, right: 830, bottom: 480 },
      { width: 1000, height: 700 }
    )).toEqual({ x: 55, y: -10 })
  })
})
