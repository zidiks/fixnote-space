import type { Attachments } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { FileTooLargeError, ImageTooLargeError, storeFile, storeImage } from './attachments'

/** Where a drop goes while a note is open: the note's editor. */
export interface DropSink {
  insert(markdown: string, at: { x: number; y: number } | null): void
}

let sink: DropSink | null = null

/** The open note takes drops; without one, a drop makes a new note. */
export function registerDropSink(next: DropSink): () => void {
  sink = next
  return () => {
    if (sink === next) sink = null
  }
}

export const dropSink = () => sink

/** Files read as text and put into the note as they are. */
const TEXT_FILE = /\.(md|markdown|txt|text)$/i
const MAX_TEXT_FILE = 1024 * 1024

/** Something from outside the app, not text dragged within a note. */
export function isExternalDrag(data: DataTransfer | null): boolean {
  if (!data) return false
  const types = [...data.types]
  return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain')
}

/**
 * What was dropped, as Markdown: images and other files become attachments, links become
 * bookmarks (a URL on its own line), text files and plain text are inserted as they are. Items the
 * app could not take are listed in `failed`, with the reason.
 */
export async function droppedMarkdown(
  data: DataTransfer,
  attachments: Attachments,
): Promise<{ markdown: string; failed: string[] }> {
  const blocks: string[] = []
  const failed: string[] = []
  const files = [...data.files]
  if (files.length) {
    for (const file of files) {
      try {
        if (file.type.startsWith('image/'))
          blocks.push(`![](${await storeImage(attachments, file)})`)
        else if (TEXT_FILE.test(file.name) && file.size <= MAX_TEXT_FILE) {
          const text = (await file.text()).trim()
          if (text) blocks.push(text)
        } else blocks.push(await storeFile(attachments, file))
      } catch (err) {
        failed.push(
          err instanceof ImageTooLargeError || err instanceof FileTooLargeError
            ? i18n.t('drop.tooLarge', { name: file.name })
            : `${file.name}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    return { markdown: blocks.join('\n\n'), failed }
  }
  const uris = (data.getData('text/uri-list') || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && /^https?:\/\//i.test(l))
  if (uris.length) return { markdown: uris.join('\n\n'), failed }
  return { markdown: data.getData('text/plain').trim(), failed }
}
