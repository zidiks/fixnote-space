import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import * as Y from 'yjs'
import { openRoomMessage, sealRoomMessage } from '../crypto'

/**
 * Carries sealed room messages between the devices in a room (Supabase Realtime broadcast in the
 * app, an in-memory relay in tests). It sees ciphertext only and delivers to everyone but the sender.
 */
export interface CollabTransport {
  send(message: Uint8Array): void
  onMessage(handler: (message: Uint8Array) => void): () => void
  close(): void
}

export interface CollabStats {
  sent: number
  received: number
  bytesSent: number
  /** Messages that did not open with the room key (someone else's, or tampered with). */
  rejected: number
}

// Message types, the first byte of every (sealed) message.
const UPDATE = 0
/** "Here is what I have (state vector); send me what I miss, and tell me what you have." */
const HELLO = 1
/** The same, as the answer to a HELLO: not answered with another HELLO. */
const HELLO_BACK = 2
const AWARENESS = 3
const PING = 4
const PONG = 5

/** Updates this session applied from others, so they are not sent back out. */
const REMOTE = Symbol('remote')

const frame = (type: number, body: Uint8Array) => {
  const out = new Uint8Array(body.length + 1)
  out[0] = type
  out.set(body, 1)
  return out
}

/** Encoded, a state vector of an empty document. */
const EMPTY_UPDATE_SIZE = 2

/**
 * One note edited live by several devices. Local edits are batched (one message per `batchMs`),
 * sealed with the room key and broadcast; remote ones are applied as they come, in any order (Yjs
 * merges them). A device that joins late asks for what it misses. Cursors and names travel as
 * awareness, at most every `awarenessMs`. A ping every few seconds measures the round trip.
 */
export class CollabSession {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  readonly stats: CollabStats = { sent: 0, received: 0, bytesSent: 0, rejected: 0 }
  /** Smoothed round trip to the other devices, in ms; null until someone answered. */
  rtt: number | null = null
  onRtt?: (ms: number) => void

  private readonly key: Uint8Array
  private readonly roomId: string
  private readonly transport: CollabTransport
  private readonly batchMs: number
  private readonly awarenessMs: number
  private readonly now: () => number
  private pending: Uint8Array[] = []
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private awarenessTimer: ReturnType<typeof setTimeout> | undefined
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private awarenessChanged = new Set<number>()
  private stopListening: (() => void) | null = null
  private destroyed = false
  private answered = false
  private onAnswered: (() => void)[] = []
  private readonly listenOnly: boolean

  constructor(opts: {
    key: Uint8Array
    roomId: string
    transport: CollabTransport
    doc?: Y.Doc
    batchMs?: number
    awarenessMs?: number
    pingMs?: number
    now?: () => number
    /** Only receives (a viewer: the server does not let it send anyway). */
    listenOnly?: boolean
  }) {
    this.doc = opts.doc ?? new Y.Doc()
    this.awareness = new Awareness(this.doc)
    this.key = opts.key
    this.roomId = opts.roomId
    this.transport = opts.transport
    this.batchMs = opts.batchMs ?? 50
    this.awarenessMs = opts.awarenessMs ?? 100
    this.now = opts.now ?? (() => performance.now())
    this.listenOnly = opts.listenOnly ?? false
    this.doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    this.stopListening = this.transport.onMessage((m) => this.receive(m))
    this.send(HELLO, Y.encodeStateVector(this.doc))
    const pingMs = opts.pingMs ?? 3000
    if (pingMs > 0 && !this.listenOnly) this.pingTimer = setInterval(() => this.ping(), pingMs)
  }

  /**
   * Resolves true once another device answered (its state is applied by then: it sends the state
   * before the answer), or false after `timeoutMs` with nobody there.
   */
  whenSynced(timeoutMs = 1500): Promise<boolean> {
    if (this.answered) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      this.onAnswered.push(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  /** Devices in the room, this one included (by their cursors' presence). */
  devices(): number {
    return Math.max(1, this.awareness.getStates().size)
  }

  /** Sends what is waiting now (normally done every `batchMs`). */
  flush(): void {
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    if (!this.pending.length) return
    const update = this.pending.length === 1 ? this.pending[0] : Y.mergeUpdates(this.pending)
    this.pending = []
    if (update) this.send(UPDATE, update)
  }

  destroy(): void {
    if (this.destroyed) return
    this.flush()
    // Tell the others this device left, so its cursor disappears right away.
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local')
    this.flushAwareness()
    this.destroyed = true
    clearTimeout(this.awarenessTimer)
    clearInterval(this.pingTimer)
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    this.awareness.destroy()
    this.stopListening?.()
    this.transport.close()
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE || this.destroyed) return
    this.pending.push(update)
    this.flushTimer ??= setTimeout(() => this.flush(), this.batchMs)
  }

  private onAwarenessUpdate = (
    change: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === REMOTE || this.destroyed) return
    for (const id of [...change.added, ...change.updated, ...change.removed])
      this.awarenessChanged.add(id)
    this.awarenessTimer ??= setTimeout(() => this.flushAwareness(), this.awarenessMs)
  }

  private flushAwareness() {
    clearTimeout(this.awarenessTimer)
    this.awarenessTimer = undefined
    if (!this.awarenessChanged.size) return
    const ids = [...this.awarenessChanged]
    this.awarenessChanged.clear()
    this.send(AWARENESS, encodeAwarenessUpdate(this.awareness, ids))
  }

  private ping() {
    const body = new Uint8Array(12)
    const view = new DataView(body.buffer)
    view.setUint32(0, this.doc.clientID)
    view.setFloat64(4, this.now())
    this.send(PING, body)
  }

  private send(type: number, body: Uint8Array) {
    if (this.destroyed || this.listenOnly) return
    const sealed = sealRoomMessage(this.key, this.roomId, frame(type, body))
    this.stats.sent++
    this.stats.bytesSent += sealed.length
    this.transport.send(sealed)
  }

  private receive(sealed: Uint8Array) {
    if (this.destroyed) return
    const message = openRoomMessage(this.key, this.roomId, sealed)
    if (!message?.length) {
      this.stats.rejected++
      return
    }
    this.stats.received++
    const body = message.subarray(1)
    switch (message[0]) {
      case UPDATE:
        Y.applyUpdate(this.doc, body, REMOTE)
        break
      case HELLO:
      case HELLO_BACK: {
        // Send the other device what it misses; to a HELLO, also say what we have.
        const diff = Y.encodeStateAsUpdate(this.doc, body)
        if (diff.length > EMPTY_UPDATE_SIZE) this.send(UPDATE, diff)
        if (message[0] === HELLO) {
          this.send(HELLO_BACK, Y.encodeStateVector(this.doc))
          if (this.awareness.getLocalState())
            this.send(AWARENESS, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]))
        } else if (!this.answered) {
          this.answered = true
          for (const done of this.onAnswered.splice(0)) done()
        }
        break
      }
      case AWARENESS:
        applyAwarenessUpdate(this.awareness, body, REMOTE)
        break
      case PING:
        this.send(PONG, body)
        break
      case PONG: {
        const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
        if (view.getUint32(0) !== this.doc.clientID) break
        const ms = this.now() - view.getFloat64(4)
        this.rtt = this.rtt === null ? ms : Math.round(this.rtt * 0.7 + ms * 0.3)
        this.onRtt?.(this.rtt)
        break
      }
    }
  }
}
