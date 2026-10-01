import type { DeepLinks } from '@fixnote/core'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/** fixnote:// links (deep_link.rs): they wait in Rust until taken, so none is missed at startup. */
export const deepLinks: DeepLinks = {
  listen: async (cb) => {
    const take = async () => {
      for (const url of await invoke<string[]>('deep_links_take')) cb(url)
    }
    const unlisten = await listen('deep-link', () => void take())
    await take()
    return unlisten
  },
}
