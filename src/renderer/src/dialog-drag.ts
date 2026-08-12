export interface Point {
  x: number
  y: number
}

export interface Rectangle {
  left: number
  top: number
  right: number
  bottom: number
}

export function clampDialogTranslation(
  base: Point,
  delta: Point,
  rectangle: Rectangle,
  viewport: { width: number; height: number }
): Point {
  const clamp = (value: number, minimum: number, maximum: number): number =>
    Math.min(Math.max(value, minimum), maximum)
  return {
    x: base.x + clamp(delta.x, -rectangle.left, viewport.width - rectangle.right),
    y: base.y + clamp(delta.y, -rectangle.top, viewport.height - rectangle.bottom)
  }
}
