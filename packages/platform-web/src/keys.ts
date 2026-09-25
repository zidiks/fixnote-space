import type { KeyStore } from '@fixnote/core'

/**
 * Browser key storage. A non-extractable AES-GCM key is created by WebCrypto and stored in
 * IndexedDB as a CryptoKey object: scripts can use it to encrypt and decrypt but can never read its
 * bytes. The recovery secret is stored only encrypted under that key.
 */
const DB = 'fixnote-keys'
const STORE = 'keys'
const RECORD = 'recovery-secret'

interface Stored {
  wrappingKey: CryptoKey
  iv: Uint8Array
  sealed: ArrayBuffer
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export const webKeyStore: KeyStore = {
  load: async () => {
    const stored = await run<Stored | undefined>('readonly', (s) => s.get(RECORD))
    if (!stored) return null
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: stored.iv as BufferSource },
      stored.wrappingKey,
      stored.sealed,
    )
    return new Uint8Array(plain)
  },
  save: async (secret) => {
    const wrappingKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      wrappingKey,
      secret as BufferSource,
    )
    await run('readwrite', (s) => s.put({ wrappingKey, iv, sealed } satisfies Stored, RECORD))
  },
  clear: async () => {
    await run('readwrite', (s) => s.delete(RECORD))
  },
}
