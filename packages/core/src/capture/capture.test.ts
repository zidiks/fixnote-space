import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Attachments } from '../attachments'
import { cryptoReady, deriveKeys, publicKeyB64, sealToPublicKey } from '../crypto'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { BlobStore, SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { type InboxItem, importInbox, parseCapturePayload } from './index'

const blobs = (): BlobStore => {
  const m = new Map<string, Blob>()
  return {
    put: async (k, b) => void m.set(k, b),
    get: async (k) => m.get(k) ?? null,
    delete: async (k) => void m.delete(k),
  }
}

beforeAll(cryptoReady)

describe('capture payloads', () => {
  it('accepts the three kinds and rejects anything else', () => {
    expect(parseCapturePayload('{"v":1,"kind":"text","text":"hi","receivedAt":1}')).toEqual({
      v: 1,
      kind: 'text',
      text: 'hi',
      receivedAt: 1,
    })
    expect(
      parseCapturePayload(
        '{"v":1,"kind":"photo","image":"AA==","mime":"image/jpeg","caption":" ","receivedAt":1}',
      ),
    ).toEqual({ v: 1, kind: 'photo', image: 'AA==', mime: 'image/jpeg', receivedAt: 1 })
    expect(parseCapturePayload('{"v":2,"kind":"text","text":"x","receivedAt":1}')).toBeNull()
    expect(parseCapturePayload('{"v":1,"kind":"video","receivedAt":1}')).toBeNull()
    expect(parseCapturePayload('not json')).toBeNull()
  })
})

describe('importInbox', () => {
  let db: SqlDriver
  let repo: NotesRepo
  let attachments: Attachments
  const keys = () => deriveKeys(new Uint8Array(16).fill(3))

  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
    repo = new NotesRepo(db)
    attachments = new Attachments(db, blobs())
  })

  it('turns text, photos and voice into notes and empties the server inbox', async () => {
    const pk = publicKeyB64(keys())
    const seal = (o: object) => sealToPublicKey(pk, JSON.stringify({ v: 1, receivedAt: 1, ...o }))
    const server: InboxItem[] = [
      { id: 'i1', channel: 'telegram', sealed: seal({ kind: 'text', text: 'Купить молоко\n' }) },
      {
        id: 'i2',
        channel: 'telegram',
        sealed: seal({ kind: 'photo', image: btoa('JPEG'), mime: 'image/jpeg', caption: 'Доска' }),
      },
      {
        id: 'i3',
        channel: 'telegram',
        sealed: seal({ kind: 'voice', audio: btoa('OGG'), mime: 'audio/ogg', durationSec: 3 }),
      },
      {
        id: 'i4',
        channel: 'telegram',
        sealed: sealToPublicKey(publicKeyB64(deriveKeys(new Uint8Array(16).fill(9))), '{}'),
      },
    ]
    const remote = {
      list: async () => [...server],
      remove: async (id: string) =>
        void server.splice(
          server.findIndex((x) => x.id === id),
          1,
        ),
    }
    const heard: string[] = []
    const result = await importInbox({
      db,
      keys: keys(),
      remote,
      repo,
      attachments,
      transcribe: async (audio) => {
        heard.push(await audio.text())
        return 'Позвонить маме'
      },
    })
    expect(result).toEqual({ imported: 3, failed: 1 })
    expect(server).toEqual([])
    expect(heard).toEqual(['OGG'])
    const contents = (await db.query<{ content: string }>('SELECT content FROM notes')).map((r) =>
      r.content.replace(/attachment:[\w-]+/g, 'attachment:ID'),
    )
    expect(contents.sort()).toEqual(
      [
        'Купить молоко',
        '![](attachment:ID)\n\nДоска',
        'Позвонить маме\n\n![](attachment:ID)',
      ].sort(),
    )
    expect(await attachments.pendingCount()).toBe(2)
  })

  it('does not import an item twice after an interrupted removal', async () => {
    const pk = publicKeyB64(keys())
    const item = {
      id: 'x',
      channel: 'telegram',
      sealed: sealToPublicKey(pk, '{"v":1,"kind":"text","text":"once","receivedAt":1}'),
    }
    let fail = true
    const remote = {
      list: async () => [item],
      remove: async () => {
        if (fail) throw new Error('offline')
      },
    }
    await expect(importInbox({ db, keys: keys(), remote, repo, attachments })).rejects.toThrow(
      'offline',
    )
    fail = false
    expect(await importInbox({ db, keys: keys(), remote, repo, attachments })).toEqual({
      imported: 0,
      failed: 0,
    })
    expect(await db.query('SELECT id FROM notes')).toHaveLength(1)
  })
})
