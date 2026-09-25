import { toPlainText } from '../notes/markdown'

export interface Chunk {
  ord: number
  /** Plain text of the passage: what gets embedded and quoted back to the user. */
  text: string
}

const TARGET = 800
const HARD_MAX = 1200
/** A passage this short (a heading, a one-liner) joins the next block rather than standing alone. */
const MIN_ALONE = 200

function splitLong(text: string): string[] {
  if (text.length <= HARD_MAX) return [text]
  const sentences = text.match(/[^.!?…\n]+[.!?…]*\s*/gu) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (cur && cur.length + s.length > TARGET) {
      out.push(cur.trim())
      cur = ''
    }
    // A single run-on "sentence" longer than the limit is cut hard.
    for (let i = 0; i < s.length; i += HARD_MAX) cur += s.slice(i, i + HARD_MAX)
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/**
 * Passages of roughly one screen: consecutive blocks (paragraphs, lists, headings) are packed
 * together until ~800 characters; a short block such as a heading stays with the text after it.
 */
export function chunkNote(markdown: string): Chunk[] {
  const blocks = markdown
    .split(/\n\s*\n/)
    .map((b) => toPlainText(b).trim())
    .filter(Boolean)
    .flatMap(splitLong)
  const chunks: Chunk[] = []
  let cur = ''
  for (const block of blocks) {
    const size = cur.length + block.length + 1
    if (cur && size > TARGET && (cur.length >= MIN_ALONE || size > HARD_MAX)) {
      chunks.push({ ord: chunks.length, text: cur })
      cur = ''
    }
    cur = cur ? `${cur}\n${block}` : block
  }
  if (cur) chunks.push({ ord: chunks.length, text: cur })
  return chunks
}

/** Short, stable fingerprint (cyrb53) to notice changed content without keeping a copy. */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
