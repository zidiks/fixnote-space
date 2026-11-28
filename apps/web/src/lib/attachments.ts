import { type Attachments, attachmentUrl, MAX_ATTACHMENT_BYTES } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { toast } from 'sonner'
import { attachmentSource } from './account/account'
import { prepareImage } from './images'
import { readImagesSoon } from './ocr'
import { platform } from './platform'

export interface AttachmentFile {
  url: string
  mime: string
}

interface UrlEntry {
  task: Promise<AttachmentFile | null>
  resolved: AttachmentFile | null
  bytes: number
  refs: number
}

const MAX_IDLE_ENTRIES = 48
const MAX_IDLE_BYTES = 40 * 1024 * 1024
const HIDDEN_FLUSH_MS = 15_000

const entries = new Map<string, UrlEntry>()
let hiddenFlushTimer: ReturnType<typeof setTimeout> | undefined

function revokeEntry(id: string, entry: UrlEntry) {
  entries.delete(id)
  if (entry.resolved) {
    URL.revokeObjectURL(entry.resolved.url)
    entry.resolved = null
  } else {
    void entry.task.then((file) => {
      if (file) URL.revokeObjectURL(file.url)
    })
  }
}

function evictIdle(flushAll = false) {
  let idleCount = 0
  let idleBytes = 0
  for (const e of entries.values()) {
    if (e.refs <= 0) {
      idleCount++
      idleBytes += e.bytes
    }
  }
  if (!flushAll && idleCount <= MAX_IDLE_ENTRIES && idleBytes <= MAX_IDLE_BYTES) return
  // Map iteration order is LRU (entries are refreshed on access/release).
  for (const [id, entry] of entries) {
    if (entry.refs > 0) continue
    revokeEntry(id, entry)
    idleCount--
    idleBytes -= entry.bytes
    if (!flushAll && idleCount <= MAX_IDLE_ENTRIES && idleBytes <= MAX_IDLE_BYTES) break
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    clearTimeout(hiddenFlushTimer)
    hiddenFlushTimer = undefined
    if (document.hidden) {
      hiddenFlushTimer = setTimeout(() => evictIdle(true), HIDDEN_FLUSH_MS)
    }
  })
}

function touch(id: string, entry: UrlEntry) {
  entries.delete(id)
  entries.set(id, entry)
}

/**
 * Acquires a ref-counted object URL for an attachment. Pairs with `releaseAttachmentUrl(id)` on
 * unmount so recently viewed images stay instant in an LRU while unused blobs are revoked and freed.
 */
export function acquireAttachmentUrl(
  attachments: Attachments,
  id: string,
): Promise<AttachmentFile | null> {
  const known = entries.get(id)
  if (known) {
    known.refs++
    touch(id, known)
    return known.task
  }
  const entry: UrlEntry = {
    task: Promise.resolve(null),
    resolved: null,
    bytes: 0,
    refs: 1,
  }
  entry.task = attachments
    .load(id, attachmentSource())
    .then((blob) => {
      if (!blob) return null
      const file = { url: URL.createObjectURL(blob), mime: blob.type }
      if (entries.get(id) !== entry) {
        URL.revokeObjectURL(file.url)
        return null
      }
      entry.resolved = file
      entry.bytes = blob.size
      return file
    })
    .catch(() => null)
  entries.set(id, entry)
  void entry.task.then((file) => {
    if (!file && entries.get(id) === entry) entries.delete(id)
  })
  return entry.task
}

/** Releases a reference acquired by `acquireAttachmentUrl(id)` and trims the idle LRU if needed. */
export function releaseAttachmentUrl(id: string) {
  const entry = entries.get(id)
  if (!entry) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs === 0) {
    touch(id, entry)
    evictIdle(false)
  }
}

/**
 * An object URL for an attachment (untracked caller — subject to bounded LRU eviction).
 * Prefer `acquireAttachmentUrl` + `releaseAttachmentUrl` in mounted views.
 */
export function attachmentObjectUrl(
  attachments: Attachments,
  id: string,
): Promise<AttachmentFile | null> {
  const known = entries.get(id)
  if (known) {
    touch(id, known)
    return known.task
  }
  const task = acquireAttachmentUrl(attachments, id)
  releaseAttachmentUrl(id)
  return task
}

export class ImageTooLargeError extends Error {}

/** Stores a pasted or dropped image on this device; returns the Markdown source for it. */
export async function storeImage(attachments: Attachments, file: Blob): Promise<string> {
  const { blob, mime } = await prepareImage(file)
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new ImageTooLargeError()
  const info = await attachments.add(blob, mime)
  // Shown right away without reading the file back.
  const resolved = { url: URL.createObjectURL(blob), mime }
  entries.set(info.id, {
    task: Promise.resolve(resolved),
    resolved,
    bytes: blob.size,
    refs: 0,
  })
  evictIdle(false)
  readImagesSoon()
  return attachmentUrl(info.id)
}

export class FileTooLargeError extends Error {}

/** Stores a dropped file of any kind; returns the Markdown link to it, named after the file. */
export async function storeFile(attachments: Attachments, file: File): Promise<string> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new FileTooLargeError(file.name)
  const info = await attachments.add(file, file.type || 'application/octet-stream')
  const name = file.name.replace(/[[\]\\]/g, '\\$&') || 'file'
  readImagesSoon()
  // The size rides along as the link title, so every device shows it without the file.
  return `[${name}](${attachmentUrl(info.id)} "${fileSize(file.size)}")`
}

/** Stores a file and returns its structured metadata for direct editor insertion. */
export async function storeFileCard(
  attachments: Attachments,
  file: File,
): Promise<{ id: string; name: string; size: string; mime: string }> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new FileTooLargeError(file.name)
  const mime = file.type || 'application/octet-stream'
  const info = await attachments.add(file, mime)
  readImagesSoon()
  return {
    id: info.id,
    name: file.name || 'file',
    size: fileSize(file.size),
    mime,
  }
}

/** "340 KB", "1.2 MB" in the UI language. */
export function fileSize(bytes: number): string {
  const [value, unit] =
    bytes >= 1024 * 1024
      ? [bytes / 1024 / 1024, 'megabyte']
      : bytes >= 1024
        ? [bytes / 1024, 'kilobyte']
        : [bytes, 'byte']
  return new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)
}

/** Saves an attached file where the user chooses (a download on the web). */
export async function saveAttachment(attachments: Attachments, id: string, name: string) {
  try {
    const blob = await attachments.load(id, attachmentSource())
    if (!blob) {
      toast.error(i18n.t('drop.fileMissing'))
      return
    }
    await platform.saveFile(name, new Uint8Array(await blob.arrayBuffer()), blob.type)
  } catch (err) {
    toast.error(i18n.t('drop.fileMissing'), {
      description: err instanceof Error ? err.message : String(err),
    })
  }
}
