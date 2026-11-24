import { useUi } from '../app/store'

const editors = new Map<string, () => void>()
const scanned = new Set<string>()
const MAX_SCANNED = 1024
let requested: string | null = null

export function noteWasScanned(noteId: string) {
  return scanned.has(noteId)
}

export function markNoteScanned(noteId: string) {
  if (scanned.size >= MAX_SCANNED) {
    const oldest = scanned.values().next().value
    if (oldest !== undefined) scanned.delete(oldest)
  }
  scanned.add(noteId)
}

export function registerPrivacyReviewer(noteId: string, open: () => void) {
  editors.set(noteId, open)
  return () => {
    if (editors.get(noteId) === open) editors.delete(noteId)
  }
}

export function takePrivacyRequest(noteId: string): boolean {
  if (requested !== noteId) return false
  requested = null
  return true
}

export function requestPrivacyReview(noteId: string) {
  requested = noteId
  useUi.getState().navigate({ kind: 'note', id: noteId })
  editors.get(noteId)?.()
}
