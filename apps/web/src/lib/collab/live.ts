import { CollabSession, noteKeyBytes } from '@fixnote/core'
import * as Y from 'yjs'
import { requestSync, sharedContext } from '../account/account'
import { colorFor, type LiveUser } from './people'

/** A shared note open in the editor: its live room, and how this person shows up to the others. */
export interface LiveEditing {
  session: CollabSession
  user: LiveUser
  sharedId: string
  /** A viewer: sees others' edits, cannot edit. */
  readOnly: boolean
  /** Stores the document (with the Markdown the editor wrote for it) and asks sync to send it. */
  persist(markdown: string): Promise<void>
  /**
   * Takes in the stored document after sync brought the server's copy. A viewer cannot ask the
   * room for what it missed (it may not send), so this is how it catches up; for editors it is a
   * harmless merge.
   */
  refresh(): Promise<void>
}

/** The Yjs field the editor content lives in. */
export const LIVE_FIELD = 'default'

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
  const user: LiveUser = {
    name: ctx.email.split('@')[0] || ctx.email,
    email: ctx.email,
    color: colorFor(ctx.userId),
    role: stored.role,
  }
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
    refresh: async () => {
      const now = await ctx.shared.doc(sharedId)
      if (now?.state) Y.applyUpdate(doc, now.state, 'stored')
    },
  }
}
