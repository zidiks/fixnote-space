import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cryptoReady, deriveKeys } from '../crypto'
import { prepareDatabase } from '../db/migrate'
import type { BlobStore, SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { type AttachmentRemote, Attachments, attachmentIdFromUrl, attachmentIds } from './index'

function memoryBlobs(): BlobStore & { map: Map<string, Blob> } {
  const map = new Map<string, Blob>()
  return {
    map,
    put: async (k, b) => void map.set(k, b),
    get: async (k) => map.get(k) ?? null,
    delete: async (k) => void map.delete(k),
  }
}

function memoryRemote(): AttachmentRemote & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  return {
    files,
    upload: async (id, blob) => void files.set(id, blob),
    download: async (id) => files.get(id) ?? null,
  }
}

beforeAll(cryptoReady)

describe('attachment references', () => {
  it('finds ids in Markdown and parses attachment URLs', () => {
    expect(
      attachmentIds(
        '![](attachment:a1)\ntext ![x](attachment:b-2) ![](attachment:a1) ![](https://x/y.png)',
      ),
    ).toEqual(['a1', 'b-2'])
    expect(attachmentIdFromUrl('attachment:abc')).toBe('abc')
    expect(attachmentIdFromUrl('attachment:../etc')).toBeNull()
    expect(attachmentIdFromUrl('https://x')).toBeNull()
  })
})

describe('Attachments', () => {
  let db: SqlDriver
  const keys = () => deriveKeys(new Uint8Array(16).fill(7))

  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
  })

  it('stores locally, uploads encrypted once, and another device downloads on demand', async () => {
    const remote = memoryRemote()
    let n = 0
    const a = new Attachments(db, memoryBlobs(), { newId: () => `id${++n}` })
    const info = await a.add(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      'image/png',
    )
    expect(info).toEqual({ id: 'id1', mime: 'image/png', size: 3, uploaded: false })
    expect(await a.pendingCount()).toBe(1)
    expect(await a.uploadPending(keys(), remote)).toBe(1)
    expect(await a.uploadPending(keys(), remote)).toBe(0)
    const sealed = remote.files.get('id1')
    expect(sealed && [...sealed].includes(1) && sealed.length > 40).toBe(true)

    const otherDb = await createMemoryDriver()
    await prepareDatabase(otherDb)
    const otherBlobs = memoryBlobs()
    const b = new Attachments(otherDb, otherBlobs)
    expect(await b.load('id1')).toBeNull()
    const [x, y] = await Promise.all([
      b.load('id1', { keys: keys(), remote }),
      b.load('id1', { keys: keys(), remote }),
    ])
    expect(x?.type).toBe('image/png')
    expect(new Uint8Array(await (x as Blob).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(y).toBe(x)
    expect(await b.info('id1')).toMatchObject({ uploaded: true, size: 3 })
    // Now local: no network needed.
    expect(await b.load('id1')).not.toBeNull()
    expect(await b.load('missing', { keys: keys(), remote })).toBeNull()
  })

  it('forgets rows whose bytes are gone instead of retrying forever', async () => {
    const blobs = memoryBlobs()
    const a = new Attachments(db, blobs, { newId: () => 'lost' })
    await a.add(new Blob(['x']), 'image/png')
    blobs.map.clear()
    expect(await a.uploadPending(keys(), memoryRemote())).toBe(0)
    expect(await a.pendingCount()).toBe(0)
  })

  it('refuses files that are too large', async () => {
    const a = new Attachments(db, memoryBlobs())
    const big = { size: 21 * 1024 * 1024 } as Blob
    await expect(a.add(big, 'image/png')).rejects.toThrow('too large')
  })
})
