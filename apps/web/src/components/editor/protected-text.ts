import type { Node as PmNode } from '@tiptap/pm/model'
import type { ScanRange } from './privacy-scan'

/** Preserve both paragraph boundaries and Shift+Enter when saving or copying a fragment. */
export function protectedRangeText(doc: PmNode, { from, to }: ScanRange): string {
  return doc.textBetween(from, to, '\n', (node) => (node.type.name === 'hardBreak' ? '\n' : ''))
}
