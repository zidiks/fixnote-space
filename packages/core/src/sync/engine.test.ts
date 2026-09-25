import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type AccountKeys, cryptoReady, deriveKeys, newRecoverySecret } from '../crypto'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { MemoryRemote } from '../testing/memory-remote'
import { SyncEngine } from './engine'
import { merge3 } from './merge'

let keys: AccountKeys
let remote: MemoryRemote
let clock: number

interface Device {
  db: SqlDriver
  repo: NotesRepo
  engine: SyncEngine
}

async function device(name: string): Promise<Device> {
  const db = await createMemoryDriver()
  await prepareDatabase(db)
  let seq = 0
  const opts = { now: () => clock++, newId: () => `${name}-${String(++seq).padStart(4, '0')}` }
  return {
    db,
    repo: new NotesRepo(db, opts),
    engine: new SyncEngine(db, remote, keys, { ...opts, conflictHeading: () => 'CONFLICT' }),
  }
}

const titles = async (d: Device) =>
  (await d.repo.listNotes({ limit: 100 })).items.map((n) => n.title).sort()

beforeAll(async () => {
  await cryptoReady()
  keys = deriveKeys(newRecoverySecret())
})

beforeEach(() => {
  remote = new MemoryRemote()
  clock = 1_000
})

describe('merge3', () => {
  it('takes the only changed side and merges separate paragraphs', () => {
    expect(merge3('a', 'a', 'b')).toBe('b')
    expect(merge3('b', 'a', 'a')).toBe('b')
    expect(merge3('X\n\nb', 'a\n\nb', 'a\n\nY')).toBe('X\n\nY')
    expect(merge3('X', 'a', 'Y')).toBeNull()
  })
})

describe('SyncEngine', () => {
  it('moves notes, folders and tags between devices, encrypted on the way', async () => {
    const a = await device('a')
    const b = await device('b')
    const folder = await a.repo.createFolder('Работа')
    const sub = await a.repo.createFolder('Проекты', folder.id)
    await a.repo.createNote({ content: '# Секретный план #work', folderId: sub.id })
    expect(await a.engine.sync()).toMatchObject({ pushed: 3 })

    for (const n of remote.notes.values()) expect(n.ciphertext).not.toContain('план')
    for (const f of remote.folders.values()) expect(f.nameSealed).not.toContain('Работа')

    expect(await b.engine.sync()).toMatchObject({ pulled: 3, pushed: 0 })
    const [note] = (await b.repo.listNotes()).items
    expect(note).toMatchObject({ title: 'Секретный план #work', folderId: sub.id, tags: ['work'] })
    expect((await b.repo.listFolders()).map((f) => [f.name, f.parentId])).toEqual([
      ['Проекты', folder.id],
      ['Работа', null],
    ])
    expect((await b.repo.search('план')).length).toBe(1)
  })

  it('is idempotent', async () => {
    const a = await device('a')
    await a.repo.createNote({ content: 'x' })
    await a.engine.sync()
    expect(await a.engine.sync()).toEqual({ pulled: 0, pushed: 0, merged: 0, conflictCopies: 0 })
    expect(await a.engine.pendingCount()).toBe(0)
  })

  it('merges concurrent edits to different paragraphs on both devices', async () => {
    const a = await device('a')
    const b = await device('b')
    const n = await a.repo.createNote({ content: 'Title\n\nfirst\n\nsecond' })
    await a.engine.sync()
    await b.engine.sync()

    await a.repo.updateContent(n.id, 'Title\n\nfirst (edited on A)\n\nsecond')
    await b.repo.updateContent(n.id, 'Title\n\nfirst\n\nsecond (edited on B)')
    await a.engine.sync()
    expect(await b.engine.sync()).toMatchObject({ merged: 1, conflictCopies: 0 })
    await a.engine.sync()

    const expected = 'Title\n\nfirst (edited on A)\n\nsecond (edited on B)'
    expect((await a.repo.getNote(n.id))?.content).toBe(expected)
    expect((await b.repo.getNote(n.id))?.content).toBe(expected)
  })

  it('keeps both versions when the same line was changed on two devices', async () => {
    const a = await device('a')
    const b = await device('b')
    const n = await a.repo.createNote({ content: 'Plan\n\nmeet on Monday' })
    await a.engine.sync()
    await b.engine.sync()

    await a.repo.updateContent(n.id, 'Plan\n\nmeet on Tuesday')
    await b.repo.updateContent(n.id, 'Plan\n\nmeet on Friday')
    await a.engine.sync()
    expect(await b.engine.sync()).toMatchObject({ conflictCopies: 1 })
    await a.engine.sync()

    for (const d of [a, b]) {
      expect((await d.repo.getNote(n.id))?.content).toBe('Plan\n\nmeet on Tuesday')
      const all = (await d.repo.listNotes()).items
      expect(all).toHaveLength(2)
      const copy = all.find((x) => x.id !== n.id)
      expect((await d.repo.getNote(copy?.id ?? ''))?.content).toBe(
        'CONFLICT\n\nPlan\n\nmeet on Friday',
      )
    }
  })

  it('resolves move versus delete by the later change', async () => {
    const a = await device('a')
    const b = await device('b')
    const f = await a.repo.createFolder('F')
    const n = await a.repo.createNote({ content: 'x' })
    await a.engine.sync()
    await b.engine.sync()

    await a.repo.moveNote(n.id, f.id)
    await b.repo.deleteNote(n.id) // later clock tick → wins
    await a.engine.sync()
    await b.engine.sync()
    await a.engine.sync()
    expect(await a.repo.getNote(n.id)).toBeNull()
    expect(await b.repo.getNote(n.id)).toBeNull()
  })

  it('renames folders last-writer-wins', async () => {
    const a = await device('a')
    const b = await device('b')
    const f = await a.repo.createFolder('Old')
    await a.engine.sync()
    await b.engine.sync()
    await a.repo.renameFolder(f.id, 'From A')
    await b.repo.renameFolder(f.id, 'From B')
    await a.engine.sync()
    await b.engine.sync()
    await a.engine.sync()
    for (const d of [a, b]) expect((await d.repo.listFolders())[0]?.name).toBe('From B')
  })

  it('converges when two devices created a daily note for the same date offline', async () => {
    const a = await device('a')
    const b = await device('b')
    await a.repo.getOrCreateDaily('2026-09-25', () => '# Friday (A)')
    await b.repo.getOrCreateDaily('2026-09-25', () => '# Friday (B)')
    await a.engine.sync()
    await b.engine.sync()
    await a.engine.sync()
    for (const d of [a, b]) {
      const daily = (await d.repo.listNotes({ filter: { type: 'daily' } })).items
      expect(daily.filter((n) => n.dailyDate === '2026-09-25').map((n) => n.title)).toEqual([
        '# Friday (A)'.slice(2),
      ])
      expect(await titles(d)).toEqual(['Friday (A)', 'Friday (B)'])
    }
  })

  it('does not lose an edit made while a push is in flight', async () => {
    const a = await device('a')
    const n = await a.repo.createNote({ content: 'v1' })
    remote.beforePush = async () => {
      remote.beforePush = undefined
      await a.repo.updateContent(n.id, 'v2')
    }
    await a.engine.sync()
    expect(await a.engine.pendingCount()).toBe(1)
    await a.engine.sync()
    const b = await device('b')
    await b.engine.sync()
    expect((await b.repo.getNote(n.id))?.content).toBe('v2')
  })

  it('serializes overlapping sync calls', async () => {
    const a = await device('a')
    await a.repo.createNote({ content: 'x' })
    const [r1, r2] = await Promise.all([a.engine.sync(), a.engine.sync()])
    expect(r1.pushed + r2.pushed).toBe(1)
    expect(remote.notes.size).toBe(1)
  })
})
