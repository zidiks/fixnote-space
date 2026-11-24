import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { cryptoReady, newNoteKey, noteKeyBytes } from '../crypto'
import { CollabSession, type CollabTransport } from './session'

/**
 * A broadcast relay like the real one (it only ever sees sealed bytes), with a random delay per
 * delivery, so messages can arrive out of order.
 */
function relay(opts: { minMs: number; maxMs: number; rand?: () => number }) {
  const peers = new Set<(m: Uint8Array) => void>()
  const seen: Uint8Array[] = []
  const rand = opts.rand ?? Math.random
  const connect = (): CollabTransport => {
    let handler: ((m: Uint8Array) => void) | null = null
    const deliver = (m: Uint8Array) => handler?.(m)
    peers.add(deliver)
    return {
      send: (m) => {
        seen.push(m)
        for (const p of peers) {
          if (p === deliver) continue
          setTimeout(() => p(m), opts.minMs + rand() * (opts.maxMs - opts.minMs))
        }
      },
      onMessage: (h) => {
        handler = h
        return () => {
          handler = null
        }
      },
      close: () => peers.delete(deliver),
    }
  }
  return { connect, seen }
}

/**
 * A transport that can lose the network, like Realtime: while down nothing goes out or comes in,
 * and it says when it is connected again.
 */
function droppable(inner: CollabTransport) {
  let up = true
  const status = new Set<(on: boolean) => void>()
  const transport: CollabTransport = {
    send: (m) => {
      if (up) inner.send(m)
    },
    onMessage: (h) =>
      inner.onMessage((m) => {
        if (up) h(m)
      }),
    onStatus: (h) => {
      status.add(h)
      // Joined a moment later, as a channel is.
      queueMicrotask(() => h(up))
      return () => status.delete(h)
    },
    close: () => inner.close(),
  }
  const set = (on: boolean) => {
    up = on
    for (const h of status) h(on)
  }
  return { transport, drop: () => set(false), restore: () => set(true) }
}

/** Deterministic randomness, so a failure can be replayed. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const text = (s: CollabSession) => s.doc.getText('t').toString()

beforeAll(cryptoReady)
afterEach(() => {
  vi.useRealTimers()
})

describe('CollabSession', () => {
  const room = () => ({ id: 'note-1', key: noteKeyBytes(newNoteKey()) })

  it('converges when two devices type at once over a slow, reordering network', async () => {
    vi.useFakeTimers()
    const { id, key } = room()
    const net = relay({ minMs: 40, maxMs: 120, rand: seeded(7) })
    const a = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    const b = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    const rand = seeded(42)
    // Two people typing ~25 characters a second each for 8 seconds, with some deletions.
    for (let step = 0; step < 200; step++) {
      for (const [s, ch] of [
        [a, 'a'],
        [b, 'b'],
      ] as const) {
        const t = s.doc.getText('t')
        if (t.length > 5 && rand() < 0.15) t.delete(Math.floor(rand() * (t.length - 1)), 1)
        else t.insert(Math.floor(rand() * (t.length + 1)), ch)
      }
      await vi.advanceTimersByTimeAsync(40)
    }
    await vi.advanceTimersByTimeAsync(1000)
    expect(text(a)).toBe(text(b))
    expect(text(a).length).toBeGreaterThan(200)
    // Batching: far fewer messages than keystrokes (400 edits per device).
    expect(a.stats.sent).toBeLessThan(220)
    a.destroy()
    b.destroy()
  })

  it('brings a device that joins later up to date, both ways', async () => {
    vi.useFakeTimers()
    const { id, key } = room()
    const net = relay({ minMs: 30, maxMs: 60 })
    const a = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    const alone = a.whenSynced(100)
    await vi.advanceTimersByTimeAsync(150)
    expect(await alone).toBe(false)
    a.doc.getText('t').insert(0, 'written before anyone joined. ')
    await vi.advanceTimersByTimeAsync(200)
    // B was offline and has an edit of its own from before (same starting point: empty).
    const bDoc = new Y.Doc()
    bDoc.getText('t').insert(0, 'B offline. ')
    const b = new CollabSession({ key, roomId: id, transport: net.connect(), doc: bDoc, pingMs: 0 })
    const synced = b.whenSynced(1000)
    await vi.advanceTimersByTimeAsync(500)
    expect(await synced).toBe(true)
    expect(text(a)).toBe(text(b))
    expect(text(a)).toContain('written before anyone joined.')
    expect(text(a)).toContain('B offline.')
    a.destroy()
    b.destroy()
  })

  it('puts only ciphertext on the wire and ignores messages sealed with another key', async () => {
    vi.useFakeTimers()
    const { id, key } = room()
    const other = room()
    const net = relay({ minMs: 1, maxMs: 2 })
    const a = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    const b = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    const stranger = new CollabSession({
      key: other.key,
      roomId: id,
      transport: net.connect(),
      pingMs: 0,
    })
    a.doc.getText('t').insert(0, 'секретный план')
    stranger.doc.getText('t').insert(0, 'noise')
    await vi.advanceTimersByTimeAsync(200)
    expect(text(b)).toBe('секретный план')
    expect(text(stranger)).toBe('noise')
    expect(b.stats.rejected).toBeGreaterThan(0)
    const wire = net.seen.map((m) => new TextDecoder().decode(m)).join('')
    expect(wire).not.toContain('секретный')
    expect(wire).not.toContain('план')
    for (const s of [a, b, stranger]) s.destroy()
  })

  it('shares cursors and measures the round trip', async () => {
    vi.useFakeTimers()
    const { id, key } = room()
    const net = relay({ minMs: 50, maxMs: 50 })
    let clock = 0
    const now = () => clock
    const a = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 1000, now })
    const b = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0, now })
    const rtts: number[] = []
    a.onRtt = (ms) => rtts.push(ms)
    a.awareness.setLocalStateField('user', { name: 'Mac' })
    b.awareness.setLocalStateField('user', { name: 'PC' })
    const tick = async (ms: number) => {
      for (let i = 0; i < ms; i += 10) {
        clock += 10
        await vi.advanceTimersByTimeAsync(10)
      }
    }
    await tick(1300)
    expect(b.awareness.getStates().get(a.doc.clientID)).toEqual({ user: { name: 'Mac' } })
    expect(a.rtt).toBe(100)
    expect(rtts).toContain(100)
    a.destroy()
    await tick(200)
    // A left: its cursor is gone on B.
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false)
    b.destroy()
  })

  it('skips periodic pings when alone, disconnected, or without an onRtt listener', async () => {
    vi.useFakeTimers()
    const { id, key } = room()
    const net = relay({ minMs: 10, maxMs: 10 })
    const link = droppable(net.connect())
    const a = new CollabSession({ key, roomId: id, transport: link.transport, pingMs: 500 })
    await vi.advanceTimersByTimeAsync(100)
    const sentAlone = a.stats.sent
    // Alone (awareness size === 1) even with onRtt set: no periodic PINGs sent.
    a.onRtt = () => {}
    await vi.advanceTimersByTimeAsync(2000)
    expect(a.stats.sent).toBe(sentAlone)

    // Peer joins, but onRtt is removed: still no periodic PINGs sent.
    a.onRtt = undefined
    const b = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    b.awareness.setLocalStateField('user', { name: 'Peer' })
    await vi.advanceTimersByTimeAsync(200)
    expect(a.awareness.getStates().size).toBe(2)
    const sentWithPeerNoListener = a.stats.sent
    await vi.advanceTimersByTimeAsync(2000)
    expect(a.stats.sent).toBe(sentWithPeerNoListener)

    // Disconnected with onRtt set: no periodic PINGs sent.
    a.onRtt = () => {}
    link.drop()
    const sentWhileOffline = a.stats.sent
    await vi.advanceTimersByTimeAsync(2000)
    expect(a.stats.sent).toBe(sentWhileOffline)

    // Reconnected + peer present + onRtt set: periodic PINGs resume.
    link.restore()
    await vi.advanceTimersByTimeAsync(200)
    const sentBeforePing = a.stats.sent
    await vi.advanceTimersByTimeAsync(600)
    expect(a.stats.sent).toBeGreaterThan(sentBeforePing)

    a.destroy()
    b.destroy()
  })

  it('clears pending whenSynced waiters and destroys doc on destroy()', async () => {
    vi.useFakeTimers()
    const { id, key } = room()
    const net = relay({ minMs: 20, maxMs: 20 })
    const externalDoc = new Y.Doc()
    let destroyed = false
    externalDoc.on('destroy', () => {
      destroyed = true
    })
    const a = new CollabSession({
      key,
      roomId: id,
      transport: net.connect(),
      doc: externalDoc,
      pingMs: 0,
    })
    const waiting = a.whenSynced(5000)
    a.destroy()
    // Resolves immediately without waiting for timeout.
    expect(await waiting).toBe(false)
    expect(await a.whenSynced(5000)).toBe(false)
    expect(destroyed).toBe(true)

    // destroyDoc: false keeps caller-owned doc alive.
    const keptDoc = new Y.Doc()
    let keptDestroyed = false
    keptDoc.on('destroy', () => {
      keptDestroyed = true
    })
    const b = new CollabSession({
      key,
      roomId: id,
      transport: net.connect(),
      doc: keptDoc,
      pingMs: 0,
      destroyDoc: false,
    })
    b.destroy()
    expect(keptDestroyed).toBe(false)
    keptDoc.destroy()
  })

  it('sends the caret in the same batch as the text typed before it', async () => {
    vi.useFakeTimers()
    const { id, key } = room()
    const net = relay({ minMs: 30, maxMs: 30 })
    const a = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    const b = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    await vi.advanceTimersByTimeAsync(100)
    const sentBefore = a.stats.sent
    // Typing: the text changes, then the caret moves after it.
    a.doc.getText('t').insert(0, 'hi')
    a.awareness.setLocalStateField('cursor', { at: 2 })
    await vi.advanceTimersByTimeAsync(50)
    // One batch: the text and, right behind it, the caret (not the caret on its own timer later).
    expect(a.stats.sent - sentBefore).toBe(2)
    await vi.advanceTimersByTimeAsync(30)
    expect(text(b)).toBe('hi')
    expect(b.awareness.getStates().get(a.doc.clientID)).toMatchObject({ cursor: { at: 2 } })
    a.destroy()
    b.destroy()
  })

  it('catches up both ways after the network drops and comes back', async () => {
    vi.useFakeTimers()
    const { id, key } = room()
    const net = relay({ minMs: 20, maxMs: 50 })
    const a = new CollabSession({ key, roomId: id, transport: net.connect(), pingMs: 0 })
    const link = droppable(net.connect())
    const b = new CollabSession({ key, roomId: id, transport: link.transport, pingMs: 0 })
    a.awareness.setLocalStateField('user', { name: 'A' })
    b.awareness.setLocalStateField('user', { name: 'B' })
    a.doc.getText('t').insert(0, 'start. ')
    await vi.advanceTimersByTimeAsync(300)
    expect(text(b)).toBe('start. ')
    expect(b.connected).toBe(true)
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(true)

    const seen: boolean[] = []
    b.onConnection = (on) => seen.push(on)
    link.drop()
    expect(b.connected).toBe(false)
    // Out of the room, the others' carets go.
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false)
    // Both keep typing; nothing gets through.
    a.doc.getText('t').insert(7, 'A while B was away. ')
    b.doc.getText('t').insert(0, 'B offline. ')
    await vi.advanceTimersByTimeAsync(500)
    expect(text(a)).not.toContain('B offline.')
    expect(text(b)).not.toContain('A while B was away.')

    link.restore()
    await vi.advanceTimersByTimeAsync(500)
    expect(seen).toEqual([false, true])
    expect(text(a)).toBe(text(b))
    expect(text(a)).toContain('A while B was away.')
    expect(text(a)).toContain('B offline.')
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(true)
    expect(a.awareness.getStates().has(b.doc.clientID)).toBe(true)
    a.destroy()
    b.destroy()
  })
})
