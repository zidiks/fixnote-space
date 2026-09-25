import { merge } from 'node-diff3'

/**
 * Line-based three-way merge. Returns null when both sides changed the same (or adjacent) lines;
 * the caller then keeps both versions instead of guessing.
 */
export function merge3(ours: string, base: string, theirs: string): string | null {
  if (ours === theirs || base === theirs) return ours
  if (base === ours) return theirs
  const result = merge(ours.split('\n'), base.split('\n'), theirs.split('\n'))
  return result.conflict ? null : result.result.join('\n')
}
