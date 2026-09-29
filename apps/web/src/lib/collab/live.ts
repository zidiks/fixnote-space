import { CollabSession, noteKeyBytes } from '@fixnote/core'
import * as Y from 'yjs'
import { requestSync, sharedContext } from '../account/account'
import { assignColors, colorFor, type LiveUser } from './people'

/** A shared note open in the editor: its live room, and how this person shows up to the others. */
export interface LiveEditing {
  session: CollabSession
  user: LiveUser
  sharedId: string
  /** A viewer: sees others' edits, cannot edit. */
  readOnly: boolean
  /**
   * Stores the document and the Markdown the editor shows for it (into the note too), and asks
   * sync to send it. An edit made to the note outside the editor meanwhile (MCP, Telegram) comes
   * into the document. `taken`: the editor already shows the note's text (the assistant's change).
   */
  persist(markdown: string, opts?: { taken?: boolean }): Promise<void>
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
    id: ctx.userId,
    color: colorFor(ctx.userId),
    role: stored.role,
  }
  session.awareness.setLocalStateField('user', user)
  // No two people in the note share a colour: when someone comes or goes, everyone recomputes the
  // same assignment and takes their own colour from it (carets and avatars follow).
  const recolor = () => {
    const ids = [...session.awareness.getStates().values()]
      .map((s) => (s as { user?: Partial<LiveUser> }).user?.id)
      .filter((id): id is string => Boolean(id))
    const color = assignColors(ids).get(user.id) ?? user.color
    if (color === user.color) return
    user.color = color
    session.awareness.setLocalStateField('user', { ...user })
  }
  session.awareness.on('change', recolor)
  if (!readOnly) await session.whenSynced(1200)
  return {
    session,
    user,
    sharedId,
    readOnly,
    persist: async (markdown, opts) => {
      const outside = await ctx.shared.saveDoc(sharedId, Y.encodeStateAsUpdate(doc), markdown, opts)
      if (outside) Y.applyUpdate(doc, outside, 'stored')
      requestSync()
    },
    refresh: async () => {
      const now = await ctx.shared.doc(sharedId)
      if (now?.state) Y.applyUpdate(doc, now.state, 'stored')
    },
  }
}
