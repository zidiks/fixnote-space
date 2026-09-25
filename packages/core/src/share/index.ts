import sodium from 'libsodium-wrappers'
import { attachmentIds } from '../attachments'
import { openShare, sealShare } from '../crypto'

/**
 * A shared note: a copy of one note, with its images, sealed with the link's key. Later edits do
 * not reach the link until the owner updates it.
 */
export interface SharedNote {
  v: 1
  title: string
  content: string
  sharedAt: number
  /** Attachments of the note by id, base64; left out beyond the size budget. */
  files: Record<string, { mime: string; data: string }>
  /** Attachments that did not fit or were not available on this device. */
  omitted: number
}

/** Raw bytes of attachments a link may carry; the ciphertext stays well under the server's limit. */
export const SHARE_FILES_BUDGET = 3 * 1024 * 1024

const SHARE_ID = /^[A-Za-z0-9_-]{22}$/

export async function buildSharedNote(
  note: { title: string; content: string },
  load: (id: string) => Promise<Blob | null>,
  now = Date.now(),
): Promise<SharedNote> {
  const files: SharedNote['files'] = {}
  let used = 0
  let omitted = 0
  for (const id of attachmentIds(note.content)) {
    const blob = await load(id).catch(() => null)
    if (!blob || used + blob.size > SHARE_FILES_BUDGET) {
      omitted++
      continue
    }
    used += blob.size
    files[id] = {
      mime: blob.type || 'application/octet-stream',
      data: sodium.to_base64(
        new Uint8Array(await blob.arrayBuffer()),
        sodium.base64_variants.ORIGINAL,
      ),
    }
  }
  return { v: 1, title: note.title, content: note.content, sharedAt: now, files, omitted }
}

export function encodeShare(linkKey: string, shareId: string, note: SharedNote): string {
  return sealShare(linkKey, shareId, JSON.stringify(note))
}

/** Throws DecryptionError for a wrong key or tampered payload. */
export function decodeShare(linkKey: string, shareId: string, payload: string): SharedNote {
  const note = JSON.parse(openShare(linkKey, shareId, payload)) as Partial<SharedNote>
  return {
    v: 1,
    title: typeof note.title === 'string' ? note.title : '',
    content: typeof note.content === 'string' ? note.content : '',
    sharedAt: typeof note.sharedAt === 'number' ? note.sharedAt : 0,
    files: note.files && typeof note.files === 'object' ? note.files : {},
    omitted: typeof note.omitted === 'number' ? note.omitted : 0,
  }
}

export function sharedFileBytes(file: { data: string }): Uint8Array {
  return sodium.from_base64(file.data, sodium.base64_variants.ORIGINAL)
}

/** `https://host/?s=<id>#<key>`: the key after # never leaves the reader's browser. */
export function shareUrl(base: string, shareId: string, linkKey: string, extraQuery = ''): string {
  return `${base.replace(/\/+$/, '')}/?s=${shareId}${extraQuery}#${linkKey}`
}

export function parseShareLocation(
  search: string,
  hash: string,
): { id: string; key: string } | null {
  const id = new URLSearchParams(search).get('s')
  if (!id || !SHARE_ID.test(id)) return null
  return { id, key: hash.replace(/^#/, '') }
}
