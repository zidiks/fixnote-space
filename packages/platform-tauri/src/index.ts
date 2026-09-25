import { NotImplementedError, type Platform } from '@fixnote/core'
import { invoke, isTauri } from '@tauri-apps/api/core'

export { isTauri }

export interface AppInfo {
  version: string
  os: string
  arch: string
}

/** Round-trip to the Rust side; proves the bridge works. */
export function appInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('app_info')
}

/**
 * Desktop adapters backed by the Rust side of apps/desktop.
 * M1: tauri-plugin-sql. M2: OS keychain, app-data blobs.
 * M3: fastembed embedder. M4: whisper.cpp transcriber.
 */
export function createTauriPlatform(): Platform {
  return {
    kind: 'desktop',
    capabilities: {
      localTranscription: true,
      localOnlyMode: true,
      localMcp: true,
      globalShortcut: true,
    },
    sql: () => Promise.reject(new NotImplementedError('SqlDriver (tauri-plugin-sql)', 'M1')),
    embedder: () => Promise.reject(new NotImplementedError('Embedder (fastembed)', 'M3')),
    transcriber: () => Promise.reject(new NotImplementedError('Transcriber (whisper.cpp)', 'M4')),
    keyStore: {
      load: () => Promise.reject(new NotImplementedError('KeyStore (OS keychain)', 'M2')),
      save: () => Promise.reject(new NotImplementedError('KeyStore (OS keychain)', 'M2')),
      clear: () => Promise.reject(new NotImplementedError('KeyStore (OS keychain)', 'M2')),
    },
    blobs: {
      put: () => Promise.reject(new NotImplementedError('BlobStore (app data)', 'M2')),
      get: () => Promise.reject(new NotImplementedError('BlobStore (app data)', 'M2')),
      delete: () => Promise.reject(new NotImplementedError('BlobStore (app data)', 'M2')),
    },
  }
}
