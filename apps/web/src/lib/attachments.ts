import { type Attachments, attachmentUrl, MAX_ATTACHMENT_BYTES } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { toast } from 'sonner'
import { attachmentSync } from './account/account'
import { prepareImage } from './images'
import { platform } from './platform'

export interface AttachmentFile {
  url: string
  mime: string
}

const urls = new Map<string, Promise<AttachmentFile | null>>()

/**
 * An object URL for an attachment, kept for the session so every view of it reuses one. A miss
 * (signed out, offline) is not remembered: the next view tries again.
 */
export function attachmentObjectUrl(
  attachments: Attachments,
  id: string,
): Promise<AttachmentFile | null> {
  const known = urls.get(id)
  if (known) return known
  const task = attachments
    .load(id, attachmentSync())
    .then((blob) => (blob ? { url: URL.createObjectURL(blob), mime: blob.type } : null))
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
  urls.set(info.id, Promise.resolve({ url: URL.createObjectURL(blob), mime }))
  return attachmentUrl(info.id)
}

export class FileTooLargeError extends Error {}

/** Stores a dropped file of any kind; returns the Markdown link to it, named after the file. */
export async function storeFile(attachments: Attachments, file: File): Promise<string> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new FileTooLargeError(file.name)
  const info = await attachments.add(file, file.type || 'application/octet-stream')
  const name = file.name.replace(/[[\]\\]/g, '\\$&') || 'file'
  return `[${name}](${attachmentUrl(info.id)})`
}

/** Saves an attached file where the user chooses (a download on the web). */
export async function saveAttachment(attachments: Attachments, id: string, name: string) {
  try {
    const blob = await attachments.load(id, attachmentSync())
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
