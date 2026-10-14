import {
  parseFromDevice,
  RELAY_PROTOCOL,
  type RelayCall,
  type RemoteScope,
  type SocketLike,
  type ToolText,
} from '@fixnote/core'
import type { RemoteDevice, RemoteMcpApi, RemoteMcpClient } from './api'

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

export function devRemoteMcp(signedIn: () => boolean): RemoteMcpApi {
  ;(window as unknown as { fixnoteRemote: unknown }).fixnoteRemote = { call }
  return {
    serverUrl: 'https://mcp.fixnote.space/mcp',
    deviceUrl: 'dev://relay/device',
    token: async () => (signedIn() ? 'dev-token' : null),
    connect: (_url, protocols) => {
      if (!protocols.includes(RELAY_PROTOCOL)) throw new Error('protocol')
      return new DevSocket()
    },
    overview: async () => ({
      clients: load(),
      devices: device ? [{ ...devState, connectedAt: devConnectedAt }] : [],
    }),
    revoke: async (clientId) => save(load().filter((c) => c.id !== clientId)),
  }
}
