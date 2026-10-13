import {
  CALL_TIMEOUT_MS,
  DEVICE_TIMEOUT_MESSAGE,
  NO_DEVICE_MESSAGE,
  parseFromDevice,
  type RelayCall,
  type RemoteClient,
  type ToolText,
} from '@fixnote/core/remote-mcp'

/** A device's socket as the hub sees it (a hibernatable WebSocket in the Durable Object). */
export interface DeviceSocket {
  send(text: string): void
  /** Label and connection time, kept with the socket across hibernation. */
  info(): DeviceInfo
  setInfo(info: DeviceInfo): void
}

export interface DeviceInfo {
  device: string
  connectedAt: number
}

export interface ToolAnswer {
  content: ToolText[]
  isError?: boolean
}

interface Pending {
  socket: DeviceSocket
  resolve: (answer: ToolAnswer) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Routing inside one account's Durable Object: a tool call goes to the device that connected
 * last, and its answer comes back by call id. Nothing is stored; a call waits in memory (the
 * object stays awake while a request is open) and gives up after `CALL_TIMEOUT_MS`.
 */
export class Hub {
  private readonly pending = new Map<string, Pending>()

  constructor(
    private readonly sockets: () => DeviceSocket[],
    private readonly opts: { timeoutMs?: number; newId?: () => string } = {},
  ) {}

  get waiting(): number {
    return this.pending.size
  }

  devices(): DeviceInfo[] {
    return this.sockets().map((s) => s.info())
  }

  /** Sends a call to the newest device and waits for its answer. */
  call(client: RemoteClient, tool: string, args: Record<string, unknown>): Promise<ToolAnswer> {
    const target = this.sockets()
      .map((s) => ({ s, at: s.info().connectedAt }))
      .sort((a, b) => b.at - a.at)[0]?.s
    if (!target) return Promise.resolve(error(NO_DEVICE_MESSAGE))
    const id = (this.opts.newId ?? (() => crypto.randomUUID()))()
    const message: RelayCall = { type: 'call', id, client, tool, args }
    return new Promise<ToolAnswer>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(error(DEVICE_TIMEOUT_MESSAGE))
      }, this.opts.timeoutMs ?? CALL_TIMEOUT_MS)
      this.pending.set(id, { socket: target, resolve, timer })
      try {
        target.send(JSON.stringify(message))
      } catch {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve(error(NO_DEVICE_MESSAGE))
      }
    })
  }

  /** A device went away: its unanswered calls fail now instead of at the timeout. */
  onClose(socket: DeviceSocket) {
    for (const [id, p] of this.pending) {
      if (p.socket !== socket) continue
      clearTimeout(p.timer)
      this.pending.delete(id)
      p.resolve(error(NO_DEVICE_MESSAGE))
    }
  }

  /** A message from a device: an answer, or its hello. */
  onMessage(socket: DeviceSocket, text: string) {
    const message = parseFromDevice(text)
    if (!message) return
    if (message.type === 'hello') {
      socket.setInfo({ ...socket.info(), device: message.device })
      return
    }
    const waiting = this.pending.get(message.id)
    // Only the device a call went to may answer it.
    if (!waiting || waiting.socket !== socket) return
    clearTimeout(waiting.timer)
    this.pending.delete(message.id)
    waiting.resolve({
      content: message.content.length ? message.content : [{ type: 'text', text: '' }],
      ...(message.isError ? { isError: true } : {}),
    })
  }
}

const error = (text: string): ToolAnswer => ({ content: [{ type: 'text', text }], isError: true })
