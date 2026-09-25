import { transliterate } from './translit'

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
  // Each word must match, in either script: ("телеграм"* OR "telegram"*) AND …
  return terms
    .map((t) => {
      const other = t.length >= 3 ? transliterate(t) : null
      return other ? `("${t}"* OR "${other}"*)` : `"${t}"*`
    })
    .join(' AND ')
}
