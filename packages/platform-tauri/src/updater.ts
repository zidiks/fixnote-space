import type { AppUpdater } from '@fixnote/core'
import { invoke } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

interface Info {
  version: string
  updates: boolean
  store: boolean
}

/**
 * Updates from signed GitHub releases (endpoint and public key in tauri.conf.json). Windows runs the
 * new installer in passive mode, which restarts the app; macOS swaps the app bundle, then we
 * restart it. The Microsoft Store build never updates itself: the Store does it.
 */
export function tauriUpdater(): AppUpdater {
  let info: Promise<Info> | null = null
  const load = () => {
    info ??= invoke<Info>('app_info')
    return info
  }
  return {
    info: async () => {
      const { version, updates, store } = await load()
      return { version, enabled: updates, store }
    },
    check: async () => {
      if (!(await load()).updates) return null
      const update = await check()
      if (!update) return null
      return {
        version: update.version,
        notes: update.body?.trim() || null,
        install: async (onProgress) => {
          let total = 0
          let done = 0
          await update.downloadAndInstall((event) => {
            if (event.event === 'Started') total = event.data.contentLength ?? 0
            else if (event.event === 'Progress') {
              done += event.data.chunkLength
              onProgress?.(total ? Math.min(done / total, 1) : null)
            }
          })
          await relaunch()
        },
      }
    },
  }
}
