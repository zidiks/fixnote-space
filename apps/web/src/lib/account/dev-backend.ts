import { EDIT_MARKER, EXPANSION_MARKER } from '@fixnote/ai'
import {
  type InboxItem,
  type PushResult,
  type RemoteFolder,
  type RemoteFolderWrite,
  type RemoteNote,
  type RemoteNoteWrite,
  type SyncRemote,
  sealToPublicKey,
} from '@fixnote/core'
import type { AccountBackend, CaptureLink, Session, UserKeysRow } from './backend'

/**
 * Development-only stand-in for Supabase, enabled with `?dev-backend` in `pnpm dev`. The "server"
 * lives in localStorage, which all tabs share, so two tabs behave like two devices. The sign-in
 * code is always 123456. Never included in production builds.
 */
const KEY = 'fixnote.dev-server'

interface ServerState {
  seq: number
  notes: Record<string, RemoteNote>
  folders: Record<string, RemoteFolder>
  keys: Record<string, UserKeysRow>
  session: Session | null
}

const load = (): ServerState =>
  JSON.parse(
    localStorage.getItem(KEY) ?? '{"seq":0,"notes":{},"folders":{},"keys":{},"session":null}',
  )
const save = (s: ServerState) => {
  localStorage.setItem(KEY, JSON.stringify(s))
  channel.postMessage('changed')
}
const channel = new BroadcastChannel(KEY)
const userIdFor = (email: string) =>
  `00000000-0000-4000-8000-${email.length.toString(16).padStart(12, '0')}`

// ── Fake Telegram bot ────────────────────────────────────────────────────────
// In the dev console: __devTelegram.start(code) links a chat as the bot would after /start;
// __devTelegram.send({ kind: 'text', text: '…' }) seals a message to the account like the bot.

const CAPTURE = 'fixnote.dev-capture'
interface CaptureState {
  codes: Record<string, string>
  links: (CaptureLink & { userId: string })[]
  inbox: (InboxItem & { userId: string })[]
}
const loadCapture = (): CaptureState =>
  JSON.parse(localStorage.getItem(CAPTURE) ?? '{"codes":{},"links":[],"inbox":[]}')
const saveCapture = (c: CaptureState) => {
  localStorage.setItem(CAPTURE, JSON.stringify(c))
  channel.postMessage('changed')
}

/** BroadcastChannel skips the tab that posts, so the fake bot also wakes this tab directly. */
const localListeners = new Set<() => void>()

const devTelegram = {
  /** Without a code: the one the app just created, as if the user pressed Start. */
  start(code?: string, label = '@dev_user') {
    const c = loadCapture()
    const pending = code ?? Object.keys(c.codes)[0] ?? ''
    const userId = c.codes[pending]
    if (!userId) return 'bad code'
    delete c.codes[pending]
    c.links = c.links.filter((l) => l.externalId !== 'dev-chat')
    c.links.push({
      channel: 'telegram',
      externalId: 'dev-chat',
      label,
      createdAt: new Date().toISOString(),
      userId,
    })
    saveCapture(c)
    return 'linked'
  },
  send(payload: Record<string, unknown>) {
    const c = loadCapture()
    const link = c.links.find((l) => l.externalId === 'dev-chat')
    const key = link && load().keys[link.userId]
    if (!link || !key) return 'not linked'
    const sealed = sealToPublicKey(
      key.publicKey,
      JSON.stringify({ v: 1, receivedAt: Date.now(), ...payload }),
    )
    c.inbox.push({ id: crypto.randomUUID(), channel: 'telegram', sealed, userId: link.userId })
    saveCapture(c)
    for (const l of localListeners) l()
    return 'queued'
  },
}
;(window as unknown as { __devTelegram: typeof devTelegram }).__devTelegram = devTelegram

function write<T extends { version: number; seq: number }>(
  table: 'notes' | 'folders',
  row: { id: string },
  base: number,
): PushResult<T> {
  const s = load()
  const current = s[table][row.id] as unknown as T | undefined
  if ((current?.version ?? 0) !== base && current) return { ok: false, current }
  const next = { ...row, version: base + 1, seq: ++s.seq }
  ;(s[table] as Record<string, unknown>)[row.id] = next
  save(s)
  return { ok: true, version: next.version, seq: next.seq }
}

const read = <T extends { seq: number }>(rows: Record<string, T>, after: number, limit: number) =>
  Object.values(rows)
    .filter((r) => r.seq > after)
    .sort((a, b) => a.seq - b.seq)
    .slice(0, limit)

const remote: SyncRemote = {
  pullNotes: async (after, limit) => read(load().notes, after, limit),
  pullFolders: async (after, limit) => read(load().folders, after, limit),
  pushNote: async (row: RemoteNoteWrite, base) => write<RemoteNote>('notes', row, base),
  pushFolder: async (row: RemoteFolderWrite, base) => write<RemoteFolder>('folders', row, base),
}

/**
 * Stand-in for DeepSeek: answers from the first note fragment in the prompt, cites it, and streams
 * the text word by word like a real model.
 */
// A tiny stand-in for the model's multilingual knowledge in query expansion.
const DEV_SYNONYMS: Record<string, string[]> = {
  розыгрыш: ['giveaway', 'sorteo', 'raffle'],
  гивевей: ['giveaway', 'розыгрыш'],
  giveaway: ['розыгрыш', 'гивевей', 'sorteo'],
  телега: ['telegram'],
  покупки: ['shopping', 'compras'],
}

function devKeywords(question: string): string {
  const words = question.toLowerCase().split(/[^\p{L}\p{N}]+/u)
  const keywords = words.flatMap((w) =>
    Object.entries(DEV_SYNONYMS)
      .filter(([k]) => w.startsWith(k.slice(0, Math.max(4, k.length - 2))))
      .flatMap(([, v]) => v),
  )
  return JSON.stringify({ keywords: [...new Set(keywords)] })
}

/** Predictable stand-ins for AI edits, enough to see the diff and accept flow. */
function devEdit(prompt: string): string {
  const task = prompt.match(/^Task: (.*)$/m)?.[1] ?? ''
  const text = prompt.match(/<<<\n([\s\S]*)\n>>>/)?.[1] ?? ''
  const items = text
    .split(/[,;.\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (task.startsWith('Make the fragment shorter')) return items[0] ?? text
  if (task.startsWith('Fix spelling'))
    return text.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase())
  if (task.startsWith('This is a raw dump'))
    return `# ${items[0] ?? 'Note'}\n\n${items
      .slice(1)
      .map((s) => `- ${s}`)
      .join('\n')}`
  if (task.startsWith('Reformat') || task.startsWith('Do what the user asks'))
    return items.map((s) => `- ${s}`).join('\n')
  return text.replace(/(^|\s)очень\s+/giu, '$1').replace(/^./, (c) => c.toUpperCase())
}

const devLlm: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] }
  const prompt = body.messages.at(-1)?.content ?? ''
  const expansion = body.messages[0]?.content.includes(EXPANSION_MARKER)
  const edit = body.messages[0]?.content.includes(EDIT_MARKER)
  const first = prompt.match(/\[1\] "([^"]*)"[^\n]*\n([^\n]+)/)
  const answer = expansion
    ? devKeywords(prompt)
    : edit
      ? devEdit(prompt)
      : first
        ? `From your note "${first[1]}": ${first[2]} [1]`
        : "I couldn't find this in your notes. Try other words."
  const words = expansion ? [answer] : answer.split(/(?<= )/)
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const w of words) {
        if (init?.signal?.aborted) break
        await new Promise((r) => setTimeout(r, 40))
        const chunk = { choices: [{ delta: { content: w } }] }
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`))
      }
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}

export const devBackend: AccountBackend = {
  getSession: async () => load().session,
  sendCode: async () => undefined,
  verifyCode: async (email, code) => {
    if (code !== '123456') throw new Error('Invalid code')
    const s = load()
    s.session = { userId: userIdFor(email), email }
    save(s)
    return s.session
  },
  signOut: async () => {
    const s = load()
    s.session = null
    save(s)
  },
  getUserKeys: async () => {
    const s = load()
    return s.session ? (s.keys[s.session.userId] ?? null) : null
  },
  createUserKeys: async (row) => {
    const s = load()
    if (!s.session) throw new Error('not authenticated')
    s.keys[s.session.userId] = row
    save(s)
  },
  remote,
  // Encrypted files in localStorage (base64), shared by tabs like the rest of the fake server.
  attachments: (userId) => {
    const key = (id: string) => `fixnote.dev-attachment.${userId}.${id}`
    return {
      upload: async (id, blob) => {
        let bin = ''
        for (const b of blob) bin += String.fromCharCode(b)
        localStorage.setItem(key(id), btoa(bin))
      },
      download: async (id) => {
        const b64 = localStorage.getItem(key(id))
        return b64 ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : null
      },
    }
  },
  chatTransport: async () =>
    load().session ? { url: 'dev://llm', headers: {}, fetch: devLlm } : null,
  inbox: {
    list: async () => {
      const userId = load().session?.userId
      return loadCapture()
        .inbox.filter((i) => i.userId === userId)
        .map(({ id, channel: ch, sealed }) => ({ id, channel: ch, sealed }))
    },
    remove: async (id) => {
      const c = loadCapture()
      c.inbox = c.inbox.filter((i) => i.id !== id)
      saveCapture(c)
    },
  },
  createCaptureCode: async () => {
    const userId = load().session?.userId
    if (!userId) throw new Error('not authenticated')
    const c = loadCapture()
    const code = crypto.randomUUID().slice(0, 8)
    c.codes = { [code]: userId }
    saveCapture(c)
    return code
  },
  captureLinks: async () => {
    const userId = load().session?.userId
    return loadCapture()
      .links.filter((l) => l.userId === userId)
      .map(({ userId: _u, ...l }) => l)
  },
  unlinkCapture: async (link) => {
    const c = loadCapture()
    c.links = c.links.filter((l) => l.externalId !== link.externalId)
    saveCapture(c)
  },
  // Any URL "resolves" to a small page, so link cards can be tried without a network.
  fetchPage: async (url) => {
    if (!load().session) return null
    await new Promise((r) => setTimeout(r, 200))
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (/\.(png|jpe?g|gif|webp)$/i.test(url)) return { url, contentType: 'image/png' }
    return {
      url,
      contentType: 'text/html',
      html: `<head><title>${host}</title><meta property="og:title" content="A page on ${host}"><meta property="og:description" content="What ${host} says about itself, in one or two sentences."><meta property="og:site_name" content="${host}"></head>`,
    }
  },
  subscribe: (_userId, onChange) => {
    const listener = () => onChange()
    channel.addEventListener('message', listener)
    localListeners.add(listener)
    return () => {
      channel.removeEventListener('message', listener)
      localListeners.delete(listener)
    }
  },
}
