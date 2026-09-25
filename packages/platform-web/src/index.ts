import { NotImplementedError, type Platform, type SqlDriver } from '@fixnote/core'
import { openWebSqlDriver } from './sqlite/client'

/**
 * Browser / PWA adapters.
 * M1: sqlite-wasm over OPFS (done). M2: WebCrypto key store, OPFS blobs.
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
    keyStore: {
      load: () => Promise.reject(new NotImplementedError('KeyStore (WebCrypto)', 'M2')),
      save: () => Promise.reject(new NotImplementedError('KeyStore (WebCrypto)', 'M2')),
      clear: () => Promise.reject(new NotImplementedError('KeyStore (WebCrypto)', 'M2')),
    },
    blobs: {
      put: () => Promise.reject(new NotImplementedError('BlobStore (OPFS)', 'M2')),
      get: () => Promise.reject(new NotImplementedError('BlobStore (OPFS)', 'M2')),
      delete: () => Promise.reject(new NotImplementedError('BlobStore (OPFS)', 'M2')),
    },
  }
}
