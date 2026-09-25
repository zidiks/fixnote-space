import type {
  PushResult,
  RemoteFolder,
  RemoteFolderWrite,
  RemoteNote,
  RemoteNoteWrite,
  SyncRemote,
} from '@fixnote/core'
import type { AccountBackend, Session, UserKeysRow } from './backend'

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
const devLlm: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] }
  const prompt = body.messages.at(-1)?.content ?? ''
  const first = prompt.match(/\[1\] "([^"]*)"[^\n]*\n([^\n]+)/)
  const answer = first
    ? `From your note "${first[1]}": ${first[2]} [1]`
    : "I couldn't find this in your notes. Try other words."
  const words = answer.split(/(?<= )/)
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
  chatTransport: async () =>
    load().session ? { url: 'dev://llm', headers: {}, fetch: devLlm } : null,
  subscribe: (_userId, onChange) => {
    const listener = () => onChange()
    channel.addEventListener('message', listener)
    return () => channel.removeEventListener('message', listener)
  },
}
