import { type Ease, FADE, type Move, SETTLE, TRAVEL, type Track, typing } from '../../../lib/anim'

/**
 * One loop of each search card (Recall.astro), after the designer's prototype: the same beats,
 * durations and curves, as tracks for lib/anim. Times are seconds from the loop start, which is
 * also the card's still frame before it plays. Typed queries differ per language, so everything
 * after the typing moves with its length.
 */
export interface Loop {
  length: number
  /** The frame shown with reduced motion (the results). */
  still: number
  tracks: Track[]
}

/** Deterministic uneven typing rhythm: a key every ~85 ms, a little longer after a space. */
export function keyTimes(text: string, start: number, step = 0.085): number[] {
  let seed = text.length * 7919
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const out: number[] = []
  let t = start
  for (const ch of text) {
    out.push(+t.toFixed(3))
    t += step + (rand() - 0.5) * 0.04 + (ch === ' ' ? 0.03 : 0)
  }
  return out
}

const ty = (y: number) => `translateY(${y}px)`
const card = (y: number, s: number) => `translateY(${y}px) scale(${s})`
const op = (k: string, from: number, moves: Move[]): Track => ({
  k,
  prop: 'opacity',
  from: `${from}`,
  moves,
})
const tf = (k: string, from: string, moves: Move[]): Track => ({
  k,
  prop: 'transform',
  from,
  moves,
})
const fade = (at: number, dur: number, to: number, ease: Ease = FADE): Move => ({
  at,
  dur,
  to: `${to}`,
  ease,
})
const snap = (at: number, to: number | string): Move => ({ at, to: `${to}` })

/* ── Search by meaning: the field types, rises, results then similar notes. ── */
export function meaningLoop(query: string): Loop {
  const type = 0.45
  const keys = keyTimes(query, type, 0.106)
  const last = keys[keys.length - 1] ?? 0
  const s = last + 0.05 - 1.3 // later beats follow the typing
  const lift = 1.45 + s
  const notes = 2.03 + s
  const swap1 = 2.9 + s
  const swap2 = 2.96 + s
  const similar = 3.16 + s
  const exit = 5.12 + s
  const ret = 5.3 + s
  const text = 5.5 + s
  const z = 5.75 + s
  const length = 6.45 + s
  const tracks: Track[] = [
    tf('pos', ty(0), [
      { at: lift, dur: 0.72, to: ty(-195), ease: TRAVEL },
      { at: ret, dur: 0.65, to: ty(0), ease: TRAVEL },
    ]),
    tf('field', 'scale(1)', [
      { at: type, dur: 0.4, to: 'scale(1.08)', ease: SETTLE },
      { at: lift, dur: 0.72, to: 'scale(1)', ease: TRAVEL },
    ]),
    op('ph', 0.7, [snap(type, 0), fade(text, 0.22, 0.7)]),
    op('esc', 1, [fade(type, 0.18, 0), fade(text, 0.18, 1)]),
    op('close', 0, [fade(type, 0.18, 1), fade(text, 0.18, 0)]),
    op('q', 1, [fade(text, 0.22, 0), snap(z + 0.01, 1)]),
    ...typing('q', keys, { clear: z, caretIn: type, caretOut: last + 0.03 }),
    tf('notes', card(18, 0.985), [
      { at: notes, dur: 0.52, to: card(0, 1), ease: SETTLE },
      { at: exit, dur: 0.36, to: card(8, 1), ease: FADE },
      snap(z, card(18, 0.985)),
    ]),
    op('notes', 0, [fade(notes, 0.34, 1), fade(exit, 0.36, 0)]),
    op('sk', 1, [fade(2.56 + s, 0.16, 0.88), fade(2.72 + s, 0.16, 1)]),
    op('sk0', 1, [fade(swap1, 0.3, 0), snap(z, 1)]),
    op('sk1', 1, [fade(swap1, 0.3, 0), snap(z, 1)]),
    op('sk2', 1, [fade(swap2, 0.3, 0), snap(z, 1)]),
    op('n0', 0, [fade(swap1 + 0.06, 0.36, 1), snap(z, 0)]),
    op('n1', 0, [fade(swap1 + 0.06, 0.36, 1), snap(z, 0)]),
    op('n2', 0, [fade(swap2 + 0.06, 0.36, 1), snap(z, 0)]),
    tf('similar', card(14, 0.985), [
      { at: similar, dur: 0.56, to: card(0, 1), ease: SETTLE },
      { at: exit, dur: 0.36, to: card(8, 1), ease: FADE },
      snap(z, card(14, 0.985)),
    ]),
    op('similar', 0, [fade(similar, 0.38, 1), fade(exit, 0.36, 0)]),
  ]
  return { length, still: 4.4 + s, tracks }
}

/* ── Text in images: "mor|" goes on to "morning", notes, then the pictures with highlights. ── */
export const IMAGE_TURN = [-2, 4, -4] as const
export function imagesLoop(query: string, typed: number): Loop {
  const keys = keyTimes(query.slice(typed), 0.15, 0.13)
  const last = keys[keys.length - 1] ?? 0
  const s = last - 0.55
  const swap = 0.75 + s
  const panelOut = 1.55 + s
  const images = 1.77 + s
  const marks = 2.6 + s
  const imgOut = 4.36 + s
  const back = 4.66 + s
  const panelIn = 4.72 + s
  const reset = 2.0 + s
  const length = 5.17 + s
  const pose = (y: number, sc: number, r: number) =>
    `translateY(${y}px) scale(${sc}) rotate(${r}deg)`
  const tracks: Track[] = [
    ...typing('q', keys, {
      shown: typed,
      clear: back,
      clearDur: 0.22,
      caretIn: -1,
      caretOut: last + 0.08,
    }),
    op('sk', 1, [fade(swap, 0.22, 0), snap(reset, 1)]),
    op('res', 0, [fade(swap + 0.05, 0.25, 1), snap(reset, 0)]),
    op('notes', 1, [fade(panelOut, 0.3, 0), fade(panelIn, 0.45, 1)]),
    tf('notes', ty(0), [
      { at: panelOut, dur: 0.3, to: ty(-6), ease: FADE },
      snap(reset, ty(12)),
      { at: panelIn, dur: 0.45, to: ty(0), ease: SETTLE },
    ]),
    op('sk2', 1, [snap(reset, 0), fade(4.84 + s, 0.22, 1)]),
    op('sk3', 1, [snap(reset, 0), fade(4.93 + s, 0.22, 1)]),
  ]
  ;[0, 0.06, 0.11].forEach((delay, i) => {
    const at = images + delay
    const turn = IMAGE_TURN[i] ?? 0
    tracks.push(
      tf(`img${i}`, pose(14, 0.9, turn), [
        { at, dur: 0.6, to: pose(0, 1, 0), ease: SETTLE },
        { at: imgOut, dur: 0.42, to: pose(8, 0.96, 0), ease: SETTLE },
        snap(imgOut + 0.43, pose(14, 0.9, turn)),
      ]),
      op(`img${i}`, 0, [fade(at, 0.36, 1), fade(imgOut, 0.42, 0)]),
      // The marker stroke, left to right.
      tf(`mark${i}`, 'scaleX(0)', [
        { at: marks, dur: 0.36, to: 'scaleX(1)', ease: FADE },
        snap(imgOut + 0.43, 'scaleX(0)'),
      ]),
    )
  })
  return { length, still: 3.4 + s, tracks }
}

/* ── Across languages: a query in one language finds a note in another. ── */
export function languagesLoop(query: string): Loop {
  // The prototype's times minus its first-run lead-in (0.61 s).
  const focus = 0.5
  const type = 0.68
  const keys = keyTimes(query, type, 0.0775)
  const last = keys[keys.length - 1] ?? 0
  const s = last - (type + 0.93)
  const listOut = 0.93
  const skIn = 1.03
  const results = 1.81 + s
  const select = 1.92 + s
  const ret = 3.82 + s
  const back = 3.92 + s
  const length = 4.53 + s
  const rowsAt = [0, 0.08, 0.15, 0.21]
  const tracks: Track[] = [
    op('focus', 0, [fade(focus, 0.18, 1), fade(ret, 0.35, 0)]),
    op('ph', 1, [snap(type, 0), fade(ret + 0.15, 0.2, 1)]),
    op('q', 1, [fade(ret, 0.2, 0), snap(ret + 0.4, 1)]),
    ...typing('q', keys, { clear: ret + 0.3, caretIn: type, caretOut: last + 0.08 }),
    op('hlist', 1, [fade(results, 0.35, 0), fade(ret, 0.35, 1)]),
    op('hres', 0, [fade(results, 0.35, 1), fade(ret, 0.35, 0)]),
    op('before', 1, [fade(select, 0.3, 0), fade(back, 0.3, 1, SETTLE)]),
    op('after', 0, [fade(select, 0.3, 1), fade(back, 0.3, 0, SETTLE)]),
  ]
  rowsAt.forEach((d, i) => {
    tracks.push(
      op(`row${i}`, 1, [fade(listOut, 0.18, 0), fade(back + d, 0.4, 1, SETTLE)]),
      tf(`row${i}`, ty(0), [
        snap(listOut + 0.4, ty(8)),
        { at: back + d, dur: 0.4, to: ty(0), ease: SETTLE },
      ]),
    )
  })
  ;[0, 1].forEach((i) => {
    const at = results + i * 0.06
    tracks.push(
      op(`sk${i}`, 0, [fade(skIn, 0.25, 1), fade(at, 0.25, 0)]),
      op(`res${i}`, 0, [fade(at + 0.05, 0.3, 1), fade(ret, 0.18, 0)]),
    )
  })
  return { length, still: 2.89 + s, tracks }
}

/* ── Search in a keystroke: ⌘ K pressed, the search opens and finds notes. ── */
const PRESS = [0.23, 1, 0.32, 1] as const
const DRIFT = [0.37, 0, 0.63, 1] as const
/** The keys' widths (⌘ is wider); the press wave grows 20 px on every side. */
export const KEY_WIDTHS = [130, 90] as const
export function keysLoop(query: string): Loop {
  // The prototype's times minus its first-run lead-in (0.2 s).
  const press = 0.93
  const open = 1.08
  const keysFade = 1.3
  const panel = 1.5167
  const type = 1.9267
  const keys = keyTimes(query, type, 0.079)
  const last = keys[keys.length - 1] ?? 0
  const s = last - (type + 0.95)
  const results = 3.0267 + s
  const ret = 4.8367 + s
  const z = 5.2667 + s
  const length = 5.4867 + s
  const tracks: Track[] = [
    tf('photo', 'scale(1)', [
      { at: 0, dur: ret, to: 'scale(1.02)', ease: DRIFT },
      { at: ret, dur: 0.65, to: 'scale(1)', ease: DRIFT },
    ]),
    op('input', 0, [fade(open, 0.28, 1, SETTLE), fade(ret, 0.35, 0, SETTLE)]),
    tf('input', ty(-6), [
      { at: open, dur: 0.28, to: ty(0), ease: SETTLE },
      { at: ret, dur: 0.35, to: ty(-4), ease: SETTLE },
      snap(z, ty(-6)),
    ]),
    op('panel', 0, [fade(panel, 0.45, 1, SETTLE), fade(ret, 0.35, 0, SETTLE)]),
    tf('panel', ty(12), [
      { at: panel, dur: 0.45, to: ty(0), ease: SETTLE },
      { at: ret, dur: 0.35, to: ty(8), ease: SETTLE },
      snap(z, ty(12)),
    ]),
    op('ph', 0.5, [snap(type, 0), snap(z, 0.5)]),
    op('esc', 1, [fade(type, 0.18, 0), snap(z, 1)]),
    op('close', 0, [fade(type, 0.18, 1), snap(z, 0)]),
    ...typing('q', keys, { clear: z, caretIn: type, caretOut: last + 0.08 }),
  ]
  KEY_WIDTHS.forEach((w, i) => {
    const at = i * 0.05
    const down = press + (i ? 0.05 : 0)
    const up = press + (i ? 0.19 : 0.23)
    const wave = down + 0.1
    tracks.push(
      tf(`key${i}`, card(10, 0.96), [
        { at, dur: 0.45, to: card(0, 1), ease: SETTLE },
        snap(1.8, card(10, 0.96)),
      ]),
      op(`face${i}`, 0, [fade(at, 0.45, 1, SETTLE), fade(keysFade, 0.2, 0)]),
      tf(`press${i}`, ty(0), [
        { at: down, dur: 0.1, to: ty(2), ease: PRESS },
        { at: up, dur: 0.14, to: ty(0), ease: PRESS },
      ]),
      op(`shade${i}`, 0, [fade(down, 0.1, 1, PRESS), fade(up, 0.14, 0, PRESS)]),
      tf(`wave${i}`, 'scale(1, 1)', [
        { at: wave, dur: 0.45, to: `scale(${(w + 40) / w}, ${130 / 90})`, ease: PRESS },
        snap(1.8, 'scale(1, 1)'),
      ]),
      // The wave fades with the keys if it is still going (K's is).
      op(`wave${i}`, 0, [
        fade(wave, 0.06, 0.22, 'linear'),
        fade(wave + 0.06, Math.min(0.39, keysFade - wave - 0.06), 0, PRESS),
      ]),
    )
  })
  ;[0, 1, 2, 3].forEach((i) => {
    const at = results + ([0, 0, 0.05, 0.09][i] ?? 0)
    tracks.push(
      op(`sk${i}`, 1, [fade(at, 0.22, 0), snap(z, 1)]),
      op(`res${i}`, 0, [fade(at + 0.06, 0.26, 1), snap(z, 0)]),
    )
  })
  return { length, still: 4.07 + s, tracks }
}

/* ── Search voice notes: three spoken searches; the mic answers the voice, notes scroll by. ── */
export const PITCH = 26
const SLOT = [0.45, 1, 0.3] as const
const slotOpacity = (pos: number) =>
  pos === -1 ? SLOT[0] : pos === 0 ? SLOT[1] : pos === 1 ? SLOT[2] : 0
const MOVE = [0.45, 0, 0.25, 1] as const
const OUT_CUBIC = [0.33, 1, 0.68, 1] as const

export interface Spoken {
  /** When each character of the phrase shows. */
  chars: number[]
  start: number
}

export function voiceLoop(phrases: string[]): Loop & { spoken: Spoken[] } {
  const tracks: Track[] = []
  const spoken: Spoken[] = []
  const pulses: [number, number][] = []
  // The prototype's loop starts with the first phrase (its 0.38 s lead-in dropped); the loader of
  // search 1 is already on.
  let swap = -0.18
  const plan = phrases.map((phrase, k) => {
    const start = swap + 0.18
    const words = phrase.split(' ')
    const dur = Math.min(1.7, 0.55 + 0.05 * phrase.length)
    const gap = 0.3
    const speak = dur - gap * (words.length - 1)
    const letters = words.join('').length
    const chars: number[] = []
    let t = start
    words.forEach((w, wi) => {
      const span = (speak * w.length) / letters
      for (let i = 0; i < w.length; i++)
        chars.push(+(t + (w.length > 1 ? (span * i) / (w.length - 1) : 0)).toFixed(3))
      // Two or three impulses per word.
      const n = w.length > 5 ? 3 : 2
      for (let p = 0; p < n; p++)
        pulses.push([
          t + 0.04 + ((span - 0.06) * p) / Math.max(1, n - 1),
          [0.85, 1, 0.65][p] ?? 0.8,
        ])
      t += span
      if (wi < words.length - 1) {
        chars.push(+(t + 0.05).toFixed(3))
        t += gap
      }
    })
    const speechEnd = start + dur
    const barOut = speechEnd + 0.25
    const upd1 = barOut + 0.28 + 0.35
    const upd2 = upd1 + 0.3 + 0.35
    const settleOut = upd2 + 0.3 + 0.15
    const finalIn = settleOut + 0.15
    const settled = finalIn + 0.3 + 0.07
    const leave = settled + 1.2
    spoken.push({ chars, start })
    swap = leave
    return { k, start, barOut, upd1, upd2, settleOut, finalIn, settled, leave }
  })
  // Ends where it started: search 1's phrase begins, its loader already on.
  const length = +(swap + 0.18).toFixed(3)
  // The loader: on at the start (search 1's), off after each phrase, on again at each swap.
  const bar: Move[] = []
  plan.forEach((p, i) => {
    bar.push(fade(p.barOut, 0.15, 0))
    const next = (plan[i + 1]?.start ?? swap + 0.18) - 0.18
    bar.push(fade(next, 0.15, 1))
  })
  tracks.push(op('bar', 1, bar))
  for (const p of plan) {
    const chars = spoken[p.k]?.chars ?? []
    // Phrase and notes leave in 160 ms; the next loop may begin 180 ms after.
    tracks.push(op(`b${p.k}`, 0, [snap(p.start, 1), fade(p.leave, 0.16, 0)]))
    chars.forEach((at, i) => {
      tracks.push(op(`b${p.k}c${i}`, 0, [fade(at, 0.12, 1), snap(p.leave + 0.17, 0)]))
    })
    // Five candidates browse by in the three slots; then the three found notes settle.
    for (let i = 0; i < 5; i++) {
      const y = (pos: number) => ty(pos * PITCH)
      tracks.push(
        tf(`r${p.k}-${i}`, ty((i - 1) * PITCH + 4), [
          { at: p.barOut, dur: 0.28, to: y(i - 1), ease: SETTLE },
          { at: p.upd1, dur: 0.3, to: y(i - 2), ease: MOVE },
          { at: p.upd2, dur: 0.3, to: y(i - 3), ease: MOVE },
          { at: p.settleOut, dur: 0.15, to: ty((i - 3) * PITCH - 6), ease: FADE },
          snap(p.settleOut + 0.2, ty((i - 1) * PITCH + 4)),
        ]),
        op(`r${p.k}-${i}`, 0, [
          fade(p.barOut, 0.28, slotOpacity(i - 1), SETTLE),
          fade(p.upd1, 0.3, slotOpacity(i - 2), MOVE),
          fade(p.upd2, 0.3, slotOpacity(i - 3), MOVE),
          fade(p.settleOut, 0.15, 0),
        ]),
      )
    }
    ;[0.04, 0, 0.07].forEach((delay, j) => {
      tracks.push(
        tf(`f${p.k}-${j}`, ty((j - 1) * PITCH + 4), [
          { at: p.finalIn + delay, dur: 0.3, to: ty((j - 1) * PITCH), ease: SETTLE },
          snap(p.leave + 0.17, ty((j - 1) * PITCH + 4)),
        ]),
        op(`f${p.k}-${j}`, 0, [
          fade(p.finalIn + delay, 0.3, SLOT[j] ?? 1, SETTLE),
          fade(p.leave, 0.16, 0),
        ]),
      )
    })
  }
  // The voice: each impulse swells the mic a little and sends out one soft halo (in turn).
  pulses.sort((a, b) => a[0] - b[0])
  const plate: Move[] = []
  pulses.forEach(([at, a], i) => {
    const room = (pulses[i + 1]?.[0] ?? length) - at - 0.01
    if (room < 0.02) return
    const up = Math.min(0.05, room / 2)
    const down = Math.min(0.09, room - up)
    plate.push({ at, dur: up, to: `scale(${(1 + 0.05 * a).toFixed(3)})`, ease: FADE })
    plate.push({ at: at + up, dur: down, to: 'scale(1)', ease: FADE })
  })
  tracks.push(tf('plate', 'scale(1)', plate))
  const halos: [number, number][][] = [[], [], []]
  pulses.forEach((p, i) => {
    halos[i % 3]?.push(p)
  })
  halos.forEach((list, h) => {
    const size: Move[] = []
    const glow: Move[] = []
    list.forEach(([at, a], i) => {
      const life = Math.min(0.62, (list[i + 1]?.[0] ?? length) - at - 0.03)
      size.push(
        { at, dur: life, to: 'scale(1.5)', ease: OUT_CUBIC },
        snap(at + life + 0.001, 'scale(0.72)'),
      )
      glow.push(
        fade(at, life * 0.18, +(0.42 * a).toFixed(3), 'linear'),
        fade(at + life * 0.18, life * 0.82, 0),
      )
    })
    tracks.push(tf(`halo${h}`, 'scale(0.72)', size), op(`halo${h}`, 0, glow))
  })
  const first = plan[0]
  return { length, still: first ? first.settled + 0.4 : 0, tracks, spoken }
}
