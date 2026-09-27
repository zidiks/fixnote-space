import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { collabRoom, cryptoReady, deriveKeys, newRecoverySecret } from '../crypto'
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
  const room = () => collabRoom(deriveKeys(newRecoverySecret()), 'note-1')

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
    a.awareness.setLocalStateField('user', { name: 'Mac' })
    const tick = async (ms: number) => {
      for (let i = 0; i < ms; i += 10) {
        clock += 10
        await vi.advanceTimersByTimeAsync(10)
      }
    }
    await tick(1300)
    expect(b.awareness.getStates().get(a.doc.clientID)).toEqual({ user: { name: 'Mac' } })
    expect(a.rtt).toBe(100)
    a.destroy()
    await tick(200)
    // A left: its cursor is gone on B.
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false)
    b.destroy()
  })
})
