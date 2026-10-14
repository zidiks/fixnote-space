import type { DeviceKind, SocketFactory } from '@fixnote/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toError } from '../errors'

/** An AI app the account let in through remote MCP (docs/remote-mcp.md). */
export interface RemoteMcpClient {
  /** The OAuth client id (Supabase Auth). */
  id: string
  name: string
  /** The app's own site, when it registered one: a look-alike name is not enough to trust. */
  site: string
  grantedAt: number | null
  /** Last tool call through the relay (to within a few minutes); null = never. */
  lastUsed: number | null
}

/** One of the account's devices connected to the relay. */
export interface RemoteDevice {
  device: string
  kind: DeviceKind
  serving: boolean
  connectedAt: number
}

export interface RemoteOverview {
  clients: RemoteMcpClient[]
  devices: RemoteDevice[]
}

/** Remote MCP from the app's side: the relay this device connects to and the apps let in. */
export interface RemoteMcpApi {
  /** What the person pastes into ChatGPT or Claude. */
  serverUrl: string
  /** The relay's device endpoint (wss://…/device). */
  deviceUrl: string
  /** The session's current access token (the auth client refreshes it); null when signed out. */
  token(): Promise<string | null>
  /** The dev backend's in-page relay instead of a WebSocket. */
  connect?: SocketFactory
  /** The apps let in and the devices answering now. */
  overview(): Promise<RemoteOverview>
  /** Revokes the app's grant (its tokens stop at the relay right away). */
  revoke(clientId: string): Promise<void>
}

const host = (uri: string) => {
  try {
    return uri ? new URL(uri).host : ''
  } catch {
    return ''
  }
}

/**
 * Production: grants come from Supabase Auth's OAuth server, "last used" from the relay (which
 * only knows client ids, names and times).
 */
export function supabaseRemoteMcp(client: SupabaseClient, relayUrl: string): RemoteMcpApi {
  const base = relayUrl.replace(/\/+$/, '')
  const token = async () => (await client.auth.getSession()).data.session?.access_token ?? null
  const relay = async (path: string, init: RequestInit = {}) => {
    const t = await token()
    if (!t) throw new Error('Signed out')
    return fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
    })
  }
  return {
    serverUrl: `${base}/mcp`,
    deviceUrl: `${base.replace(/^http/, 'ws')}/device`,
    token,
    async overview() {
      const [grants, seen] = await Promise.all([
        client.auth.oauth.listGrants(),
        relay('/api/clients')
          .then((r) => (r.ok ? r.json() : { clients: [], devices: [] }))
          .catch(() => ({ clients: [], devices: [] })) as Promise<{
          clients: { id: string; name: string; lastUsed: number }[]
          devices: RemoteDevice[]
        }>,
      ])
      if (grants.error) throw toError(grants.error)
      const byId = new Map(seen.clients.map((c) => [c.id, c]))
      const clients = (grants.data ?? []).map((g) => {
        const s = byId.get(g.client.id)
        return {
          id: g.client.id,
          name: g.client.name || s?.name || g.client.id,
          site: host(g.client.uri),
          grantedAt: Date.parse(g.granted_at) || null,
          lastUsed: s?.lastUsed || null,
        }
      })
      return { clients, devices: seen.devices ?? [] }
    },
    async revoke(clientId) {
      const { error } = await client.auth.oauth.revokeGrant({ clientId })
      if (error) throw toError(error)
      // Tokens it already holds stop at the relay now, not when they expire.
      await relay(`/api/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE' }).catch(
        () => undefined,
      )
    },
  }
}
