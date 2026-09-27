import { diffComm } from 'node-diff3'

export type DiffPart = { kind: 'same' | 'add' | 'del'; text: string }

/** Words, runs of whitespace and single punctuation marks, so a diff reads like a proofread. */
function tokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? []
}

/** Word-level diff of `before` → `after` for showing an AI edit; adjacent parts are merged. */
export function diffWords(before: string, after: string): DiffPart[] {
  const parts: DiffPart[] = []
  const push = (kind: DiffPart['kind'], list: readonly string[]) => {
    const text = list.join('')
    if (!text) return
    const last = parts.at(-1)
    if (last?.kind === kind) last.text += text
    else parts.push({ kind, text })
  }
  const chunks = diffComm(tokens(before), tokens(after)) as (
    | { common: string[] }
    | { buffer1: string[]; buffer2: string[] }
  )[]
  for (const c of chunks) {
    if ('common' in c) push('same', c.common)
    else {
      push('del', c.buffer1)
      push('add', c.buffer2)
    }
  }
  return parts
}

/**
 * A line diff: whole lines kept, removed or added (each with its line break). Clearer than a word
 * diff when two versions of a note changed the same lines differently.
 */
export function diffLines(before: string, after: string): DiffPart[] {
  const out: DiffPart[] = []
  const push = (kind: DiffPart['kind'], lines: string[]) => {
    if (lines.length) out.push({ kind, text: `${lines.join('\n')}\n` })
  }
  for (const part of diffComm(before.split('\n'), after.split('\n'))) {
    if (part.common) push('same', part.common)
    else {
      push('del', part.buffer1 ?? [])
      push('add', part.buffer2 ?? [])
    }
  }
  return out
}
