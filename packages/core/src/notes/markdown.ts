/** Plain-text helpers over note Markdown. Pure functions; no Markdown parser dependency. */

const FENCE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm

function stripInline(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
    .replace(/<(https?:\/\/[^\s<>]+)>/g, '$1') // <https://…> links
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // wiki links
    .replace(/\s*🔁\s*[\w:,@-]+\s*$/u, '') // a repeating task's rule
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~=|/:])/g, '$1')
}

const TABLE_ROW = /^\s*\|(.*)\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

const cells = (row: string) =>
  row
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim())
    .filter(Boolean)

/**
 * For card previews: each table becomes one line, "▦ " and its header, so a table does not fill
 * the card with numbers.
 */
function tablesAsHeaders(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const row = (lines[i] as string).match(TABLE_ROW)
    if (row && TABLE_RULE.test(lines[i + 1] ?? '')) {
      out.push(`▦ ${cells(row[1] as string).join(' · ')}`)
      i++
      while (i + 1 < lines.length && TABLE_ROW.test(lines[i + 1] as string)) i++
      continue
    }
    out.push(lines[i] as string)
  }
  return out.join('\n')
}

function stripBlock(line: string, tasks: boolean): string {
  // Table rows read as "a · b"; the assistant (`tasks`) keeps the pipes, they show the columns.
  const row = tasks ? null : line.match(TABLE_ROW)
  if (row) return cells(row[1] as string).join(' · ')
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, '') // headings
    .replace(/^\s*>\s?/, '') // quotes
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?/, (_, box?: string) =>
      // list items and tasks; with `tasks`, a task keeps whether it is done
      tasks && box ? (box === ' ' ? '[ ] ' : '[x] ') : '',
    )
    .trim()
}

function plainLines(markdown: string, tasks = false): string[] {
  return markdown
    .replace(FENCE, '')
    .split('\n')
    .filter((l) => !TABLE_RULE.test(l))
    .map((l) => stripInline(stripBlock(l, tasks)))
    .filter((l) => l.length > 0 && !/^([-*_]\s*){3,}$/.test(l))
}

/** The whole note as plain text, one line per block: what full-text search indexes. */
export function toPlainText(markdown: string, opts: { tasks?: boolean } = {}): string {
  // Code blocks stay searchable: keep their contents, drop only the fences.
  const unfenced = markdown.replace(FENCE, (block) => block.split('\n').slice(1, -1).join('\n'))
  return plainLines(unfenced, opts.tasks).join('\n')
}

/** First non-empty line as plain text, Bear-style. Empty string when the note is blank. */
export function deriveTitle(markdown: string, max = 120): string {
  const first = plainLines(markdown)[0] ?? ''
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first
}

/** Plain text after the title line, whitespace collapsed. */
export function deriveExcerpt(markdown: string, max = 240): string {
  const text = plainLines(tablesAsHeaders(markdown)).slice(1).join(' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
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
