import type { Platform, SqlDriver } from '@fixnote/core'
import { opfsBlobStore } from './blobs'
import { createTransformersEmbedder } from './embed/client'
import { webKeyStore, webSecretStore } from './keys'
import { openWebSqlDriver } from './sqlite/client'
import { createWhisperTranscriber } from './whisper/client'

/**
 * Browser / PWA adapters.
 * M1: sqlite-wasm over OPFS (done). M2: WebCrypto key store (done). M4: OPFS blobs (done).
 * M3: transformers.js embedder (done). M4: on-device Whisper (done).
 */
export function createWebPlatform(): Platform {
  let sql: Promise<SqlDriver> | null = null
  let embedder: ReturnType<typeof createTransformersEmbedder> | null = null
  let transcriber: ReturnType<typeof createWhisperTranscriber> | null = null
  return {
    kind: 'web',
    chrome: 'browser',
    capabilities: {
      localTranscription: true,
      localOnlyMode: false,
      localMcp: false,
      globalShortcut: false,
    },
    sql: () => {
      sql ??= openWebSqlDriver()
      return sql
    },
    embedder: () => {
      embedder ??= createTransformersEmbedder()
      return Promise.resolve(embedder)
    },
    transcriber: () => {
      transcriber ??= createWhisperTranscriber()
      return Promise.resolve(transcriber)
    },
    keyStore: webKeyStore,
    secrets: webSecretStore,
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    saveFile: async (name, data, mime) => {
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
      const a = Object.assign(document.createElement('a'), { href: url, download: name })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      return 'saved'
    },
    blobs: opfsBlobStore,
  }
}
