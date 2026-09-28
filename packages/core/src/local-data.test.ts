import { beforeEach, describe, expect, it } from 'vitest'
import { Attachments } from './attachments'
import { prepareDatabase } from './db/migrate'
import { forgetLocalNotes, unsyncedChanges } from './local-data'
import { NotesRepo } from './notes/repo'
import type { BlobStore, SqlDriver } from './platform'
import { createMemoryDriver } from './testing/memory-driver'

describe('local notes of an account', () => {
  let db: SqlDriver
  const map = new Map<string, Blob>()
  const blobs: BlobStore = {
    put: async (k, b) => void map.set(k, b),
    get: async (k) => map.get(k) ?? null,
    delete: async (k) => void map.delete(k),
  }

  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
    map.clear()
  })

  it('counts what the server does not have, and forgets it all but the device settings', async () => {
    const repo = new NotesRepo(db)
    const folder = await repo.createFolder('Work')
    await repo.createNote({ content: 'Plan', folderId: folder.id })
    await new Attachments(db, blobs).add(new Blob(['x']), 'image/png')
    const kv = (key: string, value: string) =>
      db.execute('INSERT INTO kv (key, value) VALUES (?, ?)', [key, value])
    await kv('sync.notes.seq', '42')
    await kv('mcp.scope', '["f"]')
    await kv('mcp.access', 'read')
    expect(await unsyncedChanges(db)).toBe(3)

    await forgetLocalNotes(db, blobs)
    expect((await repo.listNotes()).items).toEqual([])
    expect(await repo.listFolders()).toEqual([])
    expect(await repo.search('Plan')).toEqual([])
    expect(map.size).toBe(0)
    expect(await unsyncedChanges(db)).toBe(0)
    const keys = await db.query<{ key: string }>('SELECT key FROM kv ORDER BY key')
    expect(keys.map((k) => k.key)).toEqual(['mcp.access'])
  })
})
