import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type BridgeStatus, PING_EVERY_MS, RemoteBridge, type SocketLike } from './bridge'
import { PING, RELAY_CLOSE, RELAY_PROTOCOL, type RelayCall } from './protocol'

class FakeSocket implements SocketLike {
  readyState = 0
  sent: string[] = []
  closed: number | null = null
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}
  send(data: string) {
    this.sent.push(data)
  }
  close(code = 1000) {
    this.closed = code
    this.readyState = 3
  }
  open() {
    this.readyState = 1
    this.onopen?.({})
  }
  drop(code: number) {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

let sockets: FakeSocket[]
let statuses: BridgeStatus[]

const bridge = (token: () => Promise<string | null> = async () => 'jwt') =>
  new RemoteBridge({
    url: 'wss://relay/device',
    token,
    device: 'Test',
    random: () => 1,
    connect: (url, protocols) => {
      const s = new FakeSocket(url, protocols)
      sockets.push(s)
      return s
    },
    onStatus: (s) => statuses.push(s),
    run: async (call: RelayCall) => ({
      type: 'result',
      id: call.id,
      content: [{ type: 'text', text: `ran ${call.tool}` }],
    }),
  })

beforeEach(() => {
  vi.useFakeTimers()
  sockets = []
  statuses = []
})
afterEach(() => vi.useRealTimers())

describe('RemoteBridge', () => {
  it('connects with the session token as a subprotocol and answers calls', async () => {
    const b = bridge()
    b.start()
    await vi.advanceTimersByTimeAsync(0)
    const s = sockets[0] as FakeSocket
    expect(s.protocols).toEqual([RELAY_PROTOCOL, 'auth.jwt'])
    s.open()
    expect(b.status).toBe('online')
    expect(JSON.parse(s.sent[0] ?? '')).toEqual({ type: 'hello', device: 'Test' })
    s.onmessage?.({
      data: JSON.stringify({ type: 'call', id: 'c1', tool: 'list_folders', args: {}, client: {} }),
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(JSON.parse(s.sent[1] ?? '')).toEqual({
      type: 'result',
      id: 'c1',
      content: [{ type: 'text', text: 'ran list_folders' }],
    })
    await vi.advanceTimersByTimeAsync(PING_EVERY_MS)
    expect(s.sent.at(-1)).toBe(PING)
  })

  it('reconnects with growing backoff and resets it once online', async () => {
    const b = bridge()
    b.start()
    await vi.advanceTimersByTimeAsync(0)
    ;(sockets[0] as FakeSocket).drop(1006)
    expect(b.status).toBe('offline')
    await vi.advanceTimersByTimeAsync(999)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(2)
    ;(sockets[1] as FakeSocket).drop(1006)
    await vi.advanceTimersByTimeAsync(1999)
    expect(sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(3)
    ;(sockets[2] as FakeSocket).open()
    ;(sockets[2] as FakeSocket).drop(1006)
    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets).toHaveLength(4)
  })

  it('waits long when the account is not on Pro, and stops when turned off elsewhere', async () => {
    const b = bridge()
    b.start()
    await vi.advanceTimersByTimeAsync(0)
    ;(sockets[0] as FakeSocket).drop(RELAY_CLOSE.proRequired)
    expect(b.status).toBe('pro')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(sockets).toHaveLength(2)
    ;(sockets[1] as FakeSocket).drop(RELAY_CLOSE.off)
    expect(b.status).toBe('off')
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(sockets).toHaveLength(2)
  })

  it('does not connect without a session, and stop() closes the socket', async () => {
    const none = bridge(async () => null)
    none.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(none.status).toBe('denied')
    expect(sockets).toHaveLength(0)
    none.stop()

    const b = bridge()
    b.start()
    await vi.advanceTimersByTimeAsync(0)
    ;(sockets[0] as FakeSocket).open()
    b.stop()
    expect((sockets[0] as FakeSocket).closed).toBe(1000)
    expect(statuses.at(-1)).toBe('off')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(sockets).toHaveLength(1)
  })
})
