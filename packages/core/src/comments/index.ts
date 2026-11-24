import * as Y from 'yjs'
import type { SqlDriver } from '../platform'
import { REDACTED_PROTECTED_FRAGMENT } from '../privacy/reference'

/** Dedicated Yjs root map inside a shared note's E2EE document for fragment comment threads. */
export const COMMENTS_FIELD = 'comments'

export interface CommentMention {
  userId: string
  email: string
}

export interface CommentMessage {
  id: string
  authorId: string
  authorEmail: string
  body: string
  mentions: CommentMention[]
  createdAt: number
  editedAt?: number
}

export interface CommentThread {
  id: string
  /** Snapshot of the commented fragment, used as a quote and fallback anchor. */
  quote: string
  contextBefore?: string
  contextAfter?: string
  /** Base64-encoded Yjs RelativePositions for exact live anchoring in shared notes. */
  anchorFrom?: string
  anchorTo?: string
  /** Fallback character offsets for personal notes. */
  from?: number
  to?: number
  status: 'open' | 'resolved'
  createdAt: number
  updatedAt: number
  messages: CommentMessage[]
}

export type CommentEventKind = 'comment' | 'reply' | 'mention'

/** Unread notification metadata returned by the server (never includes comment plaintext). */
export interface CommentNotification {
  id: string
  sharedNoteId: string
  threadId: string
  actorId: string
  actorEmail: string
  kind: CommentEventKind
  createdAt: number
}

/**
 * Turns an email address into a clean, readable display name ("ivan.petrov@acme.com" → "Ivan Petrov",
 * "alex+work@gmail.com" → "Alex"). If another distinct email in `allEmails` produces the same base
 * name, appends the domain in parentheses to disambiguate.
 */
export function emailDisplayName(email: string, allEmails?: readonly string[]): string {
  const clean = email.trim()
  if (!clean) return ''
  const base = baseEmailName(clean)
  if (!allEmails?.length) return base
  const lower = clean.toLowerCase()
  const collides = allEmails.some(
    (other) => other.trim().toLowerCase() !== lower && baseEmailName(other) === base,
  )
  if (!collides) return base
  const domain = clean.split('@')[1]?.toLowerCase()
  return domain ? `${base} (${domain})` : clean
}

function baseEmailName(email: string): string {
  const local = (email.split('@')[0] ?? email).split('+')[0] ?? ''
  const words = local
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!words.length) return email
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export type CommentBodyPart =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; userId: string; email: string }

/**
 * Splits a comment's plain text into text and `@Name` mention chips using its structured `mentions`
 * metadata, so rendered mentions show a readable name with the full email on hover.
 */
export function parseCommentBody(
  body: string,
  mentions: readonly CommentMention[],
  allEmails?: readonly string[],
): CommentBodyPart[] {
  if (!body || !mentions.length) return body ? [{ kind: 'text', text: body }] : []
  const patterns: { token: string; mention: CommentMention }[] = []
  for (const mention of mentions) {
    const candidates = new Set<string>([
      `@${emailDisplayName(mention.email, allEmails)}`,
      `@${baseEmailName(mention.email)}`,
      `@${mention.email.split('@')[0] ?? mention.email}`,
      `@${mention.email}`,
    ])
    for (const token of candidates) {
      if (token.length > 1) patterns.push({ token, mention })
    }
  }
  patterns.sort((a, b) => b.token.length - a.token.length)

  const parts: CommentBodyPart[] = []
  let i = 0
  let plainStart = 0
  while (i < body.length) {
    if (body[i] === '@') {
      const slice = body.slice(i)
      const lower = slice.toLowerCase()
      const hit = patterns.find((p) => lower.startsWith(p.token.toLowerCase()))
      if (hit) {
        if (i > plainStart) parts.push({ kind: 'text', text: body.slice(plainStart, i) })
        parts.push({
          kind: 'mention',
          text: body.slice(i, i + hit.token.length),
          userId: hit.mention.userId,
          email: hit.mention.email,
        })
        i += hit.token.length
        plainStart = i
        continue
      }
    }
    i++
  }
  if (plainStart < body.length) parts.push({ kind: 'text', text: body.slice(plainStart) })
  return parts
}

/**
 * Finds the best character range `[from, to)` for a commented quote in plain text, disambiguating
 * duplicate occurrences by surrounding context and proximity to the last known offset.
 */
export function findQuoteRange(
  text: string,
  quote: string,
  opts: { from?: number; contextBefore?: string; contextAfter?: string } = {},
): { from: number; to: number } | null {
  if (!quote) return null
  const matches: number[] = []
  let idx = text.indexOf(quote)
  while (idx >= 0) {
    matches.push(idx)
    idx = text.indexOf(quote, idx + 1)
  }
  if (!matches.length) return null
  if (matches.length === 1) {
    const at = matches[0] as number
    return { from: at, to: at + quote.length }
  }
  let best = matches[0] as number
  let bestScore = -Infinity
  for (const at of matches) {
    let score = 0
    if (
      opts.contextBefore &&
      text.slice(Math.max(0, at - opts.contextBefore.length), at) === opts.contextBefore
    )
      score += 100
    if (
      opts.contextAfter &&
      text.slice(at + quote.length, at + quote.length + opts.contextAfter.length) ===
        opts.contextAfter
    )
      score += 100
    if (opts.from !== undefined) score -= Math.abs(at - opts.from) / 1000
    if (score > bestScore) {
      bestScore = score
      best = at
    }
  }
  return { from: best, to: best + quote.length }
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encodeRelativePosition(pos: Y.RelativePosition): string {
  return toBase64(Y.encodeRelativePosition(pos))
}

export function decodeRelativePosition(encoded: string): Y.RelativePosition | null {
  try {
    return Y.decodeRelativePosition(fromBase64(encoded))
  } catch {
    return null
  }
}

/** Reads all comment threads from a shared note's Yjs document, oldest first. */
export function readYComments(doc: Y.Doc): CommentThread[] {
  const root = doc.getMap(COMMENTS_FIELD)
  const out: CommentThread[] = []
  root.forEach((value, key) => {
    if (!(value instanceof Y.Map)) return
    const id = typeof value.get('id') === 'string' ? (value.get('id') as string) : key
    const quote = typeof value.get('quote') === 'string' ? (value.get('quote') as string) : ''
    const status = value.get('status') === 'resolved' ? 'resolved' : 'open'
    const createdAt = Number(value.get('createdAt') ?? 0)
    const updatedAt = Number(value.get('updatedAt') ?? createdAt)
    const rawMsgs = value.get('messages')
    const messages: CommentMessage[] =
      rawMsgs instanceof Y.Array
        ? (rawMsgs.toArray() as CommentMessage[]).filter(
            (m) => m && typeof m.id === 'string' && typeof m.body === 'string',
          )
        : []
    if (!messages.length) return
    out.push({
      id,
      quote,
      ...(typeof value.get('contextBefore') === 'string'
        ? { contextBefore: value.get('contextBefore') as string }
        : {}),
      ...(typeof value.get('contextAfter') === 'string'
        ? { contextAfter: value.get('contextAfter') as string }
        : {}),
      ...(typeof value.get('anchorFrom') === 'string'
        ? { anchorFrom: value.get('anchorFrom') as string }
        : {}),
      ...(typeof value.get('anchorTo') === 'string'
        ? { anchorTo: value.get('anchorTo') as string }
        : {}),
      ...(typeof value.get('from') === 'number' ? { from: value.get('from') as number } : {}),
      ...(typeof value.get('to') === 'number' ? { to: value.get('to') as number } : {}),
      status,
      createdAt,
      updatedAt,
      messages,
    })
  })
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

export function addYCommentThread(doc: Y.Doc, thread: CommentThread) {
  doc.transact(() => {
    const root = doc.getMap(COMMENTS_FIELD)
    const entry = new Y.Map<unknown>()
    entry.set('id', thread.id)
    entry.set('quote', thread.quote)
    if (thread.contextBefore) entry.set('contextBefore', thread.contextBefore)
    if (thread.contextAfter) entry.set('contextAfter', thread.contextAfter)
    if (thread.anchorFrom) entry.set('anchorFrom', thread.anchorFrom)
    if (thread.anchorTo) entry.set('anchorTo', thread.anchorTo)
    if (thread.from !== undefined) entry.set('from', thread.from)
    if (thread.to !== undefined) entry.set('to', thread.to)
    entry.set('status', thread.status)
    entry.set('createdAt', thread.createdAt)
    entry.set('updatedAt', thread.updatedAt)
    const msgs = new Y.Array<CommentMessage>()
    msgs.push(thread.messages)
    entry.set('messages', msgs)
    root.set(thread.id, entry)
  }, 'comments')
}

export function addYCommentReply(doc: Y.Doc, threadId: string, message: CommentMessage) {
  doc.transact(() => {
    const entry = doc.getMap(COMMENTS_FIELD).get(threadId)
    if (!(entry instanceof Y.Map)) return
    let msgs = entry.get('messages')
    if (!(msgs instanceof Y.Array)) {
      msgs = new Y.Array<CommentMessage>()
      entry.set('messages', msgs)
    }
    ;(msgs as Y.Array<CommentMessage>).push([message])
    entry.set('updatedAt', message.createdAt)
    if (entry.get('status') === 'resolved') entry.set('status', 'open')
  }, 'comments')
}

export function setYCommentStatus(doc: Y.Doc, threadId: string, status: 'open' | 'resolved') {
  doc.transact(() => {
    const entry = doc.getMap(COMMENTS_FIELD).get(threadId)
    if (!(entry instanceof Y.Map)) return
    entry.set('status', status)
    entry.set('updatedAt', Date.now())
  }, 'comments')
}

export function deleteYCommentMessage(doc: Y.Doc, threadId: string, messageId: string) {
  doc.transact(() => {
    const root = doc.getMap(COMMENTS_FIELD)
    const entry = root.get(threadId)
    if (!(entry instanceof Y.Map)) return
    const msgs = entry.get('messages')
    if (!(msgs instanceof Y.Array)) return
    const arr = msgs.toArray() as CommentMessage[]
    const idx = arr.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    msgs.delete(idx, 1)
    if (msgs.length === 0) root.delete(threadId)
    else entry.set('updatedAt', Date.now())
  }, 'comments')
}

/**
 * Scrubs protected plaintext values from comment quotes, surrounding context, and message bodies
 * inside a shared note's Yjs document. Returns true if any comment field changed.
 */
export function scrubYComments(
  doc: Y.Doc,
  values: readonly string[],
  replacement = REDACTED_PROTECTED_FRAGMENT,
): boolean {
  const targets = [...new Set(values.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!targets.length) return false
  const scrubText = (text: string): string => {
    let out = text
    for (const target of targets) out = out.replaceAll(target, replacement)
    return out
  }
  let changed = false
  doc.transact(() => {
    const root = doc.getMap(COMMENTS_FIELD)
    root.forEach((value) => {
      if (!(value instanceof Y.Map)) return
      for (const field of ['quote', 'contextBefore', 'contextAfter'] as const) {
        const raw = value.get(field)
        if (typeof raw !== 'string') continue
        const next = scrubText(raw)
        if (next !== raw) {
          value.set(field, next)
          changed = true
        }
      }
      const rawMsgs = value.get('messages')
      if (rawMsgs instanceof Y.Array) {
        const arr = rawMsgs.toArray() as CommentMessage[]
        for (let i = 0; i < arr.length; i++) {
          const msg = arr[i]
          if (!msg || typeof msg.body !== 'string') continue
          const nextBody = scrubText(msg.body)
          if (nextBody !== msg.body) {
            rawMsgs.delete(i, 1)
            rawMsgs.insert(i, [{ ...msg, body: nextBody }])
            changed = true
          }
        }
      }
    })
  }, 'privacy')
  return changed
}

/** Local SQLite storage for fragment comments on personal notes. */
export class CommentsRepo {
  constructor(private readonly db: SqlDriver) {}

  async list(noteId: string): Promise<CommentThread[]> {
    const rows = await this.db.query<{ payload: string }>(
      'SELECT payload FROM note_comments WHERE note_id = ? ORDER BY updated_at ASC',
      [noteId],
    )
    const out: CommentThread[] = []
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.payload) as CommentThread
        if (parsed?.id && Array.isArray(parsed.messages) && parsed.messages.length) out.push(parsed)
      } catch {
        // Skip malformed rows.
      }
    }
    return out.sort((a, b) => a.createdAt - b.createdAt)
  }

  async save(noteId: string, thread: CommentThread): Promise<void> {
    if (!thread.messages.length) {
      await this.remove(noteId, thread.id)
      return
    }
    await this.db.execute(
      `INSERT INTO note_comments (id, note_id, thread_id, payload, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      [`${noteId}:${thread.id}`, noteId, thread.id, JSON.stringify(thread), thread.updatedAt],
    )
  }

  async remove(noteId: string, threadId: string): Promise<void> {
    await this.db.execute('DELETE FROM note_comments WHERE note_id = ? AND thread_id = ?', [
      noteId,
      threadId,
    ])
  }
}
