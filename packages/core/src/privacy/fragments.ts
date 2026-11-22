import {
  cryptoReady,
  openProtectedFragment,
  type ProtectedFragmentIdentity,
  sealProtectedFragment,
} from '../crypto'
import type { BlobStore } from '../platform'

const pathFor = (id: string) => `protected/${id}`
const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const MAX_BYTES = 256 * 1024
const MIME = 'application/vnd.fixnote.protected-fragment'

/**
 * Immutable local records. The editor can put an opaque reference in the note after create()
 * resolves. Changing the secret or audience requires a new record and a new reference.
 */
export class ProtectedFragments {
  constructor(private readonly blobs: BlobStore) {}

  async create(
    note: Pick<ProtectedFragmentIdentity, 'noteId' | 'audience'>,
    key: Uint8Array,
    markdown: string,
  ): Promise<ProtectedFragmentIdentity> {
    const size = new TextEncoder().encode(markdown).byteLength
    if (size === 0 || size > MAX_BYTES) throw new Error('Invalid protected fragment size')
    await cryptoReady()
    const identity = { ...note, fragmentId: crypto.randomUUID() }
    const ciphertext = sealProtectedFragment(key, identity, markdown)
    await this.blobs.put(pathFor(identity.fragmentId), new Blob([ciphertext], { type: MIME }))
    return identity
  }

  async read(identity: ProtectedFragmentIdentity, key: Uint8Array): Promise<string | null> {
    if (!ID.test(identity.fragmentId)) return null
    const blob = await this.blobs.get(pathFor(identity.fragmentId))
    if (!blob) return null
    // Local storage and future downloaded payloads are treated as untrusted.
    if (blob.size > MAX_BYTES * 2) throw new Error('Invalid protected fragment size')
    await cryptoReady()
    return openProtectedFragment(key, identity, await blob.text())
  }

  async cache(
    identity: ProtectedFragmentIdentity,
    key: Uint8Array,
    markdown: string,
  ): Promise<void> {
    if (!ID.test(identity.fragmentId) || markdown.length > MAX_BYTES)
      throw new Error('Invalid protected fragment')
    await cryptoReady()
    const ciphertext = sealProtectedFragment(key, identity, markdown)
    await this.blobs.put(pathFor(identity.fragmentId), new Blob([ciphertext], { type: MIME }))
  }

  async remove(id: string): Promise<void> {
    if (ID.test(id)) await this.blobs.delete(pathFor(id))
  }
}
