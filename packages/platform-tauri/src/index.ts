import { NotImplementedError, type Platform, type WindowChrome } from '@fixnote/core'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { openTauriSqlDriver } from './sql'
import { windowControls } from './window'

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
 * M1: rusqlite (done). M2: OS keychain, app-data blobs.
 * M3: fastembed embedder. M4: whisper.cpp transcriber.
 */
/** Matches tauri.windows.conf.json (frameless) and tauri.macos.conf.json (overlay title bar). */
function detectChrome(): WindowChrome {
  const ua = navigator.userAgent
  if (/Windows/.test(ua)) return 'custom'
  if (/Macintosh/.test(ua)) return 'mac-overlay'
  return 'native'
}

export function createTauriPlatform(): Platform {
  const sql = openTauriSqlDriver()
  const chrome = detectChrome()
  return {
    kind: 'desktop',
    chrome,
    ...(chrome === 'custom' ? { window: windowControls() } : {}),
    capabilities: {
      localTranscription: true,
      localOnlyMode: true,
      localMcp: true,
      globalShortcut: true,
    },
    sql: () => Promise.resolve(sql),
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
