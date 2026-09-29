import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Attachments, attachmentUrl } from '../attachments'
import { cryptoReady, deriveKeys, newRecoverySecret, publicKeyB64 } from '../crypto'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo, ReadOnlyError } from '../notes/repo'
import type { BlobStore, SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { type DocProjector, PersonNotFoundError, SharedNotes } from './index'
import { MemorySharedServer } from './memory-server'

/** The editor's projection, for tests: the note is one Y.Text; edits keep a common prefix/suffix. */
const projector: DocProjector = {
  toMarkdown: (state) => {
    const d = new Y.Doc()
    Y.applyUpdate(d, state)
    return d.getText('t').toString()
  },
  fromMarkdown: (state, md) => {
    const d = new Y.Doc()
    if (state) Y.applyUpdate(d, state)
    const t = d.getText('t')
    const cur = t.toString()
    let p = 0
    while (p < cur.length && p < md.length && cur[p] === md[p]) p++
    let s = 0
    while (
      s < cur.length - p &&
      s < md.length - p &&
      cur[cur.length - 1 - s] === md[md.length - 1 - s]
    )
      s++
    d.transact(() => {
      t.delete(p, cur.length - p - s)
      t.insert(p, md.slice(p, md.length - s))
    })
    return Y.encodeStateAsUpdate(d)
  },
}

/** What the editor does on a device: edit the document, save it and the Markdown it shows. */
async function typeInEditor(d: Device, sharedId: string, edit: (t: Y.Text) => void) {
  const doc = await d.shared.doc(sharedId)
  const y = new Y.Doc()
  if (doc?.state) Y.applyUpdate(y, doc.state)
  edit(y.getText('t'))
  const markdown = y.getText('t').toString()
  await d.shared.saveDoc(sharedId, Y.encodeStateAsUpdate(y), markdown)
  await d.repo.updateContent(doc?.noteId as string, markdown)
}

let server: MemorySharedServer
/** Moves every clock of the test (server and devices) forward. */
let offset = 0
const clock = () => Date.now() + offset
interface Device {
  db: SqlDriver
  repo: NotesRepo
  shared: SharedNotes
}

async function account(userId: string, email: string) {
  const keys = deriveKeys(newRecoverySecret())
  server.users.set(userId, { email, publicKey: publicKeyB64(keys) })
  let n = 0
  const device = async (): Promise<Device> => {
    const db = await createMemoryDriver()
    await prepareDatabase(db)
    const repo = new NotesRepo(db, { newId: () => `${userId}-${++n}-${Math.random()}` })
    return {
      db,
      repo,
      shared: new SharedNotes({
        db,
        repo,
        keys,
        remote: server.remoteFor(userId),
        projector,
        userId,
        now: clock,
      }),
    }
  }
  return { device }
}

const content = async (d: Device, noteId: string) => (await d.repo.getNote(noteId))?.content

/** A device's files (images and other attachments), with the bytes in memory. */
function filesOf(d: Device) {
  const map = new Map<string, Blob>()
  const blobs: BlobStore = {
    put: async (k, b) => void map.set(k, b),
    get: async (k) => map.get(k) ?? null,
    delete: async (k) => void map.delete(k),
  }
  return new Attachments(d.db, blobs)
}
const bytesOf = async (blob: Blob | null) =>
  blob ? [...new Uint8Array(await blob.arrayBuffer())] : null

beforeAll(cryptoReady)
beforeEach(() => {
  server = new MemorySharedServer()
  server.now = clock
  offset = 0
})

describe('SharedNotes', () => {
  it('sharing needs Pro from the owner; people invited join and edit on Free', async () => {
    server.isPro = (user) => user === 'ann'
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    await (await account('cat', 'cat@x.io')).device()
    const own = await bob.repo.createNote({ content: 'Bob on Free' })
    await expect(bob.shared.share(own.id)).rejects.toThrow('pro_required')

    const note = await ann.repo.createNote({ content: 'Plan' })
    const id = await ann.shared.share(note.id)
    await ann.shared.invite(id, 'bob@x.io', 'edit')
    const bobNote = await bob.shared.accept(id)
    await typeInEditor(bob, id, (t) => t.insert(t.length, ' from Bob'))
    await bob.shared.sync()
    await ann.shared.sync()
    expect(await content(ann, note.id)).toBe('Plan from Bob')
    expect(await content(bob, bobNote)).toBe('Plan from Bob')

    // Ann's Pro ends: the note keeps working, new people cannot be invited.
    server.isPro = () => false
    await expect(ann.shared.invite(id, 'cat@x.io', 'view')).rejects.toThrow('pro_required')
    await typeInEditor(ann, id, (t) => t.insert(0, 'Our '))
    await ann.shared.sync()
    await bob.shared.sync()
    expect(await content(bob, bobNote)).toBe('Our Plan from Bob')
  })

  it('files in a shared note reach every member, sealed with the note key', async () => {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    const cat = await (await account('cat', 'cat@x.io')).device()
    const annFiles = filesOf(ann)
    const photo = await annFiles.add(new Blob([new Uint8Array([7, 7, 7])]), 'image/png')
    // The image was in the note before it was shared.
    const note = await ann.repo.createNote({
      content: `Trip\n\n![](${attachmentUrl(photo.id)})`,
    })
    const id = await ann.shared.share(note.id)
    await ann.shared.invite(id, 'bob@x.io', 'edit')
    await ann.shared.invite(id, 'cat@x.io', 'view')
    await bob.shared.accept(id)
    await cat.shared.accept(id)

    expect(await ann.shared.pushFiles(annFiles)).toBe(1)
    expect(await ann.shared.pushFiles(annFiles)).toBe(0)
    // Only ciphertext on the server.
    expect(server.files.get(`${id}/${photo.id}`)).not.toContain('BwcH')

    const bobFiles = filesOf(bob)
    expect(await bytesOf(await bobFiles.load(photo.id, bob.shared.fileSource()))).toEqual([7, 7, 7])
    const catFiles = filesOf(cat)
    expect(await bytesOf(await catFiles.load(photo.id, cat.shared.fileSource()))).toEqual([7, 7, 7])

    // Bob (an editor) adds a file; Cat (a viewer) cannot put one on the server.
    const scan = await bobFiles.add(new Blob([new Uint8Array([1, 2])]), 'application/pdf')
    const bobNote = await bob.repo.listNotes().then((p) => p.items[0])
    await typeInEditor(bob, id, (t) =>
      t.insert(t.length, `\n[scan.pdf](${attachmentUrl(scan.id)})`),
    )
    expect(await bob.shared.pushFiles(bobFiles)).toBe(1)
    await bob.shared.sync()
    await ann.shared.sync()
    expect(await bytesOf(await annFiles.load(scan.id, ann.shared.fileSource()))).toEqual([1, 2])
    expect(bobNote?.sharedId).toBe(id)
    const own = await catFiles.add(new Blob([new Uint8Array([9])]), 'image/png')
    await expect(server.remoteFor('cat').putFile(id, own.id, new Uint8Array([1]))).rejects.toThrow(
      'read only',
    )

    // Someone who is not a member gets nothing.
    const dan = await (await account('dan', 'dan@x.io')).device()
    await dan.repo.createNote({ content: `![](${attachmentUrl(photo.id)})` })
    expect(await server.remoteFor('dan').getFile(id, photo.id)).toBeNull()
  })

  it('shares a note with a person who then edits it; edits flow both ways and merge', async () => {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    const note = await ann.repo.createNote({ content: 'Plan\nmeet on Monday' })
    const id = await ann.shared.share(note.id)
    expect((await ann.repo.getNote(note.id))?.sharedId).toBe(id)
    // The server has only ciphertext.
    expect(server.notes.get(id)?.state).not.toContain('Monday')

    await expect(ann.shared.invite(id, 'nobody@x.io', 'edit')).rejects.toBeInstanceOf(
      PersonNotFoundError,
    )
    await ann.shared.invite(id, ' BOB@x.io', 'edit')
    // An invitation first: nothing joins Bob's notes until he accepts.
    const report = await bob.shared.sync()
    expect(report.added).toEqual([])
    expect(report.invites).toEqual([id])
    expect((await bob.repo.listNotes()).items).toHaveLength(0)
    expect(await bob.shared.invites()).toEqual([
      { kind: 'note', sharedId: id, from: 'ann@x.io', role: 'edit', title: 'Plan' },
    ])
    const bobNote = await bob.shared.accept(id)
    expect((await bob.shared.sync()).invites).toEqual([])
    expect(await content(bob, bobNote)).toBe('Plan\nmeet on Monday')

    // Both edit at the same time, different places.
    await typeInEditor(ann, id, (t) => t.insert(0, 'Team '))
    await typeInEditor(bob, id, (t) => t.insert(t.length, ' at 10'))
    await ann.shared.sync()
    await bob.shared.sync()
    await ann.shared.sync()
    expect(await content(ann, note.id)).toBe('Team Plan\nmeet on Monday at 10')
    expect(await content(bob, bobNote)).toBe('Team Plan\nmeet on Monday at 10')

    // Settled: another round sends nothing (no ping-pong between devices).
    const before = server.notes.get(id)?.version
    await ann.shared.sync()
    await bob.shared.sync()
    expect(server.notes.get(id)?.version).toBe(before)
  })

  it('takes in edits made to the note outside the editor (MCP, AI)', async () => {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    const note = await ann.repo.createNote({ content: 'List\n- milk' })
    const id = await ann.shared.share(note.id)
    await ann.shared.invite(id, 'bob@x.io', 'edit')
    const bobNote = await bob.shared.accept(id)
    // An MCP client appends a line to Bob's copy through the repo.
    await bob.repo.updateContent(bobNote, 'List\n- milk\n- bread')
    await bob.shared.sync()
    await ann.shared.sync()
    expect(await content(ann, note.id)).toBe('List\n- milk\n- bread')
  })

  it('a viewer gets edits but cannot change the note', async () => {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const cat = await (await account('cat', 'cat@x.io')).device()
    const note = await ann.repo.createNote({ content: 'Read me' })
    const id = await ann.shared.share(note.id)
    await ann.shared.invite(id, 'cat@x.io', 'view')
    const catNote = await cat.shared.accept(id)
    await expect(
      cat.repo.updateContent(catNote, 'Read me, changed by the viewer'),
    ).rejects.toBeInstanceOf(ReadOnlyError)
    await cat.shared.sync()
    expect(await content(cat, catNote)).toBe('Read me')
    await typeInEditor(ann, id, (t) => t.insert(t.length, '!'))
    await ann.shared.sync()
    await cat.shared.sync()
    expect(await content(cat, catNote)).toBe('Read me!')
  })

  it("links the owner's own note on the owner's other devices instead of copying it", async () => {
    const annAccount = await account('ann', 'ann@x.io')
    const mac = await annAccount.device()
    const pc = await annAccount.device()
    const note = await mac.repo.createNote({ content: 'Shared plan' })
    // The personal sync brought the same note (same id) to the other device earlier.
    await new NotesRepo(pc.db, { newId: () => note.id }).createNote({ content: note.content })
    const id = await mac.shared.share(note.id)
    const report = await pc.shared.sync()
    expect(report.added).toEqual([])
    expect((await pc.repo.getNote(note.id))?.sharedId).toBe(id)
    expect((await pc.repo.listNotes()).items).toHaveLength(1)
    await typeInEditor(mac, id, (t) => t.insert(t.length, ' v2'))
    await mac.shared.sync()
    await pc.shared.sync()
    expect(await content(pc, note.id)).toBe('Shared plan v2')
  })

  it('leaving and unsharing: members lose the note, the owner keeps it as a personal note', async () => {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    const cat = await (await account('cat', 'cat@x.io')).device()
    const note = await ann.repo.createNote({ content: 'Trip' })
    const id = await ann.shared.share(note.id)
    await ann.shared.invite(id, 'bob@x.io', 'edit')
    await ann.shared.invite(id, 'cat@x.io', 'edit')
    const bobNote = await bob.shared.accept(id)
    const catNote = await cat.shared.accept(id)

    await bob.shared.leave(id)
    expect(await bob.repo.getNote(bobNote)).toBeNull()
    expect((await ann.shared.members(id)).map((m) => m.email).sort()).toEqual([
      'ann@x.io',
      'cat@x.io',
    ])

    await ann.shared.unshare(id)
    expect((await ann.repo.getNote(note.id))?.sharedId).toBeNull()
    expect(await content(ann, note.id)).toBe('Trip')
    expect((await cat.shared.sync()).removed).toEqual([{ sharedId: id, kept: false }])
    expect(await cat.repo.getNote(catNote)).toBeNull()
  })

  it('declining an invitation removes it; an invited person cannot save before accepting', async () => {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    const note = await ann.repo.createNote({ content: 'Not for Bob' })
    const id = await ann.shared.share(note.id)
    await ann.shared.invite(id, 'bob@x.io', 'edit')
    await expect(server.remoteFor('bob').saveState(id, 'x', 1)).rejects.toThrow('read only')
    expect((await ann.shared.members(id)).map((m) => [m.email, m.accepted])).toEqual([
      ['ann@x.io', true],
      ['bob@x.io', false],
    ])
    await bob.shared.decline(id)
    expect(await bob.shared.invites()).toEqual([])
    expect((await bob.shared.sync()).added).toEqual([])
    expect((await ann.shared.members(id)).map((m) => m.email)).toEqual(['ann@x.io'])
  })

  it('an editor made a viewer: the role change is reported, unsaved edits are dropped', async () => {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    const note = await ann.repo.createNote({ content: 'Agenda' })
    const id = await ann.shared.share(note.id)
    await ann.shared.invite(id, 'bob@x.io', 'edit')
    const bobNote = await bob.shared.accept(id)
    // Bob types, but Ann takes the right to edit away before his device sends it.
    await typeInEditor(bob, id, (t) => t.insert(t.length, ' (Bob was here)'))
    await ann.shared.setRole(id, 'bob', 'view')
    const report = await bob.shared.sync()
    expect(report.roles).toEqual([{ sharedId: id, role: 'view' }])
    expect(await content(bob, bobNote)).toBe('Agenda')
    // A late save from an editor still open is ignored, and the note itself is read-only now.
    const late = new Y.Doc()
    late.getText('t').insert(0, 'Late ')
    await bob.shared.saveDoc(id, Y.encodeStateAsUpdate(late), 'Late Agenda')
    await expect(bob.repo.updateContent(bobNote, 'Late Agenda')).rejects.toBeInstanceOf(
      ReadOnlyError,
    )
    await bob.shared.sync()
    expect(await content(bob, bobNote)).toBe('Agenda')
    await typeInEditor(ann, id, (t) => t.insert(t.length, ' v2'))
    await ann.shared.sync()
    await bob.shared.sync()
    expect(await content(bob, bobNote)).toBe('Agenda v2')
    expect(await content(ann, note.id)).toBe('Agenda v2')
  })

  it('invitations expire after 30 days; inviting again sends a fresh one', async () => {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    const note = await ann.repo.createNote({ content: 'Old' })
    const id = await ann.shared.share(note.id)
    await ann.shared.invite(id, 'bob@x.io', 'edit')
    offset = 31 * 86_400_000
    expect(await bob.shared.invites()).toEqual([])
    expect((await bob.shared.sync()).invites).toEqual([])
    await expect(bob.shared.accept(id)).rejects.toThrow('not invited')
    const [, invited] = await ann.shared.members(id)
    expect(invited && ann.shared.isExpired(invited)).toBe(true)
    await ann.shared.invite(id, 'bob@x.io', 'edit')
    expect((await bob.shared.invites()).map((i) => i.sharedId)).toEqual([id])
    await bob.shared.accept(id)
  })
})

describe('shared folders', () => {
  const inFolder = async (d: Device, folderId: string) =>
    (
      await d.db.query<{ content: string }>(
        `SELECT content FROM notes WHERE deleted_at IS NULL AND folder_id IN (
           WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id)
           SELECT id FROM sub) ORDER BY content`,
        [folderId],
      )
    ).map((r) => r.content)

  /** The folders of a device as paths, sorted. */
  const tree = async (d: Device) => {
    const folders = await d.repo.listFolders()
    const path = (id: string | null): string => {
      const f = folders.find((x) => x.id === id)
      return f ? (f.parentId ? `${path(f.parentId)}/${f.name}` : f.name) : ''
    }
    return folders.map((f) => path(f.id)).sort()
  }
  /** Which folder (by name) each note is in. */
  const where = async (d: Device) => {
    const folders = await d.repo.listFolders()
    const out: Record<string, string> = {}
    for (const n of (await d.repo.listNotes()).items)
      out[n.title] = folders.find((f) => f.id === n.folderId)?.name ?? ''
    return out
  }

  async function setUp() {
    const ann = await (await account('ann', 'ann@x.io')).device()
    const bob = await (await account('bob', 'bob@x.io')).device()
    const cat = await (await account('cat', 'cat@x.io')).device()
    const trip = await ann.repo.createFolder('Trip')
    const hotels = await ann.repo.createFolder('Hotels', trip.id)
    const plan = await ann.repo.createNote({ content: 'Plan', folderId: trip.id })
    const hotel = await ann.repo.createNote({ content: 'Hotel Roma', folderId: hotels.id })
    await ann.repo.createNote({ content: 'Not in the folder' })
    const id = await ann.shared.shareFolder(trip.id)
    await ann.shared.inviteToFolder(id, 'bob@x.io', 'edit')
    await ann.shared.inviteToFolder(id, 'cat@x.io', 'view')
    return { ann, bob, cat, trip, plan, hotel, id }
  }

  it('gives members every note of the folder and its subfolders, once they accept', async () => {
    const { ann, bob, trip, id } = await setUp()
    expect(await ann.shared.folder(trip.id)).toMatchObject({ sharedId: id, owner: true })
    // The server has only ciphertext.
    expect(server.folders.get(id)?.name).not.toContain('Trip')

    const report = await bob.shared.sync()
    expect(report.invites).toEqual([id])
    expect(await bob.repo.listFolders()).toEqual([])
    expect(await bob.shared.invites()).toEqual([
      { kind: 'folder', sharedId: id, from: 'ann@x.io', role: 'edit', title: 'Trip' },
    ])
    const bobTrip = await bob.shared.acceptFolder(id)
    // The same tree: Hotels inside Trip, each note where Ann has it.
    expect(await tree(bob)).toEqual(['Trip', 'Trip/Hotels'])
    expect(await inFolder(bob, bobTrip)).toEqual(['Hotel Roma', 'Plan'])
    expect(await where(bob)).toEqual({ 'Hotel Roma': 'Hotels', Plan: 'Trip' })
    // Ann's folder, not Bob's: it stays out of his personal sync.
    const [row] = await bob.db.query<{ shared_id: string | null; dirty: number }>(
      'SELECT shared_id, dirty FROM folders WHERE id = ?',
      [bobTrip],
    )
    expect(row).toEqual({ shared_id: id, dirty: 0 })
    expect(await bob.shared.folderOf(bobTrip)).toMatchObject({ role: 'edit', owner: false })
  })

  it('files in notes of a shared folder reach its members', async () => {
    const { ann, bob, trip, id } = await setUp()
    const annFiles = filesOf(ann)
    const map = await annFiles.add(new Blob([new Uint8Array([4, 2])]), 'image/png')
    await ann.repo.createNote({
      content: `Map\n\n![](${attachmentUrl(map.id)})`,
      folderId: trip.id,
    })
    await ann.shared.sync()
    expect(await ann.shared.pushFiles(annFiles)).toBe(1)
    await bob.shared.acceptFolder(id)
    const bobFiles = filesOf(bob)
    expect(await bytesOf(await bobFiles.load(map.id, bob.shared.fileSource()))).toEqual([4, 2])
  })

  it('an editor adds notes and edits; the owner renames; everyone sees it', async () => {
    const { ann, bob, trip, plan, id } = await setUp()
    const bobTrip = await bob.shared.acceptFolder(id)
    await bob.repo.createNote({ content: 'Tickets', folderId: bobTrip })
    await bob.repo.createNote({ content: '', folderId: bobTrip }) // empty: not shared yet
    await bob.shared.sync()
    await ann.shared.sync()
    expect(await inFolder(ann, trip.id)).toEqual(['Hotel Roma', 'Plan', 'Tickets'])

    const bobPlan = (await bob.repo.listNotes()).items.find((n) => n.title === 'Plan')
    await typeInEditor(bob, bobPlan?.sharedId as string, (t) => t.insert(t.length, ' v2'))
    await bob.shared.sync()
    await ann.shared.sync()
    expect(await content(ann, plan.id)).toBe('Plan v2')

    await ann.repo.renameFolder(trip.id, 'Rome trip')
    await ann.shared.sync()
    await bob.shared.sync()
    expect(await tree(bob)).toEqual(['Rome trip', 'Rome trip/Hotels'])
  })

  it('a note deleted in the folder is deleted for everyone once its undo has run out', async () => {
    const { ann, bob, trip, plan, id } = await setUp()
    const bobTrip = await bob.shared.acceptFolder(id)
    const bobPlan = (await bob.repo.listNotes()).items.find((n) => n.title === 'Plan')
    await bob.repo.deleteNote(bobPlan?.id as string)
    await bob.shared.sync()
    await ann.shared.sync()
    expect(await content(ann, plan.id)).toBe('Plan') // still undoable on Bob's side
    offset = 20_000
    await bob.shared.sync()
    await ann.shared.sync()
    expect(await ann.repo.getNote(plan.id)).toBeNull()
    expect(await inFolder(ann, trip.id)).toEqual(['Hotel Roma'])
    expect(await inFolder(bob, bobTrip)).toEqual(['Hotel Roma'])
  })

  it('a note deleted in the folder and brought back joins it again', async () => {
    const { ann, bob, trip, plan, id } = await setUp()
    const bobTrip = await bob.shared.acceptFolder(id)
    await ann.repo.deleteNote(plan.id)
    offset = 20_000
    await ann.shared.sync()
    await bob.shared.sync()
    expect(await inFolder(bob, bobTrip)).toEqual(['Hotel Roma'])
    // Undone later (the AI activity log, the trash): the same note, the same server record.
    await ann.repo.restoreNote(plan.id)
    await ann.shared.sync()
    await bob.shared.sync()
    expect(await inFolder(ann, trip.id)).toEqual(['Hotel Roma', 'Plan'])
    expect(await inFolder(bob, bobTrip)).toEqual(['Hotel Roma', 'Plan'])
  })

  it('a note moves from one shared folder of the owner to another', async () => {
    const { ann, bob, plan, id } = await setUp()
    const bobTrip = await bob.shared.acceptFolder(id)
    const work = await ann.repo.createFolder('Work')
    const workId = await ann.shared.shareFolder(work.id)
    await ann.shared.inviteToFolder(workId, 'bob@x.io', 'edit')
    const bobWork = await bob.shared.acceptFolder(workId)
    await ann.repo.moveNote(plan.id, work.id)
    await ann.shared.sync()
    await ann.shared.sync()
    await bob.shared.sync()
    expect(await inFolder(bob, bobTrip)).toEqual(['Hotel Roma'])
    expect(await inFolder(bob, bobWork)).toEqual(['Plan'])
  })

  it('the owner moves a note out: members lose it, the owner keeps it', async () => {
    const { ann, bob, hotel, id } = await setUp()
    const bobTrip = await bob.shared.acceptFolder(id)
    await ann.repo.moveNote(hotel.id, null)
    await ann.shared.sync()
    await bob.shared.sync()
    expect(await inFolder(bob, bobTrip)).toEqual(['Plan'])
    expect(await content(ann, hotel.id)).toBe('Hotel Roma')
    expect((await ann.repo.getNote(hotel.id))?.sharedId).toBeNull()
  })

  it('a viewer can change nothing in the folder, and still gets every change', async () => {
    const { ann, cat, trip, plan, id } = await setUp()
    const catTrip = await cat.shared.acceptFolder(id)
    expect(await cat.shared.folderOf(catTrip)).toMatchObject({ role: 'view' })
    expect((await cat.repo.listFolders()).find((f) => f.id === catTrip)?.shared).toBe('view')
    const catPlan = (await cat.repo.listNotes()).items.find((n) => n.title === 'Plan')
    expect(catPlan?.readOnly).toBe(true)
    const noteId = catPlan?.id as string
    const denied = [
      cat.repo.createNote({ content: 'From the viewer', folderId: catTrip }),
      cat.repo.updateContent(noteId, 'Changed'),
      cat.repo.moveNote(noteId, null),
      cat.repo.deleteNote(noteId),
      cat.repo.createFolder('Sub', catTrip),
      cat.repo.renameFolder(catTrip, 'Mine'),
    ]
    for (const attempt of denied) await expect(attempt).rejects.toBeInstanceOf(ReadOnlyError)
    // Not an edit of the note: pinning it for oneself is fine.
    await cat.repo.setPinned(noteId, true)
    // Nor may a note be moved in from outside.
    const own = await cat.repo.createNote({ content: 'Mine' })
    await expect(cat.repo.moveNote(own.id, catTrip)).rejects.toBeInstanceOf(ReadOnlyError)

    await ann.repo.updateContent(plan.id, 'Plan v3')
    await ann.shared.sync()
    await cat.shared.sync()
    expect(await content(cat, noteId)).toBe('Plan v3')
    expect(await inFolder(ann, trip.id)).toEqual(['Hotel Roma', 'Plan v3'])
  })

  it('unsharing: members lose folder and notes, the owner keeps both', async () => {
    const { ann, bob, trip, id } = await setUp()
    await bob.shared.acceptFolder(id)
    await ann.shared.unshareFolder(id)
    expect(await ann.shared.folder(trip.id)).toBeNull()
    expect(await inFolder(ann, trip.id)).toEqual(['Hotel Roma', 'Plan'])
    const report = await bob.shared.sync()
    expect(report.removedFolders).toHaveLength(1)
    expect(await bob.repo.listFolders()).toEqual([])
    expect((await bob.repo.listNotes()).items).toEqual([])
  })

  it('a member deleting their copy of the folder leaves it (after the undo)', async () => {
    const { ann, bob, id } = await setUp()
    const bobTrip = await bob.shared.acceptFolder(id)
    await bob.repo.deleteFolder(bobTrip)
    await bob.shared.sync()
    expect((await ann.shared.folderMembers(id)).map((m) => m.email)).toContain('bob@x.io')
    offset = 20_000
    await bob.shared.sync()
    expect((await ann.shared.folderMembers(id)).map((m) => m.email)).not.toContain('bob@x.io')
    expect((await bob.repo.listNotes()).items).toEqual([])
  })

  it("links the owner's notes on the owner's other device instead of copying them", async () => {
    const annAccount = await account('ann', 'ann@x.io')
    const mac = await annAccount.device()
    const pc = await annAccount.device()
    const folder = await mac.repo.createFolder('Work')
    const note = await mac.repo.createNote({ content: 'Budget', folderId: folder.id })
    // The personal sync brought the folder and note (same ids) to the other device earlier.
    await new NotesRepo(pc.db, { newId: () => folder.id }).createFolder('Work')
    await new NotesRepo(pc.db, { newId: () => note.id }).createNote({
      content: 'Budget',
      folderId: folder.id,
    })
    await mac.shared.shareFolder(folder.id)
    await pc.shared.sync()
    expect((await pc.repo.listFolders()).map((f) => f.name)).toEqual(['Work'])
    expect((await pc.repo.listNotes()).items).toHaveLength(1)
    expect((await pc.repo.getNote(note.id))?.sharedId).not.toBeNull()
  })

  it('editors reorganize the subfolders; everyone gets the same tree', async () => {
    const { ann, bob, cat, trip, id } = await setUp()
    const bobTrip = await bob.shared.acceptFolder(id)
    await cat.shared.acceptFolder(id)
    // Bob makes a subfolder and moves the plan into it.
    const ideas = await bob.repo.createFolder('Ideas', bobTrip)
    const plan = (await bob.repo.listNotes()).items.find((n) => n.title === 'Plan')
    await bob.repo.moveNote(plan?.id as string, ideas.id)
    await bob.shared.sync()
    await ann.shared.sync()
    await cat.shared.sync()
    for (const d of [ann, cat]) {
      expect(await tree(d)).toEqual(['Trip', 'Trip/Hotels', 'Trip/Ideas'])
      expect(await where(d)).toMatchObject({ Plan: 'Ideas', 'Hotel Roma': 'Hotels' })
    }
    // Bob's subfolder stays out of his own folders (it is Ann's folder).
    const [row] = await bob.db.query<{ shared_id: string | null }>(
      'SELECT shared_id FROM folders WHERE id = ?',
      [ideas.id],
    )
    expect(row?.shared_id).toBe(id)
    // Ann's copy is her own folder: it goes to her other devices with her personal sync.
    const [annRow] = await ann.db.query<{ shared_id: string | null }>(
      'SELECT shared_id FROM folders WHERE id = ?',
      [ideas.id],
    )
    expect(annRow?.shared_id).toBeNull()

    // Bob deletes Hotels: its note goes up to Trip for everyone.
    const hotels = (await bob.repo.listFolders()).find((f) => f.name === 'Hotels')
    await bob.repo.deleteFolder(hotels?.id as string)
    await bob.shared.sync()
    await ann.shared.sync()
    await cat.shared.sync()
    for (const d of [ann, bob, cat]) {
      expect(await tree(d)).toEqual(['Trip', 'Trip/Ideas'])
      expect(await where(d)).toMatchObject({ 'Hotel Roma': 'Trip' })
    }
    expect(await inFolder(ann, trip.id)).toEqual(['Hotel Roma', 'Plan'])

    // A viewer cannot make subfolders there.
    const catTrip = (await cat.repo.listFolders()).find((f) => f.name === 'Trip')
    await expect(cat.repo.createFolder('Mine', catTrip?.id)).rejects.toBeInstanceOf(ReadOnlyError)
  })

  it('two people reorganizing at once both keep their changes', async () => {
    const { ann, bob, trip, id } = await setUp()
    const bobTrip = await bob.shared.acceptFolder(id)
    await ann.repo.createFolder('Food', trip.id)
    await bob.repo.createFolder('Museums', bobTrip)
    await ann.shared.sync()
    await bob.shared.sync() // Bob saves after Ann: merges hers and saves again
    await ann.shared.sync()
    for (const d of [ann, bob])
      expect(await tree(d)).toEqual(['Trip', 'Trip/Food', 'Trip/Hotels', 'Trip/Museums'])
  })
})
