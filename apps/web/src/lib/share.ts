import { buildSharedNote, encodeShare, newShareId, shareLinkKey, shareUrl } from '@fixnote/core'
import { attachmentSync, shareContext } from './account/account'
import { usesDevBackend } from './account/pick'
import { env } from './env'
import { platform } from './platform'

export interface ShareLink {
  id: string
  noteId: string
  url: string
  createdAt: string
  updatedAt: string
}

export class NotSignedInError extends Error {}

/** The web app's address: this page on the web, the configured site in the desktop app. */
function shareBase(): string {
  if (env.webUrl) return env.webUrl
  return platform.kind === 'web' ? location.origin : 'https://fixnote.space'
}

function need() {
  const ctx = shareContext()
  if (!ctx) throw new NotSignedInError()
  return ctx
}

const linkFor = (keys: Parameters<typeof shareLinkKey>[0], id: string) =>
  shareUrl(shareBase(), id, shareLinkKey(keys, id), usesDevBackend() ? '&dev-backend' : '')

/** The signed-in user's links, newest last; empty when signed out. */
export async function listShares(): Promise<ShareLink[]> {
  const ctx = shareContext()
  if (!ctx) return []
  const rows = await ctx.backend.shares.list()
  return rows.map((r) => ({ ...r, url: linkFor(ctx.keys, r.id) }))
}

/**
 * Seals a copy of the note (with its images) and stores it: under a new link, or replacing what an
 * existing link shows. Returns the link.
 */
export async function publishShare(
  noteId: string,
  note: { title: string; content: string },
  existingId?: string,
): Promise<string> {
  const { backend, keys, attachments } = need()
  const id = existingId ?? newShareId()
  const copy = await buildSharedNote(note, (att) => attachments.load(att, attachmentSync()))
  const payload = encodeShare(shareLinkKey(keys, id), id, copy)
  if (existingId) await backend.shares.update(id, payload)
  else await backend.shares.create({ id, noteId, payload })
  return linkFor(keys, id)
}

export async function revokeShare(id: string): Promise<void> {
  await need().backend.shares.remove(id)
}
