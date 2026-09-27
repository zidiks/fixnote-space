import { diffComm, merge } from 'node-diff3'

/**
 * Line-based three-way merge. Returns null when both sides changed the same (or adjacent) lines;
 * the caller then keeps both versions instead of guessing.
 */
/**
 * Both texts in one, each line once: lines they share stay where they are, and where they differ
 * the first text's lines come before the second's. No base needed, nothing is dropped.
 */
export function unionLines(a: string, b: string): string {
  const out: string[] = []
  for (const part of diffComm(a.split('\n'), b.split('\n'))) {
    if (part.common) out.push(...part.common)
    else out.push(...(part.buffer1 ?? []), ...(part.buffer2 ?? []))
  }
  return out.join('\n')
}

export function merge3(ours: string, base: string, theirs: string): string | null {
  if (ours === theirs || base === theirs) return ours
  if (base === ours) return theirs
  const result = merge(ours.split('\n'), base.split('\n'), theirs.split('\n'))
  return result.conflict ? null : result.result.join('\n')
}
