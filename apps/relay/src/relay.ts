import { DurableObject } from 'cloudflare:workers'
import { PING, PONG, RELAY_PROTOCOL } from '@fixnote/core/remote-mcp'
import { type DeviceInfo, type DeviceSocket, Hub } from './hub'

export interface RelayEnv {
  RELAY: DurableObjectNamespace<UserRelay>
}

/** An AI app connected to the account, as the app lists it. No note content, ever. */
export interface ClientRow {
  id: string
  name: string
  lastUsed: number
}

/** Writes "last used" at most this often per client (rows written are what the plan counts). */
const LAST_USED_EVERY_MS = 5 * 60_000

/**
 * One account's relay (Durable Object named by the user id, SQLite-backed so it runs on the
 * Workers Free plan). Holds its devices' WebSockets with the Hibernation API: an idle connection
 * costs no duration, and keep-alive pings are answered by the runtime without waking it. Its
 * storage keeps only which AI apps connected, when they were last used and which were revoked.
 */
export class UserRelay extends DurableObject<RelayEnv> {
  private readonly wrapped = new WeakMap<WebSocket, DeviceSocket>()
  private readonly hub = new Hub(() => this.ctx.getWebSockets().map((ws) => this.wrap(ws)))

  constructor(ctx: DurableObjectState, env: RelayEnv) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', last_used INTEGER NOT NULL DEFAULT 0);
       CREATE TABLE IF NOT EXISTS revoked (id TEXT PRIMARY KEY, at INTEGER NOT NULL);`,
    )
  }

  private wrap(ws: WebSocket): DeviceSocket {
    let s = this.wrapped.get(ws)
    if (!s) {
      s = {
        send: (text) => ws.send(text),
        info: () =>
          (ws.deserializeAttachment() as DeviceInfo | null) ?? { device: '', connectedAt: 0 },
        setInfo: (info) => ws.serializeAttachment(info),
      }
      this.wrapped.set(ws, s)
    }
    return s
  }

  /** A device connects (the Worker checked its session and plan). */
  private acceptDevice(): Response {
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ device: '', connectedAt: Date.now() } satisfies DeviceInfo)
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': RELAY_PROTOCOL },
    })
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return this.acceptDevice()
    return new Response('Not found', { status: 404 })
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string') this.hub.onMessage(this.wrap(ws), message)
  }

  override webSocketClose(ws: WebSocket, code: number) {
    this.hub.onClose(this.wrap(ws))
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye')
    } catch {
      // Already closed.
    }
  }

  override webSocketError(ws: WebSocket) {
    this.hub.onClose(this.wrap(ws))
  }

  /** Whether a client's token predates its revocation (then it must sign in again). */
  revokedSince(clientId: string, issuedAt: number): boolean {
    const row = this.ctx.storage.sql
      .exec<{ at: number }>('SELECT at FROM revoked WHERE id = ?', clientId)
      .toArray()[0]
    return Boolean(row && issuedAt <= row.at)
  }

  /** `initialize`: remember the client's name for the app and the device's log. */
  hello(clientId: string, name: string) {
    this.ctx.storage.sql.exec(
      `INSERT INTO clients (id, name) VALUES (?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name WHERE clients.name <> excluded.name`,
      clientId,
      name,
    )
  }

  /** Runs a tool on the newest device of the account. */
  async call(clientId: string, tool: string, args: Record<string, unknown>) {
    const now = Date.now()
    const row = this.ctx.storage.sql
      .exec<{ name: string; last_used: number }>(
        'SELECT name, last_used FROM clients WHERE id = ?',
        clientId,
      )
      .toArray()[0]
    if (!row || now - row.last_used > LAST_USED_EVERY_MS) {
      this.ctx.storage.sql.exec(
        `INSERT INTO clients (id, last_used) VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET last_used = excluded.last_used`,
        clientId,
        now,
      )
    }
    return this.hub.call({ id: clientId, name: row?.name ?? '' }, tool, args)
  }

  /** For the app's settings: connected apps and the devices online now. */
  overview(): { clients: ClientRow[]; devices: DeviceInfo[] } {
    const clients = this.ctx.storage.sql
      .exec<{ id: string; name: string; last_used: number }>(
        'SELECT id, name, last_used FROM clients ORDER BY last_used DESC',
      )
      .toArray()
      .map((r) => ({ id: r.id, name: r.name, lastUsed: r.last_used }))
    return { clients, devices: this.hub.devices() }
  }

  /**
   * The app revoked a client's grant (Supabase `revokeGrant`): tokens it already holds stop here
   * right away instead of at their expiry.
   */
  revoke(clientId: string) {
    const at = Math.floor(Date.now() / 1000)
    this.ctx.storage.sql.exec(
      'INSERT INTO revoked (id, at) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at',
      clientId,
      at,
    )
    this.ctx.storage.sql.exec('DELETE FROM clients WHERE id = ?', clientId)
  }
}
