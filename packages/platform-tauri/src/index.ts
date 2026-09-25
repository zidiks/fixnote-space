import type { FetchedPage, Platform, WindowChrome } from '@fixnote/core'
import { createTransformersEmbedder } from '@fixnote/platform-web/embed'
import { createWhisperTranscriber } from '@fixnote/platform-web/whisper'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { appDataBlobStore } from './blobs'
import { tauriFetch } from './http'
import { osKeyStore, osSecretStore } from './keys'
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
 * M1: rusqlite (done). M2: OS keychain (done). M4: app-data blobs (done).
 * M3: embedder shared with the web app (done). M4: Whisper shared with the web app (done).
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
  let transcriber: ReturnType<typeof createWhisperTranscriber> | null = null
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
    // Same engine as the web app; WebView2 has WebGPU, so dictation runs on the GPU when it can.
    transcriber: () => {
      transcriber ??= createWhisperTranscriber()
      return Promise.resolve(transcriber)
    },
    keyStore: osKeyStore,
    secrets: osSecretStore,
    httpFetch: tauriFetch,
    // Pages are read by the app itself: no server learns which links a note contains.
    fetchPage: (url) => invoke<FetchedPage>('fetch_page', { url }),
    openExternal: (url) => openUrl(url),
    mcp: {
      info: () => invoke<{ command: string; built: boolean }>('mcp_info'),
      connect: (client) => invoke<string>('mcp_connect', { client }),
    },
    saveFile: async (name, data) =>
      (await invoke<boolean>('save_file', data, {
        headers: { 'x-file-name': encodeURIComponent(name) },
      }))
        ? 'saved'
        : 'cancelled',
    blobs: appDataBlobStore,
  }
}
