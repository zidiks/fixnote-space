import { describe, expect, it } from 'vitest'
import { RATE, Segmenter } from './segments'

const FRAME = RATE / 10

/** Feeds 100 ms frames at each loudness for `ms`; returns the pieces cut and what stop leaves. */
function record(parts: [level: number, ms: number][], opts?: { dropSilent?: boolean }) {
  const s = new Segmenter(opts)
  const pieces: number[] = []
  let t = 0
  let total = 0
  for (const [level, ms] of parts) {
    for (let end = t + ms; t < end; t += 100) {
      const piece = s.push(new Float32Array(FRAME).fill(level), level, t)
      total += FRAME
      if (piece) pieces.push(piece.length / RATE)
    }
  }
  return { pieces, rest: s.flush(), total: total / RATE }
}

describe('Segmenter', () => {
  it('cuts at pauses once a piece is long enough, and loses nothing', () => {
    const { pieces, rest, total } = record([
      [0.005, 500],
      [0.1, 1000],
      [0.005, 1000], // a pause, but the piece is still short
      [0.1, 2000],
      [0.005, 1000], // cut here
      [0.1, 1500],
    ])
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toBeGreaterThan(4)
    expect((rest?.length ?? 0) / RATE + (pieces[0] ?? 0)).toBeCloseTo(total)
  })

  it('drops only the silence after the last piece', () => {
    const { pieces, rest } = record([
      [0.1, 3500],
      [0.005, 2500],
    ])
    expect(pieces).toHaveLength(1)
    expect(rest).toBeNull()
  })

  it('keeps a recording that was never cut, even a quiet one', () => {
    expect(record([[0.01, 2000]]).rest?.length).toBe(2 * RATE)
  })

  it('cuts long speech without pauses', () => {
    const { pieces } = record([[0.1, 60_000]])
    expect(pieces.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...pieces)).toBeLessThanOrEqual(25.1)
  })

  it('on a call, drops pieces in which nobody spoke', () => {
    const { pieces, rest } = record(
      [
        [0.005, 40_000], // the other side talks for a while: silence here
        [0.1, 3000],
        [0.005, 1000],
        [0.005, 2000],
      ],
      { dropSilent: true },
    )
    // The piece is the speech with a second of lead-in, not the forty seconds before it.
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toBeGreaterThan(3)
    expect(pieces[0]).toBeLessThan(6)
    expect(rest).toBeNull()
    expect(record([[0.005, 2000]], { dropSilent: true }).rest).toBeNull()
  })
})
