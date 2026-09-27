import * as Y from 'yjs'
import {
  type AccountKeys,
  newNoteKey,
  openSealedBox,
  openSharedState,
  publicKeyB64,
  sealSharedState,
  sealToPublicKey,
} from '../crypto'
import type { NotesRepo } from '../notes/repo'
import type { SqlDriver, SqlRow } from '../platform'

/**
 * Notes shared with other people. A shared note is a Yjs document; the server keeps it sealed with
 * the note's own key, and each member gets that key sealed to their public key. Every member's
 * device keeps a local note linked to it (`notes.shared_id`) whose Markdown is written from the
 * document, so search, the assistant and MCP work as for any note. Such notes stay out of the
 * personal sync. Live editing (CollabSession) runs on the same document and key.
 */

export type SharedRole = 'owner' | 'edit' | 'view'

/** This account in one shared note, as the server lists it. */
export interface SharedMembership {
  sharedId: string
  role: SharedRole
  /** The note key sealed to this account's public key. */
  wrappedKey: string
  /** The owner's note it was shared from. */
  originNoteId: string
  ownerId: string
}

export interface SharedMember {
  userId: string
  email: string
  role: SharedRole
}

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; version: number; state: string | null }

/** The server side (Supabase in the app, a fake in dev and tests). */
export interface SharedRemote {
  memberships(): Promise<SharedMembership[]>
  state(sharedId: string): Promise<{ state: string | null; version: number } | null>
  /** Shares a note (or returns the id it already has); the caller is its owner. */
  share(originNoteId: string, wrappedKey: string): Promise<string>
  saveState(sharedId: string, state: string, baseVersion: number): Promise<SaveResult>
  findUser(email: string): Promise<{ userId: string; publicKey: string } | null>
  addMember(sharedId: string, userId: string, role: SharedRole, wrappedKey: string): Promise<void>
  setRole(sharedId: string, userId: string, role: SharedRole): Promise<void>
  removeMember(sharedId: string, userId: string): Promise<void>
  unshare(sharedId: string): Promise<void>
  members(sharedId: string): Promise<SharedMember[]>
}

/** Markdown ⇄ the editor's Yjs document. Needs the editor schema, so the app provides it. */
export interface DocProjector {
  toMarkdown(state: Uint8Array): string
  /** The document changed (as little as possible) to read `markdown`; a new one from null. */
  fromMarkdown(state: Uint8Array | null, markdown: string): Uint8Array
}

export interface SharedDoc {
  sharedId: string
  noteId: string
  role: SharedRole
  noteKey: string
  state: Uint8Array | null
  serverVersion: number
  dirty: boolean
}

export interface SharedSyncReport {
  /** Notes shared with this account since the last sync. */
  added: { noteId: string; title: string }[]
  /** Notes this account lost access to. */
  removed: number
  pulled: number
  pushed: number
}

/** No account with that email (or it has not set up its keys yet). */
export class PersonNotFoundError extends Error {
  constructor(readonly email: string) {
    super(`No FixNote account for ${email}`)
    this.name = 'PersonNotFoundError'
  }
}

interface DocRow extends SqlRow {
  shared_id: string
  note_id: string
  role: string
  note_key: string
  state: Uint8Array | null
  server_version: number
  dirty: number
  projected: string | null
}

const MAX_SAVE_ATTEMPTS = 3
const canEdit = (role: SharedRole) => role === 'owner' || role === 'edit'
const merge = (a: Uint8Array | null, b: Uint8Array) => (a ? Y.mergeUpdates([a, b]) : b)

export class SharedNotes {
  private readonly db: SqlDriver
  private readonly repo: NotesRepo
  private readonly keys: AccountKeys
  private readonly remote: SharedRemote
  private readonly projector: DocProjector
  private readonly userId: string
  /** State writes one at a time (the editor and sync both merge into the same row). */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(opts: {
    db: SqlDriver
    repo: NotesRepo
    keys: AccountKeys
    remote: SharedRemote
    projector: DocProjector
    userId: string
  }) {
    this.db = opts.db
    this.repo = opts.repo
    this.keys = opts.keys
    this.remote = opts.remote
    this.projector = opts.projector
    this.userId = opts.userId
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  async doc(sharedId: string): Promise<SharedDoc | null> {
    const [row] = await this.db.query<DocRow>('SELECT * FROM shared_docs WHERE shared_id = ?', [
      sharedId,
    ])
    return row ? toDoc(row) : null
  }

  // ── Sharing ────────────────────────────────────────────────────────────────

  /** Shares one of this account's notes; returns the shared note's id. */
  async share(noteId: string): Promise<string> {
    const note = await this.repo.getNote(noteId)
    if (!note) throw new Error(`Note ${noteId} not found`)
    if (note.sharedId) return note.sharedId
    const noteKey = newNoteKey()
    const state = this.projector.fromMarkdown(null, note.content)
    const wrapped = sealToPublicKey(publicKeyB64(this.keys), noteKey)
    // The server's copy is filled by the first push (it merges with one another device may have made).
    const sharedId = await this.remote.share(noteId, wrapped)
    await this.locked(async () => {
      await this.db.execute(
        `INSERT OR REPLACE INTO shared_docs
           (shared_id, note_id, role, note_key, state, server_version, dirty, projected)
         VALUES (?, ?, 'owner', ?, ?, 0, 1, ?)`,
        [sharedId, noteId, noteKey, state, note.content],
      )
      await this.db.execute('UPDATE notes SET shared_id = ? WHERE id = ?', [sharedId, noteId])
    })
    await this.push(sharedId)
    return sharedId
  }

  /** Invites a person by email. Throws PersonNotFoundError if they have no account. */
  async invite(sharedId: string, email: string, role: 'edit' | 'view'): Promise<void> {
    const doc = await this.doc(sharedId)
    if (!doc) throw new Error('Not a shared note')
    const person = await this.remote.findUser(email)
    if (!person) throw new PersonNotFoundError(email)
    await this.remote.addMember(
      sharedId,
      person.userId,
      role,
      sealToPublicKey(person.publicKey, doc.noteKey),
    )
  }

  members(sharedId: string): Promise<SharedMember[]> {
    return this.remote.members(sharedId)
  }

  setRole(sharedId: string, userId: string, role: 'edit' | 'view'): Promise<void> {
    return this.remote.setRole(sharedId, userId, role)
  }

  removeMember(sharedId: string, userId: string): Promise<void> {
    return this.remote.removeMember(sharedId, userId)
  }

  /** A member leaves: the note disappears from their devices. */
  async leave(sharedId: string): Promise<void> {
    await this.remote.removeMember(sharedId, this.userId)
    await this.drop(sharedId, 'delete')
  }

  /** The owner stops sharing: the others lose the note, the owner keeps it as a personal note. */
  async unshare(sharedId: string): Promise<void> {
    await this.remote.unshare(sharedId)
    await this.drop(sharedId, 'keep')
  }

  /** Forgets a shared note locally: keeps its note as a personal one, or deletes it. */
  private async drop(sharedId: string, note: 'keep' | 'delete') {
    await this.locked(async () => {
      const doc = await this.doc(sharedId)
      if (!doc) return
      await this.db.execute('DELETE FROM shared_docs WHERE shared_id = ?', [sharedId])
      if (note === 'keep') {
        // Back in the personal sync, with the text it has now.
        await this.db.execute(
          'UPDATE notes SET shared_id = NULL, dirty = 1, local_rev = local_rev + 1 WHERE id = ?',
          [doc.noteId],
        )
      } else {
        await this.repo.deleteNote(doc.noteId)
        // Never in the personal sync: nothing to tell the server about it.
        await this.db.execute('UPDATE notes SET shared_id = NULL, dirty = 0 WHERE id = ?', [
          doc.noteId,
        ])
      }
    })
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  /**
   * The editor's document changed: merges it into the stored state. `markdown` is what the editor
   * wrote to the note for it, so later sync can tell edits made outside the editor.
   */
  async saveDoc(sharedId: string, update: Uint8Array, markdown: string): Promise<void> {
    await this.locked(async () => {
      const doc = await this.doc(sharedId)
      if (!doc) return
      await this.db.execute(
        `UPDATE shared_docs SET state = ?, projected = ?, dirty = CASE WHEN ? THEN 1 ELSE dirty END
          WHERE shared_id = ?`,
        [merge(doc.state, update), markdown, canEdit(doc.role) ? 1 : 0, sharedId],
      )
    })
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  /** Brings shared notes up to date both ways: new and lost access, others' edits, ours. */
  async sync(): Promise<SharedSyncReport> {
    const report: SharedSyncReport = { added: [], removed: 0, pulled: 0, pushed: 0 }
    const memberships = await this.remote.memberships()
    const ids = new Set(memberships.map((m) => m.sharedId))
    for (const m of memberships) {
      const added = await this.link(m)
      if (added) report.added.push(added)
    }
    for (const row of await this.db.query<DocRow>('SELECT shared_id, role FROM shared_docs')) {
      if (ids.has(row.shared_id)) continue
      // Unshared by the owner (or we were removed): the owner keeps the note, others lose it.
      await this.drop(row.shared_id, row.role === 'owner' ? 'keep' : 'delete')
      report.removed++
    }
    for (const m of memberships) {
      if (await this.pull(m.sharedId)) report.pulled++
      if (await this.push(m.sharedId)) report.pushed++
    }
    return report
  }

  /** Makes sure a membership has its local document and note. Returns the note if it is new. */
  private async link(m: SharedMembership): Promise<{ noteId: string; title: string } | null> {
    const existing = await this.doc(m.sharedId)
    if (existing) {
      if (existing.role !== m.role)
        await this.db.execute('UPDATE shared_docs SET role = ? WHERE shared_id = ?', [
          m.role,
          m.sharedId,
        ])
      return null
    }
    const noteKey = openSealedBox(this.keys, m.wrappedKey)
    // This account's own note (shared from another of its devices) is linked, not copied.
    const own = m.ownerId === this.userId ? await this.repo.getNote(m.originNoteId) : null
    const noteId = own?.id ?? (await this.repo.createNote({ content: '' })).id
    await this.locked(async () => {
      await this.db.execute(
        `INSERT INTO shared_docs (shared_id, note_id, role, note_key, state, server_version, dirty, projected)
         VALUES (?, ?, ?, ?, NULL, 0, 0, ?)`,
        [m.sharedId, noteId, m.role, noteKey, own ? own.content : null],
      )
      await this.db.execute(
        `UPDATE notes SET shared_id = ?, dirty = CASE WHEN ? THEN dirty ELSE 0 END WHERE id = ?`,
        [m.sharedId, own ? 1 : 0, noteId],
      )
    })
    if (own) return null
    await this.pull(m.sharedId)
    return { noteId, title: (await this.repo.getNote(noteId))?.title ?? '' }
  }

  /**
   * Takes in edits made to the note outside the editor, then the server's state. Writes the merged
   * Markdown to the note. Returns whether the server had something new.
   */
  private async pull(sharedId: string): Promise<boolean> {
    const remote = await this.remote.state(sharedId)
    return this.locked(async () => {
      const doc = await this.doc(sharedId)
      if (!doc) return false
      const absorbed = await this.absorbOutsideEdits(doc)
      let state = absorbed ?? doc.state
      let serverVersion = doc.serverVersion
      const newer = remote && remote.version > doc.serverVersion && remote.state
      if (newer && remote.state) {
        state = merge(state, openSharedState(doc.noteKey, sharedId, remote.state))
        serverVersion = remote.version
      }
      if (!state) return false
      const markdown = await this.writeNote(doc.noteId, state)
      await this.db.execute(
        `UPDATE shared_docs SET state = ?, server_version = ?, projected = ?,
                dirty = CASE WHEN ? THEN 1 ELSE dirty END
          WHERE shared_id = ?`,
        // Only this device's own changes make it dirty: taking in the server's state does not (or
        // two devices would keep sending each other the same edits).
        [state, serverVersion, markdown, absorbed ? 1 : 0, sharedId],
      )
      return Boolean(newer)
    })
  }

  /**
   * The note was changed outside the editor (MCP, AI, Telegram): that change brought into the
   * document, or null when there was none (or this account may not edit).
   */
  private async absorbOutsideEdits(doc: SharedDoc): Promise<Uint8Array | null> {
    const [row] = await this.db.query<DocRow>(
      'SELECT projected FROM shared_docs WHERE shared_id = ?',
      [doc.sharedId],
    )
    const projected = row?.projected ?? null
    const note = await this.repo.getNote(doc.noteId)
    if (!note || !canEdit(doc.role) || projected === null || projected === note.content) return null
    return this.projector.fromMarkdown(doc.state, note.content)
  }

  /** Writes the document's Markdown to its note (if different); returns the Markdown. */
  private async writeNote(noteId: string, state: Uint8Array): Promise<string> {
    const markdown = this.projector.toMarkdown(state)
    const note = await this.repo.getNote(noteId)
    if (note && note.content !== markdown) await this.repo.updateContent(noteId, markdown)
    return markdown
  }

  /** Sends this device's state if it has changes; merges and retries if someone saved first. */
  private async push(sharedId: string): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const doc = await this.doc(sharedId)
      if (!doc?.dirty || !doc.state || !canEdit(doc.role)) return false
      const res = await this.remote.saveState(
        sharedId,
        sealSharedState(doc.noteKey, sharedId, doc.state),
        doc.serverVersion,
      )
      const done = await this.locked(async () => {
        const now = await this.doc(sharedId)
        if (!now) return true
        if (res.ok) {
          // Edits made while saving stay dirty for the next round.
          await this.db.execute(
            `UPDATE shared_docs SET server_version = ?, dirty = CASE WHEN state = ? THEN 0 ELSE 1 END
              WHERE shared_id = ?`,
            [res.version, doc.state, sharedId],
          )
          return true
        }
        let state = now.state
        if (res.state) state = merge(state, openSharedState(now.noteKey, sharedId, res.state))
        if (!state) return true
        const markdown = await this.writeNote(now.noteId, state)
        await this.db.execute(
          'UPDATE shared_docs SET state = ?, server_version = ?, projected = ?, dirty = 1 WHERE shared_id = ?',
          [state, res.version, markdown, sharedId],
        )
        return false
      })
      if (done) return res.ok
    }
    return false
  }
}

function toDoc(row: DocRow): SharedDoc {
  return {
    sharedId: row.shared_id,
    noteId: row.note_id,
    role: row.role as SharedRole,
    noteKey: row.note_key,
    state: row.state ? new Uint8Array(row.state) : null,
    serverVersion: Number(row.server_version),
    dirty: Number(row.dirty) === 1,
  }
}
