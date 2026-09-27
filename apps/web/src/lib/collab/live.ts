import { CollabSession, noteKeyBytes } from '@fixnote/core'
import * as Y from 'yjs'
import { requestSync, sharedContext } from '../account/account'

/** A shared note open in the editor: its live room, and how this person shows up to the others. */
export interface LiveEditing {
  session: CollabSession
  user: { name: string; color: string }
  sharedId: string
  /** A viewer: sees others' edits, cannot edit. */
  readOnly: boolean
  /** Stores the document (with the Markdown the editor wrote for it) and asks sync to send it. */
  persist(markdown: string): Promise<void>
}

/** The Yjs field the editor content lives in. */
export const LIVE_FIELD = 'default'

/** Caret colours, readable on light and dark backgrounds. */
const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131']

const colorFor = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length] as string
}

/**
 * Opens a shared note for editing: its document as stored on this device, joined to the note's
 * live room so edits show as they are typed. Null when signed out or when the note is not shared
 * with this account (any more).
 */
export async function openShared(sharedId: string): Promise<LiveEditing | null> {
  const ctx = sharedContext()
  if (!ctx) return null
  const stored = await ctx.shared.doc(sharedId)
  if (!stored) return null
  const doc = new Y.Doc()
  if (stored.state) Y.applyUpdate(doc, stored.state)
  const readOnly = stored.role === 'view'
  const session = new CollabSession({
    key: noteKeyBytes(stored.noteKey),
    roomId: sharedId,
    transport: ctx.backend.collab(sharedId),
    doc,
    listenOnly: readOnly,
  })
  const user = { name: ctx.email.split('@')[0] || ctx.email, color: colorFor(ctx.userId) }
  session.awareness.setLocalStateField('user', user)
  if (!readOnly) await session.whenSynced(1200)
  return {
    session,
    user,
    sharedId,
    readOnly,
    persist: async (markdown) => {
      await ctx.shared.saveDoc(sharedId, Y.encodeStateAsUpdate(doc), markdown)
      requestSync()
    },
  }
}
