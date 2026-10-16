import { describe, expect, it } from 'vitest'
import { RATE, Resampler, Segmenter } from './segments'

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
      [0.1, 4000],
      [0.005, 1200], // a pause, but the piece is still short
      [0.1, 6000],
      [0.005, 1200], // cut here
      [0.1, 1500],
    ])
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toBeGreaterThan(10)
    expect((rest?.length ?? 0) / RATE + (pieces[0] ?? 0)).toBeCloseTo(total)
  })

  it('cuts a short phrase after a long pause', () => {
    const { pieces } = record([
      [0.1, 3000],
      [0.005, 3000],
      [0.1, 2000],
    ])
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toBeGreaterThan(5)
    expect(pieces[0]).toBeLessThan(6.5)
  })

  it('drops only the silence after the last piece', () => {
    const { pieces, rest } = record([
      [0.1, 11_000],
      [0.005, 2500],
    ])
    expect(pieces).toHaveLength(1)
    expect(rest).toBeNull()
  })

  it('keeps a recording that was never cut, even a quiet one', () => {
    expect(record([[0.01, 2000]]).rest?.length).toBe(2 * RATE)
  })

  it('cuts long speech without pauses at its quietest place', () => {
    const s = new Segmenter()
    const pieces: Float32Array[] = []
    for (let t = 0; t < 45_000; t += 100) {
      // Loud speech with a quiet moment at 17.3 s.
      const level = t === 17_300 ? 0.001 : 0.1
      const piece = s.push(new Float32Array(FRAME).fill(level), level, t)
      if (piece) pieces.push(piece)
    }
    expect(pieces.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...pieces.map((p) => p.length / RATE))).toBeLessThanOrEqual(20.1)
    expect((pieces[0]?.length ?? 0) / RATE).toBeGreaterThanOrEqual(17.3)
    expect((pieces[0]?.length ?? 0) / RATE).toBeLessThanOrEqual(17.4)
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
    expect(pieces[0]).toBeLessThan(7)
    expect(rest).toBeNull()
    expect(record([[0.005, 2000]], { dropSilent: true }).rest).toBeNull()
  })
})

describe('Resampler', () => {
  const tone = (hz: number, rate: number, seconds: number) =>
    Float32Array.from({ length: rate * seconds }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate))
  const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)

  it('keeps speech and filters out what 16 kHz cannot hold', () => {
    for (const from of [48_000, 44_100]) {
      const r = new Resampler(from, RATE)
      // In blocks, as the microphone delivers them.
      const input = tone(1000, from, 1)
      const out: number[] = []
      for (let at = 0; at < input.length; at += 4096)
        out.push(...r.push(input.subarray(at, at + 4096)))
      expect(Math.abs(out.length - RATE)).toBeLessThan(80)
      expect(rms(Float32Array.from(out.slice(200, -200)))).toBeCloseTo(Math.SQRT1_2, 1)
      // 12 kHz would fold back to 4 kHz: it is gone instead.
      const high = new Resampler(from, RATE).push(tone(12_000, from, 1))
      expect(rms(high.subarray(200, -200))).toBeLessThan(0.01)
    }
  })
})
