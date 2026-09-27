/**
 * Folders in tree order with their depth, for flat lists (menus, pickers) that should still show
 * which folder sits inside which. Siblings keep the order they come in; a folder whose parent is
 * missing is shown at the top level.
 */
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
