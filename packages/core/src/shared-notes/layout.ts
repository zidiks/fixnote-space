import type * as Y from 'yjs'
import type { SqlDriver } from '../platform'

/**
 * A shared folder's layout: its subfolders (by id, with parent and name; parent null is the shared
 * folder itself) and which subfolder each of its notes is in (by shared note id; null is the
 * shared folder itself). Lives in a Yjs document, so two people reorganizing at once both keep
 * their changes. Folder ids are the same on every device (a member's copy of a subfolder takes the
 * id it has in the layout), so the layout needs no mapping.
 */
export interface Layout {
  folders: Record<string, { parent: string | null; name: string }>
  places: Record<string, string | null>
}

export const EMPTY_LAYOUT: Layout = { folders: {}, places: {} }

const FOLDERS = 'folders'
const PLACES = 'places'

export function readLayout(doc: Y.Doc): Layout {
  const folders: Layout['folders'] = {}
  for (const [id, f] of doc.getMap<{ parent: string | null; name: string }>(FOLDERS))
    folders[id] = { parent: f.parent ?? null, name: String(f.name ?? '') }
  const places: Layout['places'] = {}
  for (const [id, at] of doc.getMap<string | null>(PLACES)) places[id] = at ?? null
  return { folders, places }
}

/** What the folder looks like on this device now. */
export interface Reality {
  layout: Layout
  /** Every note of the shared folder here, and whether it is inside it (or was moved out). */
  notes: { sharedId: string; noteId: string; folderId: string | null; inside: boolean }[]
}

export async function readReality(
  db: SqlDriver,
  rootId: string,
  folderSharedId: string,
): Promise<Reality> {
  const rows = await db.query<{ id: string; parent_id: string | null; name: string }>(
    `WITH RECURSIVE sub(id) AS (
        SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
          WHERE f.deleted_at IS NULL)
      SELECT f.id, f.parent_id, f.name FROM folders f JOIN sub ON f.id = sub.id WHERE f.id != ?`,
    [rootId, rootId],
  )
  const inside = new Set([rootId, ...rows.map((r) => r.id)])
  const layout: Layout = { folders: {}, places: {} }
  for (const r of rows)
    layout.folders[r.id] = { parent: r.parent_id === rootId ? null : r.parent_id, name: r.name }
  const notes = (
    await db.query<{ shared_id: string; note_id: string; folder_id: string | null }>(
      `SELECT d.shared_id, d.note_id, n.folder_id FROM shared_docs d
         JOIN notes n ON n.id = d.note_id AND n.deleted_at IS NULL
        WHERE d.folder_shared_id = ?`,
      [folderSharedId],
    )
  ).map((r) => ({
    sharedId: r.shared_id,
    noteId: r.note_id,
    folderId: r.folder_id,
    inside: r.folder_id !== null && inside.has(r.folder_id),
  }))
  for (const n of notes)
    if (n.inside) layout.places[n.sharedId] = n.folderId === rootId ? null : n.folderId
  return { layout, notes }
}

/**
 * Writes what changed here since the layout was last applied (`projected`) into the document:
 * subfolders made, renamed, moved or deleted, notes moved between subfolders. True if anything did.
 */
export function recordLocalChanges(doc: Y.Doc, real: Reality, projected: Layout): boolean {
  const folders = doc.getMap<{ parent: string | null; name: string }>(FOLDERS)
  const places = doc.getMap<string | null>(PLACES)
  let changed = false
  doc.transact(() => {
    for (const [id, f] of Object.entries(real.layout.folders)) {
      const was = projected.folders[id]
      if (!was || was.parent !== f.parent || was.name !== f.name) {
        folders.set(id, f)
        changed = true
      }
    }
    for (const id of Object.keys(projected.folders))
      if (!real.layout.folders[id] && folders.has(id)) {
        folders.delete(id)
        changed = true
      }
    for (const [id, at] of Object.entries(real.layout.places))
      if (!(id in projected.places) || projected.places[id] !== at) {
        places.set(id, at)
        changed = true
      }
    // A note that is gone from the folder altogether (deleted, or moved out by the owner).
    const known = new Set(real.notes.map((n) => n.sharedId))
    for (const id of Object.keys(projected.places))
      if (!known.has(id) && places.has(id)) {
        places.delete(id)
        changed = true
      }
  })
  return changed
}

/**
 * Makes this device's folder match the layout: subfolders made, renamed, moved or removed (their
 * notes go up to the shared folder), notes put in their subfolder. Notes someone who may not take
 * them out moved out come back. A member's subfolders are kept out of their personal sync
 * (`shared_id`); the owner's are their own folders. Returns whether anything changed.
 */
export async function applyLayout(
  db: SqlDriver,
  layout: Layout,
  opts: { rootId: string; folderSharedId: string; member: boolean; now: number },
): Promise<boolean> {
  const { rootId, now } = opts
  const sharedId = opts.member ? opts.folderSharedId : null
  let changed = false

  // Parents that are missing or would make a loop hang from the shared folder itself.
  const parentOf = (id: string): string | null => {
    const seen = new Set([id])
    let at = layout.folders[id]?.parent ?? null
    while (at !== null) {
      if (seen.has(at) || !layout.folders[at]) return null
      seen.add(at)
      at = layout.folders[at]?.parent ?? null
    }
    const parent = layout.folders[id]?.parent ?? null
    return parent && layout.folders[parent] ? parent : null
  }
  const depth = (id: string) => {
    let d = 0
    for (let at = parentOf(id); at !== null && d < 64; at = parentOf(at)) d++
    return d
  }
  const wanted = Object.keys(layout.folders).sort((a, b) => depth(a) - depth(b))

  await db.transaction(async (tx) => {
    for (const id of wanted) {
      const f = layout.folders[id]
      if (!f) continue
      const parent = parentOf(id) ?? rootId
      const [row] = await tx.query<{
        parent_id: string | null
        name: string
        deleted_at: number | null
      }>('SELECT parent_id, name, deleted_at FROM folders WHERE id = ?', [id])
      if (!row) {
        await tx.execute(
          `INSERT INTO folders (id, parent_id, name, sort, created_at, updated_at, shared_id, dirty)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
          [id, parent, f.name, now, now, sharedId, sharedId ? 0 : 1],
        )
        changed = true
      } else if (row.parent_id !== parent || row.name !== f.name || row.deleted_at !== null) {
        await tx.execute(
          `UPDATE folders SET parent_id = ?, name = ?, deleted_at = NULL, updated_at = ?,
                  dirty = CASE WHEN shared_id IS NULL THEN 1 ELSE 0 END, local_rev = local_rev + 1
            WHERE id = ?`,
          [parent, f.name, now, id],
        )
        changed = true
      }
    }

    // Subfolders no longer in the layout: their notes go up to the shared folder.
    const current = await tx.query<{ id: string }>(
      `WITH RECURSIVE sub(id) AS (
          SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
            WHERE f.deleted_at IS NULL)
        SELECT id FROM sub WHERE id != ?`,
      [rootId, rootId],
    )
    for (const { id } of current) {
      if (layout.folders[id]) continue
      await tx.execute(
        `UPDATE notes SET folder_id = ?,
                dirty = CASE WHEN shared_id IS NULL THEN 1 ELSE dirty END, local_rev = local_rev + 1
          WHERE folder_id = ?`,
        [rootId, id],
      )
      await tx.execute(
        `UPDATE folders SET deleted_at = ?, updated_at = ?,
                dirty = CASE WHEN shared_id IS NULL THEN 1 ELSE 0 END, local_rev = local_rev + 1
          WHERE id = ?`,
        [now, now, id],
      )
      changed = true
    }

    // Notes into their subfolder.
    const notes = await tx.query<{ shared_id: string; note_id: string; folder_id: string | null }>(
      `SELECT d.shared_id, d.note_id, n.folder_id FROM shared_docs d
         JOIN notes n ON n.id = d.note_id AND n.deleted_at IS NULL
        WHERE d.folder_shared_id = ?`,
      [opts.folderSharedId],
    )
    const inside = new Set([rootId, ...Object.keys(layout.folders)])
    for (const n of notes) {
      const place = layout.places[n.shared_id]
      let target: string
      if (place === undefined) {
        // Not placed yet (a new note): stays where it is, if that is inside the folder.
        if (n.folder_id && inside.has(n.folder_id)) continue
        target = rootId
      } else target = place && layout.folders[place] ? place : rootId
      if (n.folder_id === target) continue
      await tx.execute('UPDATE notes SET folder_id = ? WHERE id = ?', [target, n.note_id])
      changed = true
    }
  })
  return changed
}
