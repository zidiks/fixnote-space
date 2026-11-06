import type { NotesRepo } from '@fixnote/core'

/**
 * Dragging notes from a list onto a folder in the sidebar. The data is the ids only (in a type of
 * our own, so the editor and `DropLayer` leave it alone); the drop reads each note again.
 */
export const NOTE_DRAG_TYPE = 'application/x-fixnote-notes'

export function startNoteDrag(data: DataTransfer, ids: string[]) {
  data.setData(NOTE_DRAG_TYPE, JSON.stringify(ids))
  data.effectAllowed = 'move'
}

/** While dragging only the types can be read, not the data. */
export const isNoteDrag = (data: DataTransfer | null): boolean =>
  data?.types.includes(NOTE_DRAG_TYPE) ?? false

export function draggedNoteIds(data: DataTransfer): string[] {
  try {
    const value: unknown = JSON.parse(data.getData(NOTE_DRAG_TYPE))
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export interface Moved {
  id: string
  from: string | null
}

/**
 * Moves the notes into the folder; ones already there or view only stay. Returns what moved and
 * from where (for Undo). Stops at the first error, after what moved so far.
 */
export async function moveNotes(
  repo: Pick<NotesRepo, 'getNote' | 'moveNote'>,
  ids: string[],
  folderId: string | null,
): Promise<{ moved: Moved[]; error?: unknown }> {
  const moved: Moved[] = []
  try {
    for (const id of ids) {
      const note = await repo.getNote(id)
      if (!note || note.readOnly || note.folderId === folderId) continue
      await repo.moveNote(id, folderId)
      moved.push({ id, from: note.folderId })
    }
  } catch (error) {
    return { moved, error }
  }
  return { moved }
}
