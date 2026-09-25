import { type Attachments, attachmentUrl, MAX_ATTACHMENT_BYTES } from '@fixnote/core'
import { attachmentSync } from './account/account'
import { prepareImage } from './images'

const urls = new Map<string, Promise<string | null>>()

/**
 * An object URL for an attachment, kept for the session so every view of it reuses one. A miss
 * (signed out, offline) is not remembered: the next view tries again.
 */
export function attachmentObjectUrl(attachments: Attachments, id: string): Promise<string | null> {
  const known = urls.get(id)
  if (known) return known
  const task = attachments
    .load(id, attachmentSync())
    .then((blob) => (blob ? URL.createObjectURL(blob) : null))
    .catch(() => null)
  urls.set(id, task)
  void task.then((url) => {
    if (!url) urls.delete(id)
  })
  return task
}

export class ImageTooLargeError extends Error {}

/** Stores a pasted or dropped image on this device; returns the Markdown source for it. */
export async function storeImage(attachments: Attachments, file: Blob): Promise<string> {
  const { blob, mime } = await prepareImage(file)
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new ImageTooLargeError()
  const info = await attachments.add(blob, mime)
  // Shown right away without reading the file back.
  urls.set(info.id, Promise.resolve(URL.createObjectURL(blob)))
  return attachmentUrl(info.id)
}
