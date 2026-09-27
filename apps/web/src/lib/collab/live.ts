import { CollabSession, collabRoom } from '@fixnote/core'
import type { Editor } from '@tiptap/react'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { collabContext, deviceLabel } from '../account/account'

/** A note being edited live: the room session and how this device shows up to the others. */
export interface LiveEditing {
  session: CollabSession
  user: { name: string; color: string }
}

/** The Yjs field the editor content lives in. */
export const LIVE_FIELD = 'default'

/** Caret colours, readable on light and dark backgrounds. */
const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131']

/**
 * Joins the live-editing room of a note on the account's devices and waits briefly for what the
 * others have. Null when signed out or locked (live editing goes through the server).
 */
export async function joinLive(noteId: string): Promise<LiveEditing | null> {
  const ctx = collabContext()
  if (!ctx) return null
  const room = collabRoom(ctx.keys, noteId)
  const session = new CollabSession({
    key: room.key,
    roomId: room.id,
    transport: ctx.backend.collab(room.id),
  })
  const user = {
    name: deviceLabel(),
    color: COLORS[session.doc.clientID % COLORS.length] as string,
  }
  session.awareness.setLocalStateField('user', user)
  await session.whenSynced()
  return { session, user }
}

/** FNV-1a of the text, as a Yjs client id (a non-zero 32-bit number). */
function textId(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0 || 1
}

/**
 * Fills an empty room from the note's Markdown. Every device builds the very same update from the
 * same text (the client id is derived from the text), so two devices starting at once do not
 * double the note: Yjs sees one change twice.
 */
export function seedLive(editor: Editor, markdown: string, doc: Y.Doc): void {
  if (doc.getXmlFragment(LIVE_FIELD).length > 0) return
  const json = editor.markdown?.parse(markdown)
  if (!json) return
  const seed = new Y.Doc()
  seed.clientID = textId(markdown)
  prosemirrorJSONToYXmlFragment(editor.schema, json, seed.getXmlFragment(LIVE_FIELD))
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed))
}
