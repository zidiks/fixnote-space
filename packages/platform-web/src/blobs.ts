import type { BlobStore } from '@fixnote/core'

/** Keys like "att/<id>" become flat file names in OPFS. */
const fileName = (key: string) => key.replace(/[^\w.-]/g, '_')

let dir: Promise<FileSystemDirectoryHandle> | null = null
function blobsDir() {
  dir ??= navigator.storage
    .getDirectory()
    .then((root) => root.getDirectoryHandle('blobs', { create: true }))
  dir.catch(() => {
    dir = null
  })
  return dir
}

/**
 * Attachments in the origin-private file system (next to the database). Private to this site,
 * kept across reloads, cleared only with site data.
 */
export const opfsBlobStore: BlobStore = {
  async put(key, data) {
    const handle = await (await blobsDir()).getFileHandle(fileName(key), { create: true })
    const writable = await handle.createWritable()
    await writable.write(data)
    await writable.close()
  },
  async get(key) {
    try {
      const handle = await (await blobsDir()).getFileHandle(fileName(key))
      return await handle.getFile()
    } catch {
      return null
    }
  },
  async delete(key) {
    try {
      await (await blobsDir()).removeEntry(fileName(key))
    } catch {
      // already gone
    }
  },
}
