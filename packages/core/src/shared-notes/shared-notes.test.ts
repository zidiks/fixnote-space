import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { cryptoReady, deriveKeys, newRecoverySecret, publicKeyB64 } from '../crypto'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { MemorySharedServer } from '../testing/memory-shared'
import { type DocProjector, PersonNotFoundError, SharedNotes } from './index'

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
      }),
    }
  }
  return { device }
}

const content = async (d: Device, noteId: string) => (await d.repo.getNote(noteId))?.content

beforeAll(cryptoReady)
beforeEach(() => {
  server = new MemorySharedServer()
})

describe('SharedNotes', () => {
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
      { sharedId: id, from: 'ann@x.io', role: 'edit', title: 'Plan' },
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
    await cat.repo.updateContent(catNote, 'Read me, changed by the viewer')
    await cat.shared.sync()
    // Not sent; the note goes back to the shared text.
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
    // A late save from an editor still open is ignored.
    await typeInEditor(bob, id, (t) => t.insert(0, 'Late '))
    await bob.shared.sync()
    expect(await content(bob, bobNote)).toBe('Agenda')
    await typeInEditor(ann, id, (t) => t.insert(t.length, ' v2'))
    await ann.shared.sync()
    await bob.shared.sync()
    expect(await content(bob, bobNote)).toBe('Agenda v2')
    expect(await content(ann, note.id)).toBe('Agenda v2')
  })
})
