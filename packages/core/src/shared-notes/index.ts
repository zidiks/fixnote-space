import * as Y from 'yjs'
import { type AttachmentSource, type Attachments, attachmentIds } from '../attachments'
import {
  type AccountKeys,
  decryptSharedAttachment,
  encryptSharedAttachment,
  newNoteKey,
  openFolderShareName,
  openKeyFromFolder,
  openSealedBox,
  openSharedState,
  publicKeyB64,
  sealFolderShareName,
  sealKeyForFolder,
  sealSharedState,
  sealToPublicKey,
} from '../crypto'
import { deriveTitle } from '../notes/markdown'
import type { NotesRepo } from '../notes/repo'
import type { SqlDriver, SqlRow } from '../platform'
import {
  applyLayout,
  EMPTY_LAYOUT,
  type Layout,
  readLayout,
  readReality,
  recordLocalChanges,
} from './layout'

/**
 * Notes and folders shared with other people. A shared note is a Yjs document; the server keeps it
 * sealed with the note's own key, and each member gets that key sealed to their public key. A
 * shared folder has a key of its own, sealed to each member the same way; the key of every note in
 * it is sealed with the folder key, so the folder's members read all of them. Every member's
 * device keeps a local note linked to each shared note (`notes.shared_id`) whose Markdown is
 * written from the document, so search, the assistant and MCP work as for any note; a member's
 * copy of a folder is a local folder (`folders.shared_id`). Both stay out of the personal sync.
 * Live editing (CollabSession) runs on the same document and key.
 */

export type SharedRole = 'owner' | 'edit' | 'view'

/** An invitation not answered in this many days can no longer be accepted. */
export const INVITE_DAYS = 30
const INVITE_MS = INVITE_DAYS * 24 * 60 * 60 * 1000
/** A note deleted in a shared folder is deleted for everyone once its undo has run out. */
const DELETE_GRACE_MS = 15_000

/** This account in one shared note, as the server lists it. */
export interface SharedMembership {
  sharedId: string
  role: SharedRole
  /** The note key sealed to this account's public key. */
  wrappedKey: string
  /** The owner's note it was shared from. */
  originNoteId: string
  ownerId: string
  /** False while it is an invitation: the note joins this account's notes once accepted. */
  accepted: boolean
  /** When the invitation was (last) sent, ms. */
  invitedAt: number
}

/** This account in one shared folder, as the server lists it. */
export interface SharedFolderMembership {
  folderId: string
  role: SharedRole
  /** The folder key sealed to this account's public key. */
  wrappedKey: string
  /** The owner's folder it was shared from. */
  originFolderId: string
  ownerId: string
  accepted: boolean
  invitedAt: number
  /** The folder's name, sealed with the folder key. */
  name: string
  /** Its subfolders and where each note is: a Yjs document sealed with the folder key. */
  layout: string | null
  layoutVersion: number
}

/** A note in a shared folder, as the server lists it. */
export interface FolderNote {
  sharedId: string
  folderId: string
  /** The note key sealed with the folder key. */
  folderKey: string
  originNoteId: string
  /** Who put it in the folder (their devices link their own note instead of copying it). */
  createdBy: string | null
  /** Deleted for everyone: devices delete their copy. */
  deleted: boolean
}

export interface SharedMember {
  userId: string
  email: string
  role: SharedRole
  /** False while invited and not yet accepted. */
  accepted: boolean
  invitedAt: number
}

/** A note or folder someone invited this account to, not accepted yet (and not expired). */
export interface SharedInvite {
  kind: 'note' | 'folder'
  /** The shared note's or shared folder's id. */
  sharedId: string
  /** Who invites (the owner). */
  from: string
  role: SharedRole
  /** The note's title or the folder's name. */
  title: string
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
  /** The invited account accepts; declining is removeMember on oneself. */
  accept(sharedId: string): Promise<void>
  saveState(sharedId: string, state: string, baseVersion: number): Promise<SaveResult>
  findUser(email: string): Promise<{ userId: string; publicKey: string } | null>
  addMember(sharedId: string, userId: string, role: SharedRole, wrappedKey: string): Promise<void>
  setRole(sharedId: string, userId: string, role: SharedRole): Promise<void>
  removeMember(sharedId: string, userId: string): Promise<void>
  unshare(sharedId: string): Promise<void>
  members(sharedId: string): Promise<SharedMember[]>

  folderMemberships(): Promise<SharedFolderMembership[]>
  /** The notes of shared folders this account is in (deleted ones as tombstones). */
  folderNotes(folderIds: string[]): Promise<FolderNote[]>
  /** Shares a folder (or returns the id it already has); the caller is its owner. */
  shareFolder(originFolderId: string, wrappedKey: string, name: string): Promise<string>
  renameFolder(folderId: string, name: string): Promise<void>
  acceptFolder(folderId: string): Promise<void>
  addFolderMember(
    folderId: string,
    userId: string,
    role: SharedRole,
    wrappedKey: string,
  ): Promise<void>
  setFolderRole(folderId: string, userId: string, role: SharedRole): Promise<void>
  /** Owner: removes someone. Anyone: leaves (or declines) with their own id. */
  removeFolderMember(folderId: string, userId: string): Promise<void>
  unshareFolder(folderId: string): Promise<void>
  folderMembers(folderId: string): Promise<SharedMember[]>
  /** Owner and editors: a note joins the folder. */
  shareInFolder(folderId: string, originNoteId: string, folderKey: string): Promise<string>
  /** The owner of both: a note already shared on its own joins the folder. */
  attachToFolder(sharedId: string, folderId: string, folderKey: string): Promise<void>
  /** Owner and editors: stores the folder's layout if nobody saved since `baseVersion`. */
  saveFolderLayout(folderId: string, layout: string, baseVersion: number): Promise<SaveResult>
  /** The folder's owner: a note leaves the folder. */
  removeFromFolder(sharedId: string): Promise<void>
  /** Owner and editors: a note of the folder is deleted for everyone. */
  deleteFolderNote(sharedId: string): Promise<void>

  /** Owner and editors: a file of the note, sealed with its key, for every member. */
  putFile(sharedId: string, fileId: string, sealed: Uint8Array): Promise<void>
  /** Members: a file of the note; null when the server has none. */
  getFile(sharedId: string, fileId: string): Promise<Uint8Array | null>
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
  /** The shared folder it came through, if any. */
  folderSharedId: string | null
}

/** A shared folder on this device. */
export interface SharedFolder {
  sharedId: string
  /** The local folder (the owner's own, or a member's copy). */
  folderId: string
  role: SharedRole
  owner: boolean
}

export interface SharedSyncReport {
  /** Notes that joined this account's notes (accepted on another device, or its own shares). */
  added: { noteId: string; title: string }[]
  /** Shared notes no longer shared with this account; the owner keeps the note, others lose it. */
  removed: { sharedId: string; kept: boolean }[]
  /** Local folders that were someone's shared folder and are gone (access lost). */
  removedFolders: string[]
  /** Shared folders made, renamed or forgotten here (the folder list needs a refresh). */
  folders: number
  /** Shared notes where this account's role changed. */
  roles: { sharedId: string; role: SharedRole }[]
  /** Invitations waiting for an answer (note and folder ids). */
  invites: string[]
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
  folder_shared_id: string | null
}

interface FolderRow extends SqlRow {
  shared_id: string
  folder_id: string
  role: string
  folder_key: string
  owner_id: string
  name: string | null
  layout: Uint8Array | null
  layout_version: number
  layout_dirty: number
  layout_projected: string | null
}

/** A shared note this account has now, directly or through a folder. */
interface Access {
  sharedId: string
  role: SharedRole
  noteKey: () => string
  originNoteId: string
  /** This account made it: its own note is linked, not copied. */
  own: boolean
  folderSharedId: string | null
}

const MAX_SAVE_ATTEMPTS = 3
const canEdit = (role: SharedRole) => role === 'owner' || role === 'edit'
const RANK: Record<SharedRole, number> = { owner: 0, edit: 1, view: 2 }
const stronger = (a: SharedRole, b: SharedRole) => (RANK[a] <= RANK[b] ? a : b)
const merge = (a: Uint8Array | null, b: Uint8Array) => (a ? Y.mergeUpdates([a, b]) : b)

export class SharedNotes {
  private readonly db: SqlDriver
  private readonly repo: NotesRepo
  private readonly keys: AccountKeys
  private readonly remote: SharedRemote
  private readonly projector: DocProjector
  private readonly userId: string
  private readonly now: () => number
  /** State writes one at a time (the editor and sync both merge into the same row). */
  private queue: Promise<unknown> = Promise.resolve()
  /** One sync at a time (accepting runs one too); a second one waits for the first. */
  private syncing: Promise<unknown> = Promise.resolve()

  constructor(opts: {
    db: SqlDriver
    repo: NotesRepo
    keys: AccountKeys
    remote: SharedRemote
    projector: DocProjector
    userId: string
    now?: () => number
  }) {
    this.db = opts.db
    this.repo = opts.repo
    this.keys = opts.keys
    this.remote = opts.remote
    this.projector = opts.projector
    this.userId = opts.userId
    this.now = opts.now ?? Date.now
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  private expired(invitedAt: number): boolean {
    return invitedAt < this.now() - INVITE_MS
  }

  /** Whether an invitation sent at `invitedAt` can no longer be accepted. */
  isExpired(member: { accepted: boolean; invitedAt: number }): boolean {
    return !member.accepted && this.expired(member.invitedAt)
  }

  /**
   * Uploads the files that the shared notes this account may edit use and that are not under the
   * note on the server yet, sealed with the note key, so every member can open them. Files this
   * device does not have are someone else's to upload. Returns how many went up.
   */
  async pushFiles(attachments: Attachments): Promise<number> {
    const rows = await this.db.query<{ shared_id: string; note_key: string; content: string }>(
      `SELECT d.shared_id, d.note_key, n.content FROM shared_docs d
         JOIN notes n ON n.shared_id = d.shared_id AND n.deleted_at IS NULL
        WHERE d.role IN ('owner', 'edit')`,
    )
    let sent = 0
    for (const row of rows) {
      const done = new Set(
        (
          await this.db.query<{ attachment_id: string }>(
            'SELECT attachment_id FROM shared_files WHERE shared_id = ?',
            [row.shared_id],
          )
        ).map((r) => r.attachment_id),
      )
      for (const id of attachmentIds(row.content)) {
        if (done.has(id)) continue
        const file = await attachments.local(id)
        if (!file) continue
        const sealed = encryptSharedAttachment(
          row.note_key,
          row.shared_id,
          id,
          file.mime,
          file.bytes,
        )
        try {
          await this.remote.putFile(row.shared_id, id, sealed)
        } catch {
          // Not allowed or offline: tried again with the next sync.
          continue
        }
        await this.markFile(row.shared_id, id)
        sent++
      }
    }
    return sent
  }

  /** Files of shared notes: tried under each shared note that uses the file, with its key. */
  fileSource(): AttachmentSource {
    return {
      fetch: async (id) => {
        const rows = await this.db.query<{ shared_id: string; note_key: string }>(
          `SELECT d.shared_id, d.note_key FROM shared_docs d
             JOIN notes n ON n.shared_id = d.shared_id
            WHERE n.content LIKE ?`,
          [`%attachment:${id}%`],
        )
        for (const row of rows) {
          const sealed = await this.remote.getFile(row.shared_id, id).catch(() => null)
          if (!sealed) continue
          const file = decryptSharedAttachment(row.note_key, row.shared_id, id, sealed)
          await this.markFile(row.shared_id, id)
          return file
        }
        return null
      },
    }
  }

  private async markFile(sharedId: string, fileId: string) {
    await this.db.execute(
      'INSERT OR IGNORE INTO shared_files (shared_id, attachment_id) VALUES (?, ?)',
      [sharedId, fileId],
    )
  }

  async doc(sharedId: string): Promise<SharedDoc | null> {
    const [row] = await this.db.query<DocRow>('SELECT * FROM shared_docs WHERE shared_id = ?', [
      sharedId,
    ])
    return row ? toDoc(row) : null
  }

  /** The shared folder behind a local folder, if it is one. */
  async folder(localFolderId: string): Promise<SharedFolder | null> {
    const [row] = await this.db.query<FolderRow>(
      'SELECT * FROM shared_folders WHERE folder_id = ?',
      [localFolderId],
    )
    return row ? toFolder(row, this.userId) : null
  }

  /**
   * The shared folder a local folder is in (itself or a parent), for its notes: what this account
   * may do there. Null when not in a shared folder.
   */
  async folderOf(localFolderId: string | null): Promise<SharedFolder | null> {
    if (!localFolderId) return null
    const [row] = await this.db.query<FolderRow>(
      `WITH RECURSIVE up(id, parent_id) AS (
          SELECT id, parent_id FROM folders WHERE id = ?
          UNION ALL SELECT f.id, f.parent_id FROM folders f JOIN up ON f.id = up.parent_id)
        SELECT s.* FROM shared_folders s JOIN up ON s.folder_id = up.id LIMIT 1`,
      [localFolderId],
    )
    return row ? toFolder(row, this.userId) : null
  }

  // ── Sharing notes ──────────────────────────────────────────────────────────

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
           (shared_id, note_id, role, note_key, state, server_version, dirty, projected, created_by)
         VALUES (?, ?, 'owner', ?, ?, 0, 1, ?, ?)`,
        [sharedId, noteId, noteKey, state, note.content, this.userId],
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
    const person = await this.findPerson(email)
    await this.remote.addMember(
      sharedId,
      person.userId,
      role,
      sealToPublicKey(person.publicKey, doc.noteKey),
    )
  }

  private async findPerson(email: string) {
    const person = await this.remote.findUser(email)
    if (!person) throw new PersonNotFoundError(email)
    return person
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

  // ── Invitations ────────────────────────────────────────────────────────────

  /** Invitations waiting for an answer, with who sent them and the note's title or folder's name. */
  async invites(): Promise<SharedInvite[]> {
    const [notes, folders] = await Promise.all([
      this.remote.memberships(),
      this.remote.folderMemberships(),
    ])
    const noteInvites = notes
      .filter((m) => !m.accepted && !this.expired(m.invitedAt))
      .map(async (m): Promise<SharedInvite> => {
        const [remote, members] = await Promise.all([
          this.remote.state(m.sharedId),
          this.remote.members(m.sharedId),
        ])
        let title = ''
        try {
          if (remote?.state) {
            const key = openSealedBox(this.keys, m.wrappedKey)
            title = deriveTitle(
              this.projector.toMarkdown(openSharedState(key, m.sharedId, remote.state)),
            )
          }
        } catch {
          // A title that cannot be read is left out; the invitation still shows who sent it.
        }
        return { kind: 'note', sharedId: m.sharedId, from: ownerOf(members), role: m.role, title }
      })
    const folderInvites = folders
      .filter((m) => !m.accepted && !this.expired(m.invitedAt))
      .map(async (m): Promise<SharedInvite> => {
        const members = await this.remote.folderMembers(m.folderId)
        return {
          kind: 'folder',
          sharedId: m.folderId,
          from: ownerOf(members),
          role: m.role,
          title: this.folderName(m) ?? '',
        }
      })
    return Promise.all([...folderInvites, ...noteInvites])
  }

  /** Accepts an invitation to a note: it joins this account's notes. Returns its local id. */
  async accept(sharedId: string): Promise<string> {
    await this.remote.accept(sharedId)
    await this.sync()
    const doc = await this.doc(sharedId)
    if (!doc) throw new Error('Not invited')
    return doc.noteId
  }

  /** Declines an invitation to a note. */
  decline(sharedId: string): Promise<void> {
    return this.remote.removeMember(sharedId, this.userId)
  }

  /** Accepts an invitation to a folder: it and its notes join. Returns the local folder id. */
  async acceptFolder(folderId: string): Promise<string> {
    await this.remote.acceptFolder(folderId)
    await this.sync()
    const [row] = await this.db.query<FolderRow>(
      'SELECT * FROM shared_folders WHERE shared_id = ?',
      [folderId],
    )
    if (!row) throw new Error('Not invited')
    return row.folder_id
  }

  declineFolder(folderId: string): Promise<void> {
    return this.remote.removeFolderMember(folderId, this.userId)
  }

  // ── Sharing folders ────────────────────────────────────────────────────────

  /** Shares one of this account's folders (with its notes); returns the shared folder's id. */
  async shareFolder(localFolderId: string): Promise<string> {
    const existing = await this.folder(localFolderId)
    if (existing) return existing.sharedId
    const [folder] = await this.db.query<{ name: string }>(
      'SELECT name FROM folders WHERE id = ? AND deleted_at IS NULL',
      [localFolderId],
    )
    if (!folder) throw new Error(`Folder ${localFolderId} not found`)
    const folderKey = newNoteKey()
    const sharedId = await this.remote.shareFolder(
      localFolderId,
      sealToPublicKey(publicKeyB64(this.keys), folderKey),
      sealFolderShareName(folderKey, localFolderId, folder.name),
    )
    await this.db.execute(
      `INSERT OR REPLACE INTO shared_folders (shared_id, folder_id, role, folder_key, owner_id, name)
       VALUES (?, ?, 'owner', ?, ?, ?)`,
      [sharedId, localFolderId, folderKey, this.userId, folder.name],
    )
    // Its notes go up now, so people invited next find them there.
    await this.sync()
    return sharedId
  }

  async inviteToFolder(folderId: string, email: string, role: 'edit' | 'view'): Promise<void> {
    const [row] = await this.db.query<FolderRow>(
      'SELECT * FROM shared_folders WHERE shared_id = ?',
      [folderId],
    )
    if (!row) throw new Error('Not a shared folder')
    const person = await this.findPerson(email)
    await this.remote.addFolderMember(
      folderId,
      person.userId,
      role,
      sealToPublicKey(person.publicKey, row.folder_key),
    )
  }

  folderMembers(folderId: string): Promise<SharedMember[]> {
    return this.remote.folderMembers(folderId)
  }

  setFolderRole(folderId: string, userId: string, role: 'edit' | 'view'): Promise<void> {
    return this.remote.setFolderRole(folderId, userId, role)
  }

  removeFolderMember(folderId: string, userId: string): Promise<void> {
    return this.remote.removeFolderMember(folderId, userId)
  }

  /** A member leaves a folder: it and its notes disappear from their devices. */
  async leaveFolder(folderId: string): Promise<void> {
    await this.remote.removeFolderMember(folderId, this.userId)
    await this.sync()
  }

  /** The owner stops sharing a folder: the others lose it, the owner keeps folder and notes. */
  async unshareFolder(folderId: string): Promise<void> {
    await this.remote.unshareFolder(folderId)
    await this.sync()
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  /**
   * The editor's document changed: merges it into the stored state. `markdown` is what the editor
   * wrote to the note for it, so later sync can tell edits made outside the editor.
   */
  async saveDoc(sharedId: string, update: Uint8Array, markdown: string): Promise<void> {
    await this.locked(async () => {
      const doc = await this.doc(sharedId)
      // A viewer's copy comes from the server only (sync pulls it). That also keeps out edits an
      // editor made just before losing the right to edit, which were dropped then.
      if (!doc || !canEdit(doc.role)) return
      await this.db.execute(
        'UPDATE shared_docs SET state = ?, projected = ?, dirty = 1 WHERE shared_id = ?',
        [merge(doc.state, update), markdown, sharedId],
      )
    })
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  /** Brings shared notes and folders up to date both ways. */
  sync(): Promise<SharedSyncReport> {
    const run = this.syncing.then(
      () => this.syncOnce(),
      () => this.syncOnce(),
    )
    this.syncing = run.catch(() => undefined)
    return run
  }

  private async syncOnce(): Promise<SharedSyncReport> {
    const report: SharedSyncReport = {
      added: [],
      removed: [],
      removedFolders: [],
      folders: 0,
      roles: [],
      invites: [],
      pulled: 0,
      pushed: 0,
    }
    const [notes, allFolders] = await Promise.all([
      this.remote.memberships(),
      this.remote.folderMemberships(),
    ])
    const waiting = (m: { accepted: boolean; invitedAt: number }) =>
      !m.accepted && !this.expired(m.invitedAt)
    report.invites = [
      ...allFolders.filter(waiting).map((m) => m.folderId),
      ...notes.filter(waiting).map((m) => m.sharedId),
    ]

    // Folders first: this device's copies of them.
    const folders: SharedFolderMembership[] = []
    const settled: SharedFolderMembership[] = []
    for (const f of allFolders.filter((m) => m.accepted)) {
      const linked = await this.linkFolder(f, report)
      if (linked === 'gone') continue
      folders.push(f)
      if (linked === 'ok') settled.push(f)
    }

    // Every note this account has, directly or through a folder.
    const access = new Map<string, Access>()
    for (const m of notes.filter((n) => n.accepted))
      access.set(m.sharedId, {
        sharedId: m.sharedId,
        role: m.role,
        noteKey: () => openSealedBox(this.keys, m.wrappedKey),
        originNoteId: m.originNoteId,
        own: m.ownerId === this.userId,
        folderSharedId: null,
      })
    const tombstones = new Set<string>()
    if (folders.length) {
      const byId = new Map(folders.map((f) => [f.folderId, f]))
      const keys = new Map<string, string>()
      for (const [id, f] of byId) keys.set(id, openSealedBox(this.keys, f.wrappedKey))
      for (const n of await this.remote.folderNotes([...byId.keys()])) {
        const f = byId.get(n.folderId)
        const folderKey = keys.get(n.folderId)
        if (!f || !folderKey) continue
        if (n.deleted) {
          tombstones.add(n.sharedId)
          continue
        }
        const direct = access.get(n.sharedId)
        access.set(n.sharedId, {
          sharedId: n.sharedId,
          role: direct ? stronger(direct.role, f.role) : f.role,
          noteKey: direct?.noteKey ?? (() => openKeyFromFolder(folderKey, n.folderId, n.folderKey)),
          originNoteId: n.originNoteId,
          own: direct?.own || n.createdBy === this.userId,
          folderSharedId: n.folderId,
        })
      }
    }

    for (const a of access.values()) {
      const before = await this.doc(a.sharedId)
      const added = await this.link(a)
      if (added) report.added.push(added)
      if (before && before.role !== a.role)
        report.roles.push({ sharedId: a.sharedId, role: a.role })
    }
    for (const row of await this.db.query<DocRow>('SELECT shared_id, role FROM shared_docs')) {
      if (access.has(row.shared_id)) continue
      // Deleted for everyone, unshared by the owner, or we were removed: the owner keeps the
      // note (unless it was deleted), others lose it.
      const kept = row.role === 'owner' && !tombstones.has(row.shared_id)
      await this.drop(row.shared_id, kept ? 'keep' : 'delete')
      report.removed.push({ sharedId: row.shared_id, kept })
    }
    const ids = new Set(folders.map((f) => f.folderId))
    for (const row of await this.db.query<FolderRow>('SELECT * FROM shared_folders')) {
      if (ids.has(row.shared_id)) continue
      await this.dropFolder(row)
      report.folders++
      if (row.owner_id !== this.userId) report.removedFolders.push(row.folder_id)
    }
    // Then what changed in the folders here (after linking what the server has, so a note another
    // device already put in a folder is linked, not put in again).
    for (const f of settled) {
      await this.sendFolderChanges(f)
      await this.syncLayout(f, report)
    }

    for (const { shared_id } of await this.db.query<DocRow>('SELECT shared_id FROM shared_docs')) {
      if (await this.pull(shared_id)) report.pulled++
      if (await this.push(shared_id)) report.pushed++
    }
    return report
  }

  /**
   * Brings a shared folder's subfolders up to date both ways: what changed here goes into its
   * layout (owner and editors), the merged layout is applied here, and saved if it changed here.
   */
  private async syncLayout(f: SharedFolderMembership, report: SharedSyncReport) {
    const own = f.ownerId === this.userId
    const id = `layout:${f.folderId}`
    let server =
      f.layoutVersion > 0 && f.layout ? { state: f.layout, version: f.layoutVersion } : null
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const [row] = await this.db.query<FolderRow>(
        'SELECT * FROM shared_folders WHERE shared_id = ?',
        [f.folderId],
      )
      if (!row) return
      const doc = new Y.Doc()
      if (row.layout) Y.applyUpdate(doc, new Uint8Array(row.layout))
      let version = Number(row.layout_version)
      if (server && server.version > version) {
        Y.applyUpdate(doc, openSharedState(row.folder_key, id, server.state))
        version = server.version
      }
      const projected: Layout | null = row.layout_projected
        ? JSON.parse(row.layout_projected)
        : null
      let dirty = Number(row.layout_dirty) === 1
      // The owner's first time: the folder as it is becomes the layout.
      if (canEdit(f.role) && (projected || own)) {
        const real = await readReality(this.db, row.folder_id, f.folderId)
        if (recordLocalChanges(doc, real, projected ?? EMPTY_LAYOUT)) dirty = true
      }
      const applied = await applyLayout(this.db, readLayout(doc), {
        rootId: row.folder_id,
        folderSharedId: f.folderId,
        member: !own,
        now: this.now(),
      })
      if (applied) report.folders++
      const state = Y.encodeStateAsUpdate(doc)
      const after = (await readReality(this.db, row.folder_id, f.folderId)).layout
      await this.db.execute(
        `UPDATE shared_folders SET layout = ?, layout_version = ?, layout_dirty = ?,
                layout_projected = ?
          WHERE shared_id = ?`,
        [state, version, dirty ? 1 : 0, JSON.stringify(after), f.folderId],
      )
      if (!dirty || !canEdit(f.role)) return
      const res = await this.remote.saveFolderLayout(
        f.folderId,
        sealSharedState(row.folder_key, id, state),
        version,
      )
      if (res.ok) {
        await this.db.execute(
          'UPDATE shared_folders SET layout_version = ?, layout_dirty = 0 WHERE shared_id = ?',
          [res.version, f.folderId],
        )
        return
      }
      // Someone saved first: take in theirs and go again.
      server = res.state ? { state: res.state, version: res.version } : null
      if (!server)
        await this.db.execute('UPDATE shared_folders SET layout_version = ? WHERE shared_id = ?', [
          res.version,
          f.folderId,
        ])
    }
  }

  private folderName(f: SharedFolderMembership): string | null {
    try {
      return openFolderShareName(openSealedBox(this.keys, f.wrappedKey), f.originFolderId, f.name)
    } catch {
      return null
    }
  }

  /**
   * Makes sure a shared folder has its folder here: the owner's own, or a member's copy (made
   * now). Keeps the name the same on both sides. 'gone' when this device just left it (its copy
   * was deleted here) or stopped sharing it; 'paused' while that deletion can still be undone.
   */
  private async linkFolder(
    f: SharedFolderMembership,
    report: SharedSyncReport,
  ): Promise<'ok' | 'paused' | 'gone'> {
    const own = f.ownerId === this.userId
    const serverName = this.folderName(f)
    let [row] = await this.db.query<FolderRow>('SELECT * FROM shared_folders WHERE shared_id = ?', [
      f.folderId,
    ])
    if (!row) {
      const folderKey = openSealedBox(this.keys, f.wrappedKey)
      const [origin] = own
        ? await this.db.query<{ id: string }>(
            'SELECT id FROM folders WHERE id = ? AND deleted_at IS NULL',
            [f.originFolderId],
          )
        : []
      let folderId = origin?.id
      if (!folderId) {
        folderId = (await this.repo.createFolder(serverName || '…')).id
        // Someone else's folder: not part of this account's own folders.
        await this.db.execute('UPDATE folders SET shared_id = ?, dirty = 0 WHERE id = ?', [
          f.folderId,
          folderId,
        ])
      }
      await this.db.execute(
        `INSERT INTO shared_folders (shared_id, folder_id, role, folder_key, owner_id, name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [f.folderId, folderId, f.role, folderKey, f.ownerId, serverName],
      )
      report.folders++
      row = {
        shared_id: f.folderId,
        folder_id: folderId,
        role: f.role,
        folder_key: folderKey,
        owner_id: f.ownerId,
        name: serverName,
        layout: null,
        layout_version: 0,
        layout_dirty: 0,
        layout_projected: null,
      }
    } else if (row.role !== f.role) {
      await this.db.execute('UPDATE shared_folders SET role = ? WHERE shared_id = ?', [
        f.role,
        f.folderId,
      ])
    }

    const [local] = await this.db.query<{ name: string; deleted_at: number | null }>(
      'SELECT name, deleted_at FROM folders WHERE id = ?',
      [row.folder_id],
    )
    // Deleted here (and its undo has run out): the owner stops sharing it, a member leaves.
    if (!local || (local.deleted_at !== null && local.deleted_at <= this.now() - DELETE_GRACE_MS)) {
      if (own) await this.remote.unshareFolder(f.folderId)
      else await this.remote.removeFolderMember(f.folderId, this.userId)
      await this.dropFolder(row)
      report.folders++
      return 'gone'
    }
    if (local.deleted_at !== null) return 'paused'
    if (own && local.name !== row.name) {
      // Renamed here: the others get the new name.
      await this.remote.renameFolder(
        f.folderId,
        sealFolderShareName(row.folder_key, f.originFolderId, local.name),
      )
      await this.db.execute('UPDATE shared_folders SET name = ? WHERE shared_id = ?', [
        local.name,
        f.folderId,
      ])
    } else if (!own && serverName && serverName !== local.name) {
      report.folders++
      await this.db.execute('UPDATE folders SET name = ? WHERE id = ?', [serverName, row.folder_id])
      await this.db.execute('UPDATE shared_folders SET name = ? WHERE shared_id = ?', [
        serverName,
        f.folderId,
      ])
    }
    return 'ok'
  }

  /**
   * Sends what changed in a shared folder on this device: notes put in it (or in its subfolders)
   * join it, notes deleted in it are deleted for everyone, and the owner's notes moved out of it
   * leave it.
   */
  private async sendFolderChanges(f: SharedFolderMembership): Promise<void> {
    const [row] = await this.db.query<FolderRow>(
      'SELECT * FROM shared_folders WHERE shared_id = ?',
      [f.folderId],
    )
    if (!row || !canEdit(f.role)) return
    const own = f.ownerId === this.userId
    const subtree = new Set(await this.repo.folderSubtree(row.folder_id))
    const docs = await this.db.query<
      DocRow & { folder_id: string | null; deleted_at: number | null }
    >(
      `SELECT d.*, n.folder_id, n.deleted_at FROM shared_docs d
         LEFT JOIN notes n ON n.id = d.note_id
        WHERE d.folder_shared_id = ?`,
      [f.folderId],
    )
    for (const d of docs) {
      if (d.deleted_at !== null) {
        if (d.deleted_at > this.now() - DELETE_GRACE_MS) continue
        await this.remote.deleteFolderNote(d.shared_id)
        await this.drop(d.shared_id, 'delete')
      } else if (!d.folder_id || !subtree.has(d.folder_id)) {
        // Moved out by the owner: members lose it. (An editor cannot take a note out.)
        if (!own) continue
        await this.remote.removeFromFolder(d.shared_id)
        await this.drop(d.shared_id, 'keep')
      }
    }
    const candidates = await this.db.query<{
      id: string
      content: string
      shared_id: string | null
    }>(
      `SELECT id, content, shared_id FROM notes
        WHERE deleted_at IS NULL AND folder_id IN (${[...subtree].map(() => '?').join(',')})`,
      [...subtree],
    )
    for (const n of candidates) {
      if (!n.shared_id) {
        // An empty new note may still be thrown away; it joins once something is written.
        if (n.content.trim()) await this.shareIntoFolder(row, n.id, n.content)
        continue
      }
      const doc = await this.doc(n.shared_id)
      // A note this account shared on its own joins its folder too.
      if (own && doc && !doc.folderSharedId && doc.role === 'owner') {
        await this.remote.attachToFolder(
          n.shared_id,
          f.folderId,
          sealKeyForFolder(row.folder_key, f.folderId, doc.noteKey),
        )
        await this.db.execute('UPDATE shared_docs SET folder_shared_id = ? WHERE shared_id = ?', [
          f.folderId,
          n.shared_id,
        ])
      }
    }
  }

  private async shareIntoFolder(folder: FolderRow, noteId: string, content: string) {
    const noteKey = newNoteKey()
    const state = this.projector.fromMarkdown(null, content)
    const sharedId = await this.remote.shareInFolder(
      folder.shared_id,
      noteId,
      sealKeyForFolder(folder.folder_key, folder.shared_id, noteKey),
    )
    await this.locked(async () => {
      await this.db.execute(
        `INSERT OR REPLACE INTO shared_docs
           (shared_id, note_id, role, note_key, state, server_version, dirty, projected,
            folder_shared_id, created_by)
         VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`,
        [
          sharedId,
          noteId,
          folder.owner_id === this.userId ? 'owner' : folder.role,
          noteKey,
          state,
          content,
          folder.shared_id,
          this.userId,
        ],
      )
      await this.db.execute('UPDATE notes SET shared_id = ? WHERE id = ?', [sharedId, noteId])
    })
  }

  /** Forgets a shared folder here: a member's copy is deleted, the owner's folder stays. */
  private async dropFolder(row: FolderRow) {
    await this.db.execute('DELETE FROM shared_folders WHERE shared_id = ?', [row.shared_id])
    if (row.owner_id === this.userId) return
    const [local] = await this.db.query<{ shared_id: string | null }>(
      'SELECT shared_id FROM folders WHERE id = ?',
      [row.folder_id],
    )
    if (local?.shared_id) await this.repo.deleteFolder(row.folder_id)
  }

  /** Makes sure a shared note has its local document and note. Returns the note if it is new. */
  private async link(a: Access): Promise<{ noteId: string; title: string } | null> {
    const existing = await this.doc(a.sharedId)
    if (existing) {
      if (existing.folderSharedId !== a.folderSharedId)
        await this.db.execute('UPDATE shared_docs SET folder_shared_id = ? WHERE shared_id = ?', [
          a.folderSharedId,
          a.sharedId,
        ])
      if (existing.role === a.role) return null
      await this.locked(() =>
        // No longer allowed to edit: edits not saved yet are dropped, the server's text is the
        // note's (the next pull fills the state back in from it).
        canEdit(existing.role) && !canEdit(a.role)
          ? this.db.execute(
              `UPDATE shared_docs SET role = ?, state = NULL, server_version = 0, dirty = 0
                WHERE shared_id = ?`,
              [a.role, a.sharedId],
            )
          : this.db.execute('UPDATE shared_docs SET role = ? WHERE shared_id = ?', [
              a.role,
              a.sharedId,
            ]),
      )
      return null
    }
    let noteKey: string
    try {
      noteKey = a.noteKey()
    } catch {
      return null
    }
    // The folder it goes in here: its shared folder's copy (or the owner's folder).
    const [folder] = a.folderSharedId
      ? await this.db.query<FolderRow>('SELECT * FROM shared_folders WHERE shared_id = ?', [
          a.folderSharedId,
        ])
      : []
    // This account's own note (from another of its devices) is linked, not copied.
    const own = a.own ? await this.repo.getNote(a.originNoteId) : null
    const noteId =
      own?.id ??
      (
        await this.repo.createNote({
          content: '',
          folderId: folder?.folder_id ?? null,
          fromSharing: true,
        })
      ).id
    await this.locked(async () => {
      await this.db.execute(
        `INSERT INTO shared_docs (shared_id, note_id, role, note_key, state, server_version, dirty,
                                  projected, folder_shared_id)
         VALUES (?, ?, ?, ?, NULL, 0, 0, ?, ?)`,
        [a.sharedId, noteId, a.role, noteKey, own ? own.content : null, a.folderSharedId],
      )
      await this.db.execute(
        `UPDATE notes SET shared_id = ?, dirty = CASE WHEN ? THEN dirty ELSE 0 END WHERE id = ?`,
        [a.sharedId, own ? 1 : 0, noteId],
      )
      // Brought here by the personal sync, possibly into a folder this device does not have.
      if (own && folder) {
        const inside = await this.repo.folderSubtree(folder.folder_id)
        if (!own.folderId || !inside.includes(own.folderId))
          await this.db.execute('UPDATE notes SET folder_id = ? WHERE id = ?', [
            folder.folder_id,
            noteId,
          ])
      }
    })
    if (own) return null
    await this.pull(a.sharedId)
    return { noteId, title: (await this.repo.getNote(noteId))?.title ?? '' }
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
        await this.repo.deleteNote(doc.noteId, { fromSharing: true })
        // Never in the personal sync: nothing to tell the server about it.
        await this.db.execute('UPDATE notes SET shared_id = NULL, dirty = 0 WHERE id = ?', [
          doc.noteId,
        ])
      }
    })
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
    if (note && note.content !== markdown)
      await this.repo.updateContent(noteId, markdown, { fromSharing: true })
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

const ownerOf = (members: SharedMember[]) => members.find((m) => m.role === 'owner')?.email ?? ''

function toDoc(row: DocRow): SharedDoc {
  return {
    sharedId: row.shared_id,
    noteId: row.note_id,
    role: row.role as SharedRole,
    noteKey: row.note_key,
    state: row.state ? new Uint8Array(row.state) : null,
    serverVersion: Number(row.server_version),
    dirty: Number(row.dirty) === 1,
    folderSharedId: row.folder_shared_id ?? null,
  }
}

function toFolder(row: FolderRow, userId: string): SharedFolder {
  return {
    sharedId: row.shared_id,
    folderId: row.folder_id,
    role: row.role as SharedRole,
    owner: row.owner_id === userId,
  }
}
