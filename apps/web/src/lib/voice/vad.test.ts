import { describe, expect, it } from 'vitest'
import { Vad, type VadEvent } from './vad'

/** Feeds `ms` of frames at `level` (10 ms apart) and collects the events with their times. */
function run(vad: Vad, parts: [level: number, ms: number][]) {
  const events: [VadEvent, number][] = []
  let t = 0
  for (const [level, ms] of parts) {
    for (let end = t + ms; t < end; t += 10) {
      const e = vad.push(level, t)
      if (e) events.push([e, t])
    }
  }
  return events
}

describe('Vad', () => {
  it('finds a phrase and its end after the pause', () => {
    const events = run(new Vad(), [
      [0.005, 1000],
      [0.1, 1500],
      [0.005, 1500],
    ])
    expect(events.map(([e]) => e)).toEqual(['start', 'end'])
    expect(events[0]?.[1]).toBeGreaterThanOrEqual(1100)
    expect(events[1]?.[1]).toBeGreaterThanOrEqual(2500 + 900 - 10)
  })

  it('keeps short pauses inside the phrase', () => {
    const events = run(new Vad(), [
      [0.005, 500],
      [0.1, 800],
      [0.005, 400],
      [0.1, 800],
      [0.005, 1500],
    ])
    expect(events.map(([e]) => e)).toEqual(['start', 'end'])
  })

  it('ignores a click and calls a cough too short to be a phrase', () => {
    expect(
      run(new Vad(), [
        [0.005, 500],
        [0.2, 60],
        [0.005, 1500],
      ]),
    ).toEqual([])
    const cough = run(new Vad(), [
      [0.005, 500],
      [0.2, 200],
      [0.005, 1500],
    ])
    expect(cough.map(([e]) => e)).toEqual(['start', 'cancel'])
  })

  it('follows a noisy room, so its hum is not speech', () => {
    const events = run(new Vad(), [
      [0.03, 4000],
      [0.15, 1000],
      [0.03, 1500],
    ])
    expect(events.map(([e]) => e)).toEqual(['start', 'end'])
    expect(events[0]?.[1]).toBeGreaterThanOrEqual(4000)
  })

  it('cuts a phrase that never ends', () => {
    const events = run(new Vad({ maxMs: 2000 }), [
      [0.005, 300],
      [0.1, 3000],
    ])
    expect(events.map(([e]) => e)).toContain('end')
  })
})
