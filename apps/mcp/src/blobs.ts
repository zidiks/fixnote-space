import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BlobStore } from '@fixnote/core'

/**
 * "att/<id>" → "att_<id>", exactly as the desktop app names its files (src-tauri/src/blobs.rs), so
 * both read and write the same ones.
 */
export function blobFileName(key: string): string {
  if (!key || key.length > 200) throw new Error('bad blob key')
  const name = key.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  if (!name) throw new Error('bad blob key')
  return name
}

/** The app's attachment folder: `blobs/` next to the database. */
export const blobsDirFor = (databasePath: string) => join(dirname(databasePath), 'blobs')

/** Attachment bytes in the desktop app's folder. */
export function fileBlobStore(dir: string): BlobStore {
  const path = (key: string) => join(dir, blobFileName(key))
  return {
    async put(key, data) {
      mkdirSync(dir, { recursive: true })
      const target = path(key)
      // Write then rename, so the app never reads half a file.
      const tmp = `${target}.part`
      writeFileSync(tmp, new Uint8Array(await data.arrayBuffer()))
      renameSync(tmp, target)
    },
    async get(key) {
      try {
        return new Blob([readFileSync(path(key))])
      } catch {
        return null
      }
    },
    async delete(key) {
      rmSync(path(key), { force: true })
    },
  }
}
