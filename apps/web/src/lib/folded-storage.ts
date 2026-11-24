export const FOLDED_STORAGE_PREFIX = 'fixnote.folded-lists:'

/** Removes persisted folded-list positions for a deleted note. */
export function clearFoldedPositions(noteId: string): void {
  try {
    localStorage.removeItem(FOLDED_STORAGE_PREFIX + noteId)
  } catch {
    // Storage disabled or unavailable.
  }
}
