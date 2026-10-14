import {
  type ConsentResult,
  type DeepLinks,
  isAuthorizationId,
  parseConsentResult,
  parseFromDevice,
  RELAY_PROTOCOL,
  type RelayCall,
  type RemoteScope,
  type SocketLike,
  type ToolText,
} from '@fixnote/core'
import { devIsPro } from '../account/dev-plan'
import type { RemoteDevice, RemoteMcpApi, RemoteMcpClient } from './api'
import type { Authorization, ConsentAuth, PollAnswer } from './consent'

/**
 * `?dev-backend`: a relay inside the page, so the bridge, the executor and Settings can be tried
 * without Cloudflare. In the console: `await fixnoteRemote.call('search_notes', { query: 'x' })`
 * plays an AI app named "Claude (dev)" (it appears in Settings after its first call).
 */
const KEY = 'fixnote.dev.remoteMcp'

function load(): RemoteMcpClient[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as RemoteMcpClient[]
  } catch {
    return []
  }
}
const save = (list: RemoteMcpClient[]) => localStorage.setItem(KEY, JSON.stringify(list))

let device: SocketLike | null = null
let devConnectedAt = 0
let devState: Omit<RemoteDevice, 'connectedAt'> = { device: '', kind: 'web', serving: false }
let devScope: RemoteScope = null
const waiting = new Map<string, (r: { content: ToolText[]; isError?: boolean }) => void>()

class DevSocket implements SocketLike {
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  constructor() {
    setTimeout(() => {
      this.readyState = 1
      device = this
      devConnectedAt = Date.now()
      this.onopen?.({})
    }, 50)
  }
  send(text: string) {
    const m = parseFromDevice(text)
    if (m?.type === 'result') waiting.get(m.id)?.(m)
    if (m?.type === 'hello' || m?.type === 'state') {
      devState = { device: m.device, kind: m.kind, serving: m.serving }
    }
    if (m?.type === 'scope') devScope = m.scope
  }
  close() {
    this.readyState = 3
    if (device === this) device = null
  }
}

async function call(tool: string, args: Record<string, unknown> = {}) {
  const list = load()
  const id = 'dev-claude'
  const known = list.find((c) => c.id === id)
  const entry = known ?? {
    id,
    name: 'Claude (dev)',
    site: 'claude.ai',
    grantedAt: Date.now(),
    lastUsed: null,
  }
  entry.lastUsed = Date.now()
  save([entry, ...list.filter((c) => c.id !== id)])
  const socket = device
  if (!socket || !devState.serving)
    return { content: [{ type: 'text', text: 'No device online' }], isError: true }
  const message: RelayCall = {
    type: 'call',
    id: crypto.randomUUID(),
    client: { id, name: entry.name },
    tool,
    args,
    scope: devScope,
  }
  return new Promise((resolve) => {
    waiting.set(message.id, resolve)
    socket.onmessage?.({ data: JSON.stringify(message) })
  })
}

export function devRemoteMcp(email: () => string | null): RemoteMcpApi {
  ;(window as unknown as { fixnoteRemote: unknown }).fixnoteRemote = { call }
  return {
    serverUrl: 'https://mcp.fixnote.space/mcp',
    deviceUrl: 'dev://relay/device',
    token: async () => (email() ? 'dev-token' : null),
    connect: (_url, protocols) => {
      if (!protocols.includes(RELAY_PROTOCOL)) throw new Error('protocol')
      return new DevSocket()
    },
    overview: async () => ({
      clients: load(),
      devices: device ? [{ ...devState, connectedAt: devConnectedAt }] : [],
    }),
    revoke: async (clientId) => save(load().filter((c) => c.id !== clientId)),
    consent: devConsent(email),
    handoff: devHandoff,
  }
}

// ── Connecting an AI app (docs/remote-mcp.md, "Connecting") ──
// Any authorization id is a pending request from "Claude"; ids starting with `again` were allowed
// before, ids starting with `expired` are gone. Answers and the relay handoff live in localStorage,
// so the connect page (`/oauth/consent?authorization_id=…&dev-backend`) and an app tab meet there.

const ANSWERED = 'fixnote.dev.oauth-answered'
const DEV_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const answered = (): string[] => JSON.parse(localStorage.getItem(ANSWERED) ?? '[]')

export function devConsent(email: () => string | null): ConsentAuth {
  return {
    async authorization(id): Promise<Authorization | null> {
      const who = email()
      if (!who || !isAuthorizationId(id) || id.startsWith('expired')) return null
      if (answered().includes(id)) return null
      if (id.startsWith('again')) {
        return { kind: 'allowed', redirect: `${DEV_CALLBACK}?code=dev-${id}&state=dev` }
      }
      return {
        kind: 'ask',
        details: {
          client: { id: 'dev-claude', name: 'Claude', site: 'claude.ai', logo: '' },
          redirectHost: 'claude.ai',
          email: who,
        },
      }
    },
    async decide(id, allow) {
      if (!email() || answered().includes(id)) return null
      localStorage.setItem(ANSWERED, JSON.stringify([...answered(), id]))
      return allow
        ? `${DEV_CALLBACK}?code=dev-${id}&state=dev`
        : `${DEV_CALLBACK}?error=access_denied&state=dev`
    },
    pro: async () => devIsPro(),
  }
}

const handoffKey = (id: string) => `fixnote.dev.consent.${id}`

export async function devHandoff(id: string, result: ConsentResult) {
  if (!localStorage.getItem(handoffKey(id))) {
    localStorage.setItem(handoffKey(id), JSON.stringify(result))
  }
}

export async function devPoll(id: string): Promise<PollAnswer> {
  const raw = localStorage.getItem(handoffKey(id))
  if (!raw) return 'waiting'
  localStorage.removeItem(handoffKey(id))
  return parseConsentResult(JSON.parse(raw)) ?? 'waiting'
}

/** fixnote:// links in `?dev-backend`: the connect page hands them to an open app tab. */
const LINKS_CHANNEL = 'fixnote.dev.deep-links'

export function openDevLink(url: string) {
  const ch = new BroadcastChannel(LINKS_CHANNEL)
  ch.postMessage(url)
  ch.close()
}

export const devDeepLinks: DeepLinks = {
  listen: async (cb) => {
    const ch = new BroadcastChannel(LINKS_CHANNEL)
    ch.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') cb(e.data)
    }
    return () => ch.close()
  },
}
