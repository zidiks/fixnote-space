import { describe, expect, it } from 'vitest'
import { cryptoReady, newNoteKey, noteKeyBytes } from '../crypto'
import type { BlobStore } from '../platform'
import { ProtectedFragments } from './fragments'

describe('protected fragment storage', () => {
  it('persists only ciphertext bound to the fragment, note, audience and key', async () => {
    const files = new Map<string, Blob>()
    const blobs: BlobStore = {
      async put(path, blob) {
        files.set(path, blob)
      },
      async get(path) {
        return files.get(path) ?? null
      },
      async delete(path) {
        files.delete(path)
      },
    }
    await cryptoReady()
    const key = noteKeyBytes(newNoteKey())
    const anotherKey = noteKeyBytes(newNoteKey())
    const store = new ProtectedFragments(blobs)
    const plain = 'Пароль: **local-fixture-value**\n\nвторая строка'
    const ref = await store.create({ noteId: 'a', audience: 'personal' }, key, plain)
    const next = await store.create({ noteId: 'a', audience: 'personal' }, key, plain)
    expect(next.fragmentId).not.toBe(ref.fragmentId)
    const blob = files.get(`protected/${ref.fragmentId}`) as Blob
    expect(await blob.text()).not.toContain('local-fixture-value')
    await expect(store.read(ref, key)).resolves.toBe(plain)
    await expect(store.read({ ...ref, noteId: 'b' }, key)).rejects.toThrow()
    await expect(store.read({ ...ref, audience: 'members' }, key)).rejects.toThrow()
    await expect(store.read(ref, anotherKey)).rejects.toThrow()
    files.set(`protected/${next.fragmentId}`, blob)
    await expect(store.read(next, key)).rejects.toThrow()
  })
})
