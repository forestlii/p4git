export type FilterMode = 'contains' | 'prefix' | 'regex'

export function makeFilterExpression(query: string, mode: FilterMode, caseSensitive: boolean): string {
  return `${caseSensitive ? 'case' : 'nocase'}:${mode}:${query}`
}

export function filterQuery(expression: string): string {
  const withoutCase = expression.replace(/^(?:case|nocase):/, '')
  const separator = withoutCase.indexOf(':')
  return separator >= 0 ? withoutCase.slice(separator + 1) : withoutCase
}

export function filterError(expression: string): string | undefined {
  const withoutCase = expression.replace(/^(?:case|nocase):/, '')
  const separator = withoutCase.indexOf(':')
  const mode = separator >= 0 ? withoutCase.slice(0, separator) : 'contains'
  const query = filterQuery(expression)
  if (mode !== 'regex' || !query) return undefined
  try {
    new RegExp(query)
    return undefined
  } catch (error) {
    return error instanceof Error ? `Invalid regular expression: ${error.message}` : 'Invalid regular expression.'
  }
}

export function matchesFilter(values: string | Array<string | undefined>, expression: string): boolean {
  const fields = (Array.isArray(values) ? values : [values]).filter((value): value is string => typeof value === 'string')
  const caseSensitive = expression.startsWith('case:')
  const withoutCase = expression.replace(/^(?:case|nocase):/, '')
  const separator = withoutCase.indexOf(':')
  const mode = separator >= 0 ? withoutCase.slice(0, separator) : 'contains'
  const query = separator >= 0 ? withoutCase.slice(separator + 1) : withoutCase
  if (!query) return true
  if (mode === 'regex') {
    try {
      const pattern = new RegExp(query, caseSensitive ? '' : 'i')
      return fields.some((value) => pattern.test(value))
    } catch {
      return false
    }
  }
  const needle = caseSensitive ? query : query.toLowerCase()
  return fields.some((value) => {
    const haystack = caseSensitive ? value : value.toLowerCase()
    return mode === 'prefix' ? haystack.startsWith(needle) : haystack.includes(needle)
  })
}
