import { NotImplementedError, type Platform, type WindowChrome } from '@fixnote/core'
import { createTransformersEmbedder } from '@fixnote/platform-web/embed'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { osKeyStore } from './keys'
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
 * M1: rusqlite (done). M2: OS keychain (done), app-data blobs.
 * M3: embedder shared with the web app (done). M4: whisper.cpp transcriber.
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
  let embedder: ReturnType<typeof createTransformersEmbedder> | null = null
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
    // Same engine as the web app (WebView2 is Chromium), so vectors match across devices.
    embedder: () => {
      embedder ??= createTransformersEmbedder()
      return Promise.resolve(embedder)
    },
    transcriber: () => Promise.reject(new NotImplementedError('Transcriber (whisper.cpp)', 'M4')),
    keyStore: osKeyStore,
    saveFile: async (name, data) =>
      (await invoke<boolean>('save_file', data, {
        headers: { 'x-file-name': encodeURIComponent(name) },
      }))
        ? 'saved'
        : 'cancelled',
    blobs: {
      put: () => Promise.reject(new NotImplementedError('BlobStore (app data)', 'M2')),
      get: () => Promise.reject(new NotImplementedError('BlobStore (app data)', 'M2')),
      delete: () => Promise.reject(new NotImplementedError('BlobStore (app data)', 'M2')),
    },
  }
}
