export function contextSelection(selected: ReadonlySet<string>, key: string): Set<string> {
  return selected.has(key) ? new Set(selected) : new Set([key])
}
