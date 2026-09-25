/**
 * Turns free user input into a safe FTS5 query: every word must match as a prefix.
 * Returns null when there is nothing searchable.
 */
export function buildFtsQuery(input: string): string | null {
  const terms = input
    .normalize('NFC')
    .split(/[\s"'`^*()\-:+]+/u)
    .map((t) => t.trim())
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .slice(0, 12)
  if (!terms.length) return null
  return terms.map((t) => `"${t}"*`).join(' ')
}
