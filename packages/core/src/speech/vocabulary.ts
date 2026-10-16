/** How many words of the person's own go into a speech prompt. */
const MAX_WORDS = 40

/** Capitalized words, including names with a hyphen or a digit ("Санкт-Петербург", "iPhone 15"). */
const WORD = /(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{N}]*(?:-[\p{L}\p{N}]+)*/gu
/** A word right after the start of a line or a sentence is capitalized for that reason only. */
const SENTENCE_START = /(?:^|[.!?…]\s+|\n)\s*(?:- \[[ xX]\]\s*|[-*>#]+\s*|\d+[.)]\s*)?$/u

/**
 * Words a speech model should know spelled the person's way: folder names, then the names
 * (people, places, products) that come up most in their notes. Kept on the device; it only
 * steers how the model spells what it hears.
 */
export function speechVocabulary(texts: readonly string[], folders: readonly string[]): string[] {
  const out = new Map<string, number>()
  for (const name of folders) {
    const clean = name.trim()
    if (clean && clean.length <= 40) out.set(clean, Infinity)
  }
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const match of text.matchAll(WORD)) {
      const word = match[0]
      if (word.length < 3) continue
      if (SENTENCE_START.test(text.slice(Math.max(0, match.index - 8), match.index))) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  for (const [word, n] of counts) if (n >= 2 && !out.has(word)) out.set(word, n)
  return [...out.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_WORDS)
    .map(([word]) => word)
}

/**
 * What a speech model is told before a piece: the person's words, then the end of what was said
 * so far (spelling, punctuation and names stay consistent from piece to piece).
 */
export function speechPrompt(
  vocabulary: readonly string[],
  before: string,
  maxChars = 300,
): string {
  let words = before.trim()
  // Cut to whole words.
  if (words.length > maxChars) words = words.slice(words.length - maxChars).replace(/^\S*\s+/u, '')
  const glossary = vocabulary.length ? `${vocabulary.join(', ')}.` : ''
  return [glossary, words].filter(Boolean).join(' ')
}
