import type { Fragment } from '@fixnote/core'

export interface Citation {
  /** The number used in the answer text, 1-based. */
  n: number
  noteId: string
  title: string
  quote: string
}

export type Confidence = 'high' | 'medium' | 'low'

/** Every [n] (also [1, 2] and [1][2]) in the answer that points at a provided fragment. */
export function parseCitations(answer: string, fragments: Fragment[]): Citation[] {
  const seen = new Set<number>()
  const out: Citation[] = []
  for (const m of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const part of (m[1] ?? '').split(',')) {
      const n = Number(part.trim())
      const f = fragments[n - 1]
      if (!f || seen.has(n)) continue
      seen.add(n)
      out.push({ n, noteId: f.noteId, title: f.title, quote: f.text.slice(0, 280) })
    }
  }
  return out.sort((a, b) => a.n - b.n)
}

/**
 * How much to trust an answer: cited fragments that were found by both keyword and meaning are
 * strong evidence; an answer that cites nothing is not grounded at all.
 */
export function confidence(citations: Citation[], fragments: Fragment[]): Confidence {
  if (!citations.length) return 'low'
  const cited = citations.map((c) => fragments[c.n - 1]).filter((f): f is Fragment => !!f)
  if (
    cited.some((f) => f.via.keyword && f.via.semantic) ||
    (cited.length >= 2 && cited.some((f) => f.via.keyword))
  )
    return 'high'
  return 'medium'
}
