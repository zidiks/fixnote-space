import { describe, expect, it } from 'vitest'
import {
  BASE_RATE,
  DRAIN_MIN_RATE,
  DRAIN_S,
  LAG_S,
  MAX_FRAME_MS,
  revealStep,
  settleMarkdown,
} from './reveal'

/** Runs frames of `ms` until everything waiting is shown; returns how many ms it took. */
function drain(waiting: number, ended: boolean, ms = 1000 / 60): number {
  let carry = 0
  let t = 0
  while (waiting > 0 && t < 60_000) {
    const step = revealStep(waiting, ms, ended, carry)
    waiting -= step.count
    carry = step.carry
    t += ms
  }
  return t
}

describe('revealStep', () => {
  it('shows nothing when nothing waits', () => {
    expect(revealStep(0, 16, false)).toEqual({ count: 0, carry: 0 })
  })

  it('never shows more than what waits', () => {
    expect(revealStep(3, 100, true).count).toBe(3)
    expect(revealStep(1, 1000, false).count).toBe(1)
  })

  it('keeps a steady pace at 60 fps with a small backlog (carry, no stalls)', () => {
    let carry = 0
    let shown = 0
    for (let i = 0; i < 60; i++) {
      const step = revealStep(5, 1000 / 60, false, carry)
      shown += step.count
      carry = step.carry
    }
    // About BASE_RATE + 5 / LAG_S characters in one second.
    expect(shown).toBeGreaterThanOrEqual(Math.floor(BASE_RATE + 5 / LAG_S) - 1)
    expect(shown).toBeLessThanOrEqual(Math.ceil(BASE_RATE + 5 / LAG_S) + 1)
  })

  it('speeds up as the backlog grows, so it never trails far behind', () => {
    const small = revealStep(20, 16, false).count
    const big = revealStep(2000, 16, false).count
    expect(big).toBeGreaterThan(small * 10)
    // A big burst is caught up in about a second, not many.
    expect(drain(2000, false)).toBeLessThan(2000)
  })

  it('stays about LAG_S behind a fast stream', () => {
    // A model sending 200 chars/s: the backlog settles near LAG_S × (200 - BASE_RATE).
    let waiting = 0
    let carry = 0
    for (let i = 0; i < 600; i++) {
      waiting += 200 / 60
      const step = revealStep(Math.floor(waiting), 1000 / 60, false, carry)
      waiting -= step.count
      carry = step.carry
    }
    expect(waiting).toBeLessThan(LAG_S * (200 - BASE_RATE) + 10)
  })

  it('finishes quickly once the stream has ended', () => {
    expect(drain(5000, true)).toBeLessThanOrEqual(DRAIN_S * 1000 * 6)
    expect(drain(20, true)).toBeLessThanOrEqual((20 / DRAIN_MIN_RATE) * 1000 + 34)
    expect(drain(200, true)).toBeLessThan(drain(200, false))
  })

  it('treats a long gap as one capped frame, so a hidden tab does not dump everything', () => {
    expect(revealStep(10_000, 5000, false).count).toBe(
      revealStep(10_000, MAX_FRAME_MS, false).count,
    )
    expect(revealStep(10, -5, false).count).toBe(0)
  })
})

describe('settleMarkdown', () => {
  it('leaves finished text alone', () => {
    expect(settleMarkdown('A **bold** `code` [1].')).toBe('A **bold** `code` [1].')
  })

  it('closes an open bold or code span for now', () => {
    expect(settleMarkdown('A **bol')).toBe('A **bol**')
    expect(settleMarkdown('A **bold*')).toBe('A **bold**')
    expect(settleMarkdown('Run `pnpm')).toBe('Run `pnpm`')
  })

  it('holds back a marker or citation that has only begun', () => {
    expect(settleMarkdown('A **')).toBe('A ')
    expect(settleMarkdown('Run `')).toBe('Run ')
    expect(settleMarkdown('See [1')).toBe('See ')
    expect(settleMarkdown('See [1, 2')).toBe('See ')
  })
})
