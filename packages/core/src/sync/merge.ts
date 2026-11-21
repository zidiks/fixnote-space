import { diffComm, merge } from 'node-diff3'

function changedLines(base: string[], next: string[]) {
  let from = 0
  while (from < base.length && from < next.length && base[from] === next[from]) from++
  let to = base.length
  let end = next.length
  while (to > from && end > from && base[to - 1] === next[end - 1]) {
    to--
    end--
  }
  return { from, to, insert: next.slice(from, end) }
}

/** Hunt–McIlroy LCS can take seconds on thousands of repeated/blank transcript lines. Bound
 * candidate comparisons before calling it. A hard case keeps both versions, never drops text.
 */
function withinBudget(a: string[], b: string[]): boolean {
  const counts = new Map<string, number>()
  for (const line of b) counts.set(line, (counts.get(line) ?? 0) + 1)
  const candidates = Math.min(a.length, b.length) + 1
  let cost = 0
  for (const line of a) {
    cost += (counts.get(line) ?? 0) * candidates
    if (cost > 2_000_000) return false
  }
  return true
}

/**
 * Both texts in one: common lines stay where they are, differing lines from the first text go
 * before the second's. A pathological middle keeps both chunks, possibly duplicating common
 * lines. No base needed, nothing is dropped.
 */
export function unionLines(a: string, b: string): string {
  if (a === b) return a
  const left = a.split('\n')
  const right = b.split('\n')
  const range = changedLines(left, right)
  const tail = left.length - range.to
  const mine = left.slice(range.from, range.to)
  const theirs = right.slice(range.from, right.length - tail)
  const out: string[] = []
  // For a pathological middle, retain both chunks verbatim; duplicate lines are preferable to
  // freezing the app or losing an entry when consolidating daily notes.
  const parts = withinBudget(mine, theirs)
    ? diffComm(mine, theirs)
    : [{ buffer1: mine, buffer2: theirs }]
  for (const part of parts) {
    if (part.common) out.push(...part.common)
    else out.push(...(part.buffer1 ?? []), ...(part.buffer2 ?? []))
  }
  return [...left.slice(0, range.from), ...out, ...left.slice(range.to)].join('\n')
}

/**
 * Line-based three-way merge. null asks the caller to preserve a conflict copy (also when a
 * pathological diff would exceed the synchronous work budget).
 */
export function merge3(ours: string, base: string, theirs: string): string | null {
  if (ours === theirs || base === theirs) return ours
  if (base === ours) return theirs
  const original = base.split('\n')
  const mine = ours.split('\n')
  const other = theirs.split('\n')
  const a = changedLines(original, mine)
  const b = changedLines(original, other)
  // Disjoint contiguous edits need no LCS, however long or repetitive the unchanged text is.
  const [first, second] = a.from <= b.from ? [a, b] : [b, a]
  if (first.to < second.from)
    return [
      ...original.slice(0, first.from),
      ...first.insert,
      ...original.slice(first.to, second.from),
      ...second.insert,
      ...original.slice(second.to),
    ].join('\n')
  // Remove context shared by all three versions before the general merge.
  const from = Math.min(a.from, b.from)
  const to = Math.max(a.to, b.to)
  const tail = original.length - to
  const o = original.slice(from, to)
  const m = mine.slice(from, mine.length - tail)
  const t = other.slice(from, other.length - tail)
  if (!withinBudget(m, o) || !withinBudget(t, o)) return null
  const result = merge(m, o, t)
  return result.conflict
    ? null
    : [...original.slice(0, from), ...result.result, ...original.slice(to)].join('\n')
}
