import type { BlobStore } from '@fixnote/core'
import { invoke } from '@tauri-apps/api/core'

/** Attachments in the app-data folder, through the Rust side (apps/desktop/src-tauri/src/blobs.rs). */
export const appDataBlobStore: BlobStore = {
  async put(key, data) {
    await invoke('blob_put', new Uint8Array(await data.arrayBuffer()), {
      headers: { 'x-blob-key': key },
    })
  },
  async get(key) {
    try {
      const bytes = await invoke<ArrayBuffer>('blob_get', { key })
      return new Blob([bytes])
    } catch (err) {
      if (String(err).includes('missing')) return null
      throw err
    }
  },
  async delete(key) {
    await invoke('blob_delete', { key })
  },
}
