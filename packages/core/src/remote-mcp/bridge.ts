import {
  type FromDevice,
  PING,
  PONG,
  parseToDevice,
  RELAY_AUTH_PREFIX,
  RELAY_CLOSE,
  RELAY_PROTOCOL,
  type RelayCall,
  type RelayResult,
} from './protocol'

/**
 * off: not running; connecting; online: the relay can reach this device; offline: waiting to try
 * again; pro: the server says the account is not on Pro; denied: no session to connect with.
 */
export type BridgeStatus = 'off' | 'connecting' | 'online' | 'offline' | 'pro' | 'denied'

/** The part of a browser WebSocket the bridge uses (tests pass a fake one). */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: { code: number }) => void) | null
  onerror: ((ev: unknown) => void) | null
}

export type SocketFactory = (url: string, protocols: string[]) => SocketLike

export interface BridgeOptions {
  /** The relay's device endpoint, e.g. wss://mcp.fixnote.space/device. */
  url: string
  /** A current access token of the signed-in account (refreshed by the auth client); null = none. */
  token: () => Promise<string | null>
  /** Runs a call on this device (`RemoteExecutor.run`). */
  run: (call: RelayCall) => Promise<RelayResult>
  /** "Windows · FixNote", for the relay's list of devices. */
  device: string
  connect?: SocketFactory
  onStatus?: (status: BridgeStatus) => void
  random?: () => number
}

const OPEN = 1
/** Keeps NATs and proxies from dropping an idle socket; the relay answers without waking up. */
export const PING_EVERY_MS = 30_000
const FIRST_RETRY_MS = 1_000
const MAX_RETRY_MS = 60_000
/** Not on Pro: look again now and then (the app also restarts the bridge when the plan changes). */
const PRO_RETRY_MS = 10 * 60_000

const browserSocket: SocketFactory = (url, protocols) =>
  new WebSocket(url, protocols) as unknown as SocketLike

/**
 * Keeps this device reachable for remote MCP apps: one WebSocket to the relay, opened with the
 * account's session, reconnecting with backoff. Calls are answered by `run` on the device; only
 * the answer leaves it.
 */
export class RemoteBridge {
  private socket: SocketLike | null = null
  private running = false
  private attempt = 0
  private retry: ReturnType<typeof setTimeout> | null = null
  private ping: ReturnType<typeof setInterval> | null = null
  private current: BridgeStatus = 'off'

  constructor(private readonly opts: BridgeOptions) {}

  get status(): BridgeStatus {
    return this.current
  }

  start() {
    if (this.running) return
    this.running = true
    void this.open()
  }

  stop() {
    this.running = false
    this.clearTimers()
    const s = this.socket
    this.socket = null
    if (s) {
      s.onclose = null
      s.close(1000, 'off')
    }
    this.setStatus('off')
  }

  /** Back online (the browser said so): try now instead of waiting for the backoff. */
  nudge() {
    if (!this.running || this.socket) return
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.attempt = 0
    void this.open()
  }

  private setStatus(status: BridgeStatus) {
    if (status === this.current) return
    this.current = status
    this.opts.onStatus?.(status)
  }

  private clearTimers() {
    if (this.retry) clearTimeout(this.retry)
    if (this.ping) clearInterval(this.ping)
    this.retry = null
    this.ping = null
  }

  private later(ms: number) {
    if (!this.running) return
    if (this.retry) clearTimeout(this.retry)
    this.retry = setTimeout(() => {
      this.retry = null
      void this.open()
    }, ms)
  }

  private backoff(): number {
    const base = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** this.attempt)
    this.attempt += 1
    return Math.round(base * (0.5 + (this.opts.random ?? Math.random)() / 2))
  }

  private async open() {
    if (!this.running || this.socket) return
    this.setStatus('connecting')
    const token = await this.opts.token().catch(() => null)
    if (!this.running || this.socket) return
    if (!token) {
      this.setStatus('denied')
      this.later(this.backoff())
      return
    }
    let socket: SocketLike
    try {
      socket = (this.opts.connect ?? browserSocket)(this.opts.url, [
        RELAY_PROTOCOL,
        `${RELAY_AUTH_PREFIX}${token}`,
      ])
    } catch {
      this.setStatus('offline')
      this.later(this.backoff())
      return
    }
    this.socket = socket
    socket.onopen = () => {
      this.attempt = 0
      this.setStatus('online')
      this.send(socket, { type: 'hello', device: this.opts.device })
      if (this.ping) clearInterval(this.ping)
      this.ping = setInterval(() => {
        if (socket.readyState === OPEN) socket.send(PING)
      }, PING_EVERY_MS)
    }
    socket.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data === PONG) return
      const call = parseToDevice(ev.data)
      if (call) void this.answer(socket, call)
    }
    socket.onerror = () => undefined
    socket.onclose = (ev) => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.ping) clearInterval(this.ping)
      this.ping = null
      if (!this.running) return
      if (ev.code === RELAY_CLOSE.proRequired) {
        this.setStatus('pro')
        this.later(PRO_RETRY_MS)
        return
      }
      this.setStatus('offline')
      this.later(this.backoff())
    }
  }

  private async answer(socket: SocketLike, call: RelayCall) {
    let result: RelayResult
    try {
      result = await this.opts.run(call)
    } catch (err) {
      result = {
        type: 'result',
        id: call.id,
        content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      }
    }
    this.send(socket, result)
  }

  private send(socket: SocketLike, message: FromDevice) {
    if (socket.readyState === OPEN) socket.send(JSON.stringify(message))
  }
}
