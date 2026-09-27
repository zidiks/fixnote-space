/**
 * Folders in tree order with their depth, for flat lists (menus, pickers) that should still show
 * which folder sits inside which. Siblings keep the order they come in; a folder whose parent is
 * missing is shown at the top level.
 */
/** Notes in each folder counting its subfolders, at any depth (from each folder's own count). */
export function subtreeCounts(
  folders: readonly { id: string; parentId: string | null; noteCount: number }[],
): Map<string, number> {
  const parent = new Map(folders.map((f) => [f.id, f.parentId]))
  const total = new Map(folders.map((f) => [f.id, 0]))
  for (const f of folders) {
    // Add the folder's own notes to it and every folder above it (a cycle stops the climb).
    const seen = new Set<string>()
    for (let at: string | null | undefined = f.id; at && !seen.has(at); at = parent.get(at)) {
      seen.add(at)
      total.set(at, (total.get(at) ?? 0) + f.noteCount)
    }
  }
  return total
}

export function folderTree<F extends { id: string; parentId: string | null }>(
  folders: readonly F[],
): { folder: F; depth: number }[] {
  const ids = new Set(folders.map((f) => f.id))
  const children = new Map<string | null, F[]>()
  for (const f of folders) {
    const parent = f.parentId !== null && ids.has(f.parentId) ? f.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), f])
  }
  const out: { folder: F; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      out.push({ folder: f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  // Folders caught in a cycle (only possible with broken data) still show up, at the top.
  for (const f of folders) {
    if (seen.has(f.id)) continue
    seen.add(f.id)
    out.push({ folder: f, depth: 0 })
    walk(f.id, 1)
  }
  return out
}
