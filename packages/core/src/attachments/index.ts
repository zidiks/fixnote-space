import { type AccountKeys, decryptAttachment, encryptAttachment } from '../crypto'
import type { BlobStore, SqlDriver } from '../platform'

/** How Markdown refers to a local attachment: ![](attachment:<id>). */
export const ATTACHMENT_SCHEME = 'attachment:'

/** Biggest file we accept, after any downscaling. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export const attachmentUrl = (id: string) => `${ATTACHMENT_SCHEME}${id}`

export function attachmentIdFromUrl(url: string): string | null {
  if (!url.startsWith(ATTACHMENT_SCHEME)) return null
  const id = url.slice(ATTACHMENT_SCHEME.length)
  return /^[\w-]{1,64}$/.test(id) ? id : null
}

/** Attachment ids a note refers to, in order, without repeats. */
export function attachmentIds(markdown: string): string[] {
  const ids = new Set<string>()
  for (const m of markdown.matchAll(/\]\(attachment:([\w-]{1,64})\)/g)) ids.add(m[1] as string)
  return [...ids]
}

/** Encrypted copies on the server (Supabase Storage in production). */
export interface AttachmentRemote {
  upload(id: string, blob: Uint8Array): Promise<void>
  /** Null when the server has no such file. */
  download(id: string): Promise<Uint8Array | null>
}

export interface AttachmentInfo {
  id: string
  mime: string
  size: number
  uploaded: boolean
}

const blobKey = (id: string) => `att/${id}`

/**
 * Attachments on this device: bytes in the BlobStore, a row in `attachments`. New files wait for
 * `uploadPending`; files another device added are fetched on first use by `load`.
 */
export class Attachments {
  private downloads = new Map<string, Promise<Blob | null>>()

  constructor(
    private readonly db: SqlDriver,
    private readonly blobs: BlobStore,
    private readonly opts: { now?: () => number; newId?: () => string } = {},
  ) {}

  async add(data: Blob, mime: string): Promise<AttachmentInfo> {
    if (data.size > MAX_ATTACHMENT_BYTES) throw new Error('Attachment is too large')
    const id = (this.opts.newId ?? (() => crypto.randomUUID()))()
    await this.blobs.put(blobKey(id), data)
    await this.db.execute(
      'INSERT INTO attachments (id, mime, size, created_at, uploaded) VALUES (?, ?, ?, ?, 0)',
      [id, mime, data.size, (this.opts.now ?? Date.now)()],
    )
    return { id, mime, size: data.size, uploaded: false }
  }

  async info(id: string): Promise<AttachmentInfo | null> {
    const [row] = await this.db.query<{ id: string; mime: string; size: number; uploaded: number }>(
      'SELECT id, mime, size, uploaded FROM attachments WHERE id = ?',
      [id],
    )
    return row
      ? { id: row.id, mime: row.mime, size: Number(row.size), uploaded: Number(row.uploaded) === 1 }
      : null
  }

  /** The file, from this device or downloaded (and kept) when signed in; null if unavailable. */
  async load(
    id: string,
    sync?: { keys: AccountKeys; remote: AttachmentRemote },
  ): Promise<Blob | null> {
    const info = await this.info(id)
    if (info) {
      const local = await this.blobs.get(blobKey(id))
      if (local) return local.type ? local : new Blob([local], { type: info.mime })
    }
    if (!sync) return null
    const running = this.downloads.get(id)
    if (running) return running
    const task = (async () => {
      const sealed = await sync.remote.download(id)
      if (!sealed) return null
      const { mime, bytes } = decryptAttachment(sync.keys, id, sealed)
      const blob = new Blob([bytes as BlobPart], { type: mime })
      await this.blobs.put(blobKey(id), blob)
      await this.db.execute(
        `INSERT INTO attachments (id, mime, size, created_at, uploaded) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (id) DO UPDATE SET mime = excluded.mime, size = excluded.size, uploaded = 1`,
        [id, mime, bytes.length, (this.opts.now ?? Date.now)()],
      )
      return blob
    })()
    this.downloads.set(id, task)
    try {
      return await task
    } finally {
      this.downloads.delete(id)
    }
  }

  async pendingCount(): Promise<number> {
    const [row] = await this.db.query<{ n: number }>(
      'SELECT count(*) AS n FROM attachments WHERE uploaded = 0',
    )
    return Number(row?.n ?? 0)
  }

  /** Encrypts and uploads files not yet on the server. Returns how many were uploaded. */
  async uploadPending(keys: AccountKeys, remote: AttachmentRemote): Promise<number> {
    const rows = await this.db.query<{ id: string; mime: string }>(
      'SELECT id, mime FROM attachments WHERE uploaded = 0 ORDER BY created_at',
    )
    let done = 0
    for (const row of rows) {
      const blob = await this.blobs.get(blobKey(row.id))
      if (!blob) {
        // Bytes are gone (storage cleared); nothing to upload, stop retrying.
        await this.db.execute('DELETE FROM attachments WHERE id = ?', [row.id])
        continue
      }
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await remote.upload(row.id, encryptAttachment(keys, row.id, row.mime, bytes))
      await this.db.execute('UPDATE attachments SET uploaded = 1 WHERE id = ?', [row.id])
      done++
    }
    return done
  }
}
