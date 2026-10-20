import {
  CALL_TIMEOUT_MS,
  CHANGE_UNSURE_MESSAGE,
  DEVICE_TIMEOUT_MESSAGE,
  type DeviceState,
  FIRST_TRY_MS,
  NO_DEVICE_MESSAGE,
  parseFromDevice,
  type RelayCall,
  type RemoteClient,
  type RemoteScope,
  type ToolText,
} from '@fixnote/core/remote-mcp'

/** A device's socket as the hub sees it (a hibernatable WebSocket in the Durable Object). */
export interface DeviceSocket {
  send(text: string): void
  /** What the device said about itself, kept with the socket across hibernation. */
  info(): DeviceInfo
  setInfo(info: DeviceInfo): void
}

export interface DeviceInfo extends DeviceState {
  connectedAt: number
  /** Last message from the device (or its connection). */
  activeAt: number
}

export const newDeviceInfo = (now: number): DeviceInfo => ({
  device: '',
  kind: 'web',
  syncedAt: null,
  // Nothing is sent to a device before its hello says Remote access is on there.
  serving: false,
  connectedAt: now,
  activeAt: now,
})

export interface ToolAnswer {
  content: ToolText[]
  isError?: boolean
}

type Outcome = { answer: ToolAnswer } | { failed: 'timeout' | 'gone' }

interface Pending {
  socket: DeviceSocket
  done: (outcome: Outcome) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * The order devices are asked in: only those serving (Remote access on), desktop before a browser
 * tab, then the freshest sync, then the most recently active.
 */
export function rankDevices(sockets: DeviceSocket[]): DeviceSocket[] {
  return sockets
    .filter((s) => s.info().serving)
    .sort((x, y) => {
      const a = x.info()
      const b = y.info()
      if (a.kind !== b.kind) return a.kind === 'desktop' ? -1 : 1
      if ((a.syncedAt ?? -1) !== (b.syncedAt ?? -1)) return (b.syncedAt ?? -1) - (a.syncedAt ?? -1)
      return b.activeAt - a.activeAt
    })
}

/**
 * Routing inside one account's Durable Object. Every call goes to exactly one device: the first
 * by `rankDevices`. A read may be tried once more on the next device when the first one does not
 * answer in `FIRST_TRY_MS` or goes away; a change is never sent twice. Nothing is
 * stored: a call waits in memory (the object stays awake while a request is open).
 */
export class Hub {
  private readonly pending = new Map<string, Pending>()

  constructor(
    private readonly sockets: () => DeviceSocket[],
    private readonly opts: {
      timeoutMs?: number
      firstTryMs?: number
      newId?: () => string
      now?: () => number
      /** A device changed what remote apps may see (kept for the account). */
      onScope?: (scope: RemoteScope) => void
    } = {},
  ) {}

  get waiting(): number {
    return this.pending.size
  }

  private now() {
    return (this.opts.now ?? Date.now)()
  }

  devices(): DeviceInfo[] {
    return this.sockets().map((s) => s.info())
  }

  async call(
    client: RemoteClient,
    tool: string,
    args: Record<string, unknown>,
    opts: { scope: RemoteScope; retry: boolean },
  ): Promise<ToolAnswer> {
    const ranked = rankDevices(this.sockets())
    if (!ranked.length) return error(NO_DEVICE_MESSAGE)
    const tries = opts.retry ? ranked.slice(0, 2) : ranked.slice(0, 1)
    let last: Outcome = { failed: 'gone' }
    for (const [i, socket] of tries.entries()) {
      const another = i < tries.length - 1
      last = await this.attempt(socket, client, tool, args, opts.scope, another)
      if ('answer' in last) return last.answer
    }
    // A change that reached a device may have been made even without an answer.
    if (!opts.retry) return error(CHANGE_UNSURE_MESSAGE)
    return error(last.failed === 'timeout' ? DEVICE_TIMEOUT_MESSAGE : NO_DEVICE_MESSAGE)
  }

  private attempt(
    socket: DeviceSocket,
    client: RemoteClient,
    tool: string,
    args: Record<string, unknown>,
    scope: RemoteScope,
    another: boolean,
  ): Promise<Outcome> {
    const id = (this.opts.newId ?? (() => crypto.randomUUID()))()
    const message: RelayCall = { type: 'call', id, client, tool, args, scope }
    const wait = another
      ? (this.opts.firstTryMs ?? FIRST_TRY_MS)
      : (this.opts.timeoutMs ?? CALL_TIMEOUT_MS)
    return new Promise<Outcome>((resolve) => {
      const done = (outcome: Outcome) => {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve(outcome)
      }
      const timer = setTimeout(() => done({ failed: 'timeout' }), wait)
      this.pending.set(id, { socket, done, timer })
      try {
        socket.send(JSON.stringify(message))
      } catch {
        done({ failed: 'gone' })
      }
    })
  }

  /** A device went away: its unanswered calls fail now (and a read moves on). */
  onClose(socket: DeviceSocket) {
    for (const p of [...this.pending.values()]) if (p.socket === socket) p.done({ failed: 'gone' })
  }

  /** A message from a device: an answer, its state or a new scope. */
  onMessage(socket: DeviceSocket, text: string) {
    const message = parseFromDevice(text)
    if (!message) return
    if (message.type === 'hello' || message.type === 'state') {
      const { type: _type, ...state } = message
      socket.setInfo({ ...socket.info(), ...state, activeAt: this.now() })
      return
    }
    if (message.type === 'scope') {
      // Only a device with Remote access on may set what remote apps see.
      if (socket.info().serving) this.opts.onScope?.(message.scope)
      return
    }
    if (message.type !== 'result') return
    const waiting = this.pending.get(message.id)
    // Only the device a call went to may answer it.
    if (!waiting || waiting.socket !== socket) return
    socket.setInfo({ ...socket.info(), activeAt: this.now() })
    waiting.done({
      answer: {
        content: message.content.length ? message.content : [{ type: 'text', text: '' }],
        ...(message.isError ? { isError: true } : {}),
      },
    })
  }
}

const error = (text: string): ToolAnswer => ({ content: [{ type: 'text', text }], isError: true })
