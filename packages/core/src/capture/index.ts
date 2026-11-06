import type { Attachments } from '../attachments'
import { attachmentUrl } from '../attachments'
import { type AccountKeys, DecryptionError, openSealedBox } from '../crypto'
import { standaloneUrl } from '../links/preview'
import type { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'

/**
 * What a capture channel (the Telegram and Discord bots, the browser extension) seals for the
 * user. JSON, then crypto_box_seal to the account's public key, base64url. Keep in sync with
 * supabase/functions/telegram-bot, supabase/functions/discord-bot and apps/extension.
 */
export type CapturePayload =
  | { v: 1; kind: 'text'; text: string; receivedAt: number }
  | ({ v: 1; kind: 'link'; receivedAt: number } & CapturedLink)
  | {
      v: 1
      kind: 'voice'
      /** Standard base64. */
      audio: string
      mime: string
      durationSec?: number
      caption?: string
      receivedAt: number
    }
  | { v: 1; kind: 'photo'; image: string; mime: string; caption?: string; receivedAt: number }

/** A page saved from the browser extension, or a link sent to a bot. */
export interface CapturedLink {
  url: string
  title?: string
  description?: string
  site?: string
  /** The page's readable text, as the browser showed it. */
  text?: string
  selection?: string
  /** Where it was saved from when that was a social network's own Save / Bookmark: `x`, `reddit`… */
  source?: string
}

const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? { ok: true as const, v: v.slice(0, max) } : null

export function parseCapturePayload(json: string): CapturePayload | null {
  let p: Record<string, unknown>
  try {
    p = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
  if (p.v !== 1 || typeof p.receivedAt !== 'number') return null
  const caption = typeof p.caption === 'string' && p.caption.trim() ? { caption: p.caption } : {}
  if (p.kind === 'text' && typeof p.text === 'string') {
    return { v: 1, kind: 'text', text: p.text, receivedAt: p.receivedAt }
  }
  if (p.kind === 'link' && typeof p.url === 'string' && /^https?:\/\//i.test(p.url)) {
    const link: Extract<CapturePayload, { kind: 'link' }> = {
      v: 1,
      kind: 'link',
      url: p.url,
      receivedAt: p.receivedAt,
    }
    const fields = [
      ['title', 300],
      ['description', 1000],
      ['site', 100],
      ['text', 200_000],
      ['selection', 10_000],
      ['source', 40],
    ] as const
    for (const [key, max] of fields) {
      const value = str(p[key], max)
      if (value) link[key] = value.v
    }
    return link
  }
  if (p.kind === 'voice' && typeof p.audio === 'string' && typeof p.mime === 'string') {
    return {
      v: 1,
      kind: 'voice',
      audio: p.audio,
      mime: p.mime,
      receivedAt: p.receivedAt,
      ...(typeof p.durationSec === 'number' ? { durationSec: p.durationSec } : {}),
      ...caption,
    }
  }
  if (p.kind === 'photo' && typeof p.image === 'string' && typeof p.mime === 'string') {
    return {
      v: 1,
      kind: 'photo',
      image: p.image,
      mime: p.mime,
      receivedAt: p.receivedAt,
      ...caption,
    }
  }
  return null
}

export interface InboxItem {
  id: string
  channel: string
  sealed: string
}

/** Sealed items on the server, waiting for a device. */
export interface InboxRemote {
  list(): Promise<InboxItem[]>
  remove(id: string): Promise<void>
}

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const DONE_PREFIX = 'capture.imported.'

/**
 * Turns captured items into notes (no folder) and removes them from the server. Voice messages
 * keep their audio and get a transcript when `transcribe` works; photos become attachments.
 * An item is imported once even if the app stops between creating the note and the removal.
 */
export async function importInbox(opts: {
  db: SqlDriver
  keys: AccountKeys
  remote: InboxRemote
  repo: NotesRepo
  attachments: Attachments
  transcribe?: (audio: Blob) => Promise<string>
  /**
   * Where a message goes; a new note without a folder by default. `receivedAt`: when the message
   * was sent, the note's time (not when this device took it in). `channel`: which bot or app.
   */
  save?: (content: string, receivedAt: number, channel: string) => Promise<void>
  /**
   * A link (from the extension, or a message that is only a URL): a link note placed by itself
   * (`links/place.ts`). Without it a link becomes a plain note.
   */
  saveLink?: (link: CapturedLink, receivedAt: number, channel: string) => Promise<void>
  /** Opens a sealed item (tests); `openSealedBox` with the account's keys by default. */
  open?: (keys: AccountKeys, sealed: string) => string
}): Promise<{ imported: number; failed: number }> {
  const { db, keys, remote, repo, attachments } = opts
  let imported = 0
  let failed = 0
  for (const item of await remote.list()) {
    const [done] = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
      DONE_PREFIX + item.id,
    ])
    if (done) {
      await remote.remove(item.id)
      await db.execute('DELETE FROM kv WHERE key = ?', [DONE_PREFIX + item.id])
      continue
    }
    let payload: CapturePayload | null
    try {
      payload = parseCapturePayload((opts.open ?? openSealedBox)(keys, item.sealed))
    } catch (err) {
      if (!(err instanceof DecryptionError)) throw err
      payload = null
    }
    if (!payload) {
      // Sealed to another key or malformed: it can never be read, so it should not pile up.
      await remote.remove(item.id)
      failed++
      continue
    }

    // A message that is only a URL is a link to keep, like one saved from the browser.
    const bare = payload.kind === 'text' ? standaloneUrl(payload.text) : null
    let link: CapturedLink | null = bare ? { url: bare } : null
    if (payload.kind === 'link') {
      const { v: _v, kind: _k, receivedAt: _r, ...rest } = payload
      link = rest
    }

    let content: string
    if (link && opts.saveLink) {
      await opts.saveLink(link, payload.receivedAt, item.channel)
      content = ''
    } else if (payload.kind === 'link') {
      content = [payload.title ? `# ${payload.title}` : '', payload.url, payload.selection ?? '']
        .filter(Boolean)
        .join('\n\n')
    } else if (payload.kind === 'text') content = payload.text.trim()
    else if (payload.kind === 'photo') {
      const blob = new Blob([bytes(payload.image) as BlobPart], { type: payload.mime })
      const a = await attachments.add(blob, payload.mime)
      content = [`![](${attachmentUrl(a.id)})`, payload.caption?.trim()]
        .filter(Boolean)
        .join('\n\n')
    } else {
      const blob = new Blob([bytes(payload.audio) as BlobPart], { type: payload.mime })
      const a = await attachments.add(blob, payload.mime)
      const transcript = await opts.transcribe?.(blob).catch(() => '')
      content = [payload.caption?.trim(), transcript?.trim(), `![](${attachmentUrl(a.id)})`]
        .filter(Boolean)
        .join('\n\n')
    }
    if (content) {
      if (opts.save) await opts.save(content, payload.receivedAt, item.channel)
      else await repo.createNote({ content, createdAt: payload.receivedAt })
    }
    await db.execute(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [DONE_PREFIX + item.id, '1'],
    )
    await remote.remove(item.id)
    await db.execute('DELETE FROM kv WHERE key = ?', [DONE_PREFIX + item.id])
    imported++
  }
  return { imported, failed }
}
