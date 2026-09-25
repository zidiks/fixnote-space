/** Plain-text helpers over note Markdown. Pure functions; no Markdown parser dependency. */

const FENCE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm
const INLINE_CODE = /`[^`\n]*`/g

function stripInline(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // wiki links
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~=|])/g, '$1')
}

function stripBlock(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, '') // headings
    .replace(/^\s*>\s?/, '') // quotes
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '') // list items and tasks
    .trim()
}

function plainLines(markdown: string): string[] {
  return markdown
    .replace(FENCE, '')
    .split('\n')
    .map((l) => stripInline(stripBlock(l)))
    .filter((l) => l.length > 0 && !/^([-*_]\s*){3,}$/.test(l))
}

/** The whole note as plain text, one line per block: what full-text search indexes. */
export function toPlainText(markdown: string): string {
  // Code blocks stay searchable: keep their contents, drop only the fences.
  const unfenced = markdown.replace(FENCE, (block) => block.split('\n').slice(1, -1).join('\n'))
  return plainLines(unfenced).join('\n')
}

/** First non-empty line as plain text, Bear-style. Empty string when the note is blank. */
export function deriveTitle(markdown: string, max = 120): string {
  const first = plainLines(markdown)[0] ?? ''
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first
}

/** Plain text after the title line, whitespace collapsed. */
export function deriveExcerpt(markdown: string, max = 240): string {
  const text = plainLines(markdown).slice(1).join(' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

const TAG = /(^|[\s(,;])\\?#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu

/**
 * `#tag` and nested `#area/project` tags, Bear-style. Ignores headings (`# Title`), code, URL
 * fragments and pure numbers like `#123`. Returns unique names in first-seen order.
 */
export function extractTags(markdown: string): string[] {
  const text = markdown.replace(FENCE, ' ').replace(INLINE_CODE, ' ')
  const seen = new Map<string, string>()
  for (const m of text.matchAll(TAG)) {
    const name = (m[2] ?? '').replace(/[/-]+$/, '')
    if (!name || /^\d+$/.test(name)) continue
    const key = name.toLocaleLowerCase()
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()]
}

/** Checkbox progress, or null when the note has no task items. */
export function taskProgress(markdown: string): { done: number; total: number } | null {
  const text = markdown.replace(FENCE, '')
  let done = 0
  let total = 0
  for (const m of text.matchAll(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/gm)) {
    total++
    if (m[1] !== ' ') done++
  }
  return total ? { done, total } : null
}
