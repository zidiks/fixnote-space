/**
 * Notes open in an editor right now, so a change the assistant makes to one shows there as it
 * happens (typed in, marked) instead of the note jumping to its new text on the next refresh.
 */
export interface OpenNote {
  /** The assistant starts changing this note (in a shared note, the others see it at work). */
  aiStarts(): void
  /**
   * The note's text became `after` (already stored). False when the editor cannot show it now
   * (unsaved typing): the usual merge on save brings it in then.
   */
  aiChanged(after: string): boolean
  /** The assistant is done with this note for now. */
  aiEnds(): void
}

const open = new Map<string, OpenNote>()

export function registerOpenNote(noteId: string, note: OpenNote): () => void {
  open.set(noteId, note)
  return () => {
    if (open.get(noteId) === note) open.delete(noteId)
  }
}

export const openNote = (noteId: string): OpenNote | undefined => open.get(noteId)
