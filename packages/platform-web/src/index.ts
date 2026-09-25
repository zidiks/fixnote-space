import { NotImplementedError, type Platform, type SqlDriver } from '@fixnote/core'
import { webKeyStore } from './keys'
import { openWebSqlDriver } from './sqlite/client'

/**
 * Browser / PWA adapters.
 * M1: sqlite-wasm over OPFS (done). M2: WebCrypto key store (done), OPFS blobs.
 * M3: transformers.js embedder. M4: edge-function transcriber.
 */
export function createWebPlatform(): Platform {
  let sql: Promise<SqlDriver> | null = null
  return {
    kind: 'web',
    chrome: 'browser',
    capabilities: {
      localTranscription: false,
      localOnlyMode: false,
      localMcp: false,
      globalShortcut: false,
    },
    sql: () => {
      sql ??= openWebSqlDriver()
      return sql
    },
    embedder: () => Promise.reject(new NotImplementedError('Embedder (transformers.js)', 'M3')),
    transcriber: () => Promise.reject(new NotImplementedError('Transcriber (edge)', 'M4')),
    keyStore: webKeyStore,
    saveFile: async (name, data, mime) => {
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
      const a = Object.assign(document.createElement('a'), { href: url, download: name })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      return 'saved'
    },
    blobs: {
      put: () => Promise.reject(new NotImplementedError('BlobStore (OPFS)', 'M2')),
      get: () => Promise.reject(new NotImplementedError('BlobStore (OPFS)', 'M2')),
      delete: () => Promise.reject(new NotImplementedError('BlobStore (OPFS)', 'M2')),
    },
  }
}
