import type { SecretCandidate } from '@fixnote/core/privacy/detect'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'

export interface ScanRange {
  from: number
  to: number
}

export type NoteCandidate = ScanRange & Pick<SecretCandidate, 'kind'>

const BATCH_SIZE = 32 * 1024
// Retain the context of a field or multi-line key across scan windows.
const OVERLAP = 8 * 1024

export function changedScanRange(tr: Transaction): ScanRange | null {
  let from = tr.doc.content.size
  let to = 0
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1)
    map.forEach((_a, _b, start, end) => {
      from = Math.min(from, rest.map(start, -1))
      to = Math.max(to, rest.map(end, 1))
    })
  })
  return from <= to ? { from, to } : null
}

export function scanContext(doc: PmNode, range: ScanRange): ScanRange {
  const left = doc.resolve(Math.max(0, range.from - OVERLAP))
  const right = doc.resolve(Math.min(doc.content.size, range.to + OVERLAP))
  // Keep complete fields when the context boundary lands inside a text block.
  return {
    from: left.parent.isTextblock ? left.start() : left.pos,
    to: right.parent.isTextblock ? right.end() : right.pos,
  }
}

/**
 * A bounded text projection with a reversible mapping to editor positions. Formatting
 * marks are transparent, inline atoms break matches, and block boundaries become newlines.
 */
export function projectScanText(doc: PmNode, from: number, to: number) {
  const parts: string[] = []
  const segments: { at: number; pos: number; length: number }[] = []
  let length = 0
  const append = (text: string, pos?: number) => {
    if (!text) return
    if (pos !== undefined) segments.push({ at: length, pos, length: text.length })
    parts.push(text)
    length += text.length
  }
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock && pos >= from && length) append('\n')
    if (node.isText && node.text) {
      const start = Math.max(from, pos)
      append(node.text.slice(start - pos, to - pos), start)
    } else if (node.isLeaf) append(node.type.name === 'hardBreak' ? '\n' : '\n\n')
  })
  const positionAt = (offset: number) => {
    let left = 0
    let right = segments.length - 1
    while (left <= right) {
      const mid = (left + right) >>> 1
      const segment = segments[mid]
      if (!segment) break
      if (offset < segment.at) right = mid - 1
      else if (offset >= segment.at + segment.length) left = mid + 1
      else return segment.pos + offset - segment.at
    }
    return null
  }
  return { text: maskProtectedReferences(parts.join('')), positionAt }
}

export async function scanNoteRange(
  doc: PmNode,
  range: ScanRange,
  scan: (text: string) => Promise<SecretCandidate[]>,
  current: () => boolean,
): Promise<NoteCandidate[]> {
  const candidates = new Map<string, NoteCandidate>()
  for (let pos = range.from; pos < range.to && current(); pos += BATCH_SIZE) {
    const start = Math.max(0, pos - OVERLAP)
    const end = Math.min(doc.content.size, pos + BATCH_SIZE + OVERLAP)
    const batch = projectScanText(doc, start, end)
    for (const hit of await scan(batch.text)) {
      const from = batch.positionAt(hit.from)
      const last = batch.positionAt(hit.to - 1)
      if (from === null || last === null || last < from) continue
      if (last < range.from || from >= range.to) continue
      // Don't offer a suffix or prefix of a value cut by the scan window.
      if ((start > 0 && hit.from === 0) || (end < doc.content.size && hit.to === batch.text.length))
        continue
      candidates.set(String(from), { from, to: last + 1, kind: hit.kind })
    }
  }
  return [...candidates.values()].sort((a, b) => a.from - b.from || b.to - a.to)
}

import { maskProtectedReferences } from '@fixnote/core'
