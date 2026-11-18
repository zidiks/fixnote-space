import type { Dict } from '../../i18n'

/*
 * The hero's app (HeroApp.astro): three people in one shared note while the assistant answers,
 * after the designer's prototype. Alex is the person at this screen: he asks the assistant, then
 * edits with his own caret. Sofia and Ben are elsewhere: their carets carry their names, the way
 * Fixnote shows other people in a shared note. Everything is a function of the time t, so a frame
 * can be drawn again exactly; only scrolling is measured on the page (render.ts).
 *
 * The loop ends with the changing parts fading out and coming back as they started: frame 0 is the
 * page as it is served (the still picture before the script runs, and with reduced motion).
 */

export type Copy = Dict['heroApp']
export type Who = 'alex' | 'sofia' | 'ben'
export const PEOPLE: Who[] = ['alex', 'sofia', 'ben']

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 3
export const easeInOut = (u: number) => {
  const x = clamp01(u)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}
const fadeIn = (t: number, a: number, d: number) => easeOut((t - a) / d)
const fadeOut = (t: number, a: number, d: number) => 1 - easeOut((t - a) / d)

/** Deterministic pseudo-random numbers (fixed seeds). */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let r = Math.imul(s ^ (s >>> 15), 1 | s)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

interface Keys {
  at: number[]
  end: number
}
/** Keystroke times: an uneven rhythm, short pauses after words and phrases. */
function typing(text: string, start: number, seed: number, base = 0.041): Keys {
  const r = rng(seed)
  const at: number[] = []
  let t = start
  for (const ch of text) {
    at.push(t)
    t += base + (r() - 0.5) * 0.024
    if (ch === ' ') t += 0.035 + r() * 0.04
    if (/[.,:]/.test(ch)) t += 0.14
  }
  return { at, end: t }
}
const typed = (k: Keys, t: number) => {
  let n = 0
  while (n < k.at.length && (k.at[n] ?? Infinity) <= t) n++
  return n
}

/** A streamed answer: groups of one to three words. */
interface Stream {
  cuts: { at: number; len: number }[]
  end: number
}
function stream(text: string, start: number, seed: number): Stream {
  const r = rng(seed)
  const words = text.split(/(?<= )/)
  const cuts: { at: number; len: number }[] = []
  let t = start
  let len = 0
  let i = 0
  while (i < words.length) {
    const n = Math.min(words.length - i, 1 + Math.floor(r() * 3))
    for (let k = 0; k < n; k++) len += words[i + k]?.length ?? 0
    i += n
    cuts.push({ at: t, len })
    t += 0.095 + r() * 0.07 + (/[,.:]\s*$/.test(words[i - 1] ?? '') ? 0.15 : 0)
  }
  return { cuts, end: t }
}
const streamed = (s: Stream, t: number) => {
  let len = 0
  for (const c of s.cuts) if (c.at <= t) len = c.len
  return len
}

export type SlotId =
  | 'intro'
  | 'gc'
  | 'vik'
  | 'rk'
  | 'ai1'
  | 'wbH'
  | 'wbP'
  | 'spH'
  | 'spP'
  | 'bdH'
  | 'bdP'
export const SLOTS: SlotId[] = [
  'intro',
  'gc',
  'vik',
  'rk',
  'ai1',
  'wbH',
  'wbP',
  'spH',
  'spP',
  'bdH',
  'bdP',
]

export interface Edit {
  who: Who
  slot: SlotId
  /** The person clicks there: their caret shows. */
  arrive: number
  /** A replacement: the words [from, to) of the text before are selected, then typed over. */
  select?: { from: number; to: number; at: number; del: number }
  /** Where the typing goes in the text before the edit. */
  pos: number
  text: string
  keys: Keys
  end: number
  before: string
}

/** A mouse click: where the caret will stand in a slot, or a control in the app. */
export interface Tap {
  at: number
  target: { slot: SlotId; pos: number } | { el: string }
}

/** A frame's caret of one person. */
export interface CaretState {
  /** 0..1. */
  on: number
  slot: SlotId
  offset: number
  sel: [number, number] | null
  /** Typing right now (a local caret does not blink then). */
  busy: boolean
  /** Inside an edit (from the click to just after the last key): the note keeps it in view. */
  active: boolean
}

export interface Frame {
  slots: Record<SlotId, string>
  sections: { wb: [boolean, boolean]; sp: [boolean, boolean]; bd: [boolean, boolean] }
  checks: [number, number]
  edited: string
  editedOn: number
  /** The assistant's block in the note: 0 closed → 1 open. */
  insert: number
  carets: Record<Who, CaretState>
  input: string
  inputCaret: boolean
  placeholder: number
  sendDown: boolean
  ask: [number, number]
  busy: [number, number]
  done: [number, number]
  spin: number
  a1p1: string
  a1p2: string
  a1cards: [number, number, number]
  a2intro: string
  a2items: string[]
  a2card: number
  button: number
  buttonDown: boolean
  added: number
  /** The changing parts fade out at the end of the loop and come back as they started. */
  content: number
}

/** The part of `from` after what it shares with `to`, cut at a word: what gets typed over. */
function difference(from: string, to: string) {
  let n = 0
  while (n < from.length && n < to.length && from[n] === to[n]) n++
  n = from.lastIndexOf(' ', n - 1) + 1
  return { find: from.slice(n), to: to.slice(n) }
}

export function buildTimeline(c: Copy) {
  const stop = (i: number) => c.stops[i] ?? { place: '', text: '', find: '', to: '', append: '' }
  const item0 = c.assistant.items[0] ?? ''
  const initial: Record<SlotId, string> = {
    intro: c.intro,
    gc: stop(1).text,
    vik: stop(2).text,
    rk: stop(3).text,
    ai1: item0,
    wbH: '',
    wbP: '',
    spH: '',
    spP: '',
    bdH: '',
    bdP: '',
  }
  const edits: Edit[] = []
  const now: Record<SlotId, string> = { ...initial }
  let seed = 101

  /** Select `find`, a pause, then type `to` over it. */
  const replace = (
    who: Who,
    slot: SlotId,
    find: string,
    to: string,
    arrive: number,
    hold = 0.52,
    base = 0.041,
  ) => {
    const before = now[slot]
    const from = before.indexOf(find)
    if (from < 0) throw new Error(`hero: “${find}” is not in ${slot}`)
    const at = arrive + 0.05
    const select = { from, to: from + find.length, at, del: at + hold }
    const keys = typing(to, select.del + 0.1, seed++, base)
    const e: Edit = { who, slot, arrive, select, pos: from, text: to, keys, end: keys.end, before }
    now[slot] = before.slice(0, from) + to + before.slice(select.to)
    edits.push(e)
    return e
  }
  /** Click at `pos` (or the end) and type. */
  const insert = (
    who: Who,
    slot: SlotId,
    text: string,
    arrive: number,
    pos: number | 'end' = 'end',
    base = 0.041,
  ) => {
    const before = now[slot]
    const p = pos === 'end' ? before.length : pos
    const keys = typing(text, arrive + 0.16, seed++, base)
    const e: Edit = { who, slot, arrive, pos: p, text, keys, end: keys.end, before }
    now[slot] = before.slice(0, p) + text + before.slice(p)
    edits.push(e)
    return e
  }
  const textAt = (slot: SlotId, t: number) => {
    let text = initial[slot]
    for (const e of edits) {
      if (e.slot !== slot || t < e.arrive) continue
      const n = typed(e.keys, t)
      if (e.select) {
        text =
          t < e.select.del
            ? e.before
            : e.before.slice(0, e.select.from) + e.text.slice(0, n) + e.before.slice(e.select.to)
      } else text = e.before.slice(0, e.pos) + e.text.slice(0, n) + e.before.slice(e.pos)
    }
    return text
  }

  /* ── Schedule (the prototype's) ─────────────────────────────────────── */
  const SEND1 = 0.5
  const a1 = (() => {
    const busy = SEND1 + 0.18
    const found = busy + 0.9
    const p1 = stream(c.assistant.p1, found + 0.15, 21)
    const cards = p1.end + 0.1
    const p2 = stream(c.assistant.p2, cards + 0.5, 23)
    return { busy, found, p1, cards, p2, end: p2.end }
  })()
  const vik = stop(2)
  const sofiaVik = replace('sofia', 'vik', vik.find, vik.to, 0.2, 0.52, 0.06)
  const sofiaVik2 = insert('sofia', 'vik', vik.append, sofiaVik.end + 0.32, 'end', 0.04)
  const gc = stop(1)
  const benGc = replace('ben', 'gc', gc.find, gc.to, 0.8, 0.54, 0.044)
  const intro = difference(c.intro, c.introTo)
  const alexIntro = replace('alex', 'intro', intro.find, intro.to, 1.3, 0.62, 0.037)
  const benWbH = insert('ben', 'wbH', c.weather.heading, benGc.end + 0.45, 'end', 0.05)
  const benWbP = insert('ben', 'wbP', c.weather.text, benWbH.end + 0.28, 'end', 0.039)
  const CHECK_CARS = sofiaVik2.end + 0.42
  const CHECK_NIGHT = Math.max(CHECK_CARS + 1.5, 6.9)
  const rk = stop(3)
  const sofiaRk = replace('sofia', 'rk', rk.find, rk.to, CHECK_NIGHT + 0.6, 0.48, 0.04)
  const Q2_CLICK = Math.max(a1.end + 0.6, alexIntro.end + 0.5, 8.6)
  const q2Keys = typing(c.assistant.q2, Q2_CLICK + 0.18, 31, 0.036)
  const SEND2 = q2Keys.end + 0.04
  const a2 = (() => {
    const busy = SEND2 + 0.18
    const ready = busy + 0.9
    const introS = stream(c.assistant.intro, ready + 0.15, 41)
    const items: Stream[] = []
    let t = introS.end + 0.1
    c.assistant.items.forEach((text, i) => {
      const s = stream(text, t, 43 + i)
      items.push(s)
      t = s.end + 0.08
    })
    const card = t + 0.12
    return { busy, ready, intro: introS, items, card, button: card + 0.3 }
  })()
  const sofiaSpH = insert(
    'sofia',
    'spH',
    c.packing.heading,
    Math.max(sofiaRk.end + 0.45, 11.1),
    'end',
    0.05,
  )
  const sofiaSpP = insert('sofia', 'spP', c.packing.text, sofiaSpH.end + 0.28, 'end', 0.04)
  const benFix = replace(
    'ben',
    'wbP',
    c.weather.find,
    c.weather.to,
    Math.max(benWbP.end + 2.6, 13.9),
    0.58,
    0.05,
  )
  const ADD_CLICK = a2.button + 1.25
  const ADDED = ADD_CLICK + 0.12
  const INSERT = ADDED + 0.04
  const INSERT_DUR = 0.28
  // Alex adds to the first item, before its final full stop.
  const alexAi1 = insert(
    'alex',
    'ai1',
    c.checklist.insert,
    INSERT + 0.95,
    item0.endsWith('.') ? item0.length - 1 : 'end',
    0.04,
  )
  const alexBdH = insert('alex', 'bdH', c.booking.heading, alexAi1.end + 0.6, 'end', 0.048)
  const alexBdP = insert('alex', 'bdP', c.booking.text, alexBdH.end + 0.28, 'end', 0.039)

  const FINAL = alexBdP.end
  /** Everything has settled: the loop fades out and starts again. */
  const LOOP_OUT = FINAL + 1.3
  const DURATION = LOOP_OUT + 0.45
  const LOOP_SWAP = DURATION - 0.25

  /** When each person's caret goes after their last edit. */
  const CALM: Record<Who, number> = { ben: benFix.end + 1, sofia: sofiaSpP.end + 1, alex: Infinity }

  /*
   * Mouse clicks, for the pointers (render.ts): where the caret will stand in the note, or a
   * control (`data-h`). A paragraph under a heading just typed is reached with Enter: no click.
   */
  const caretAt = (e: Edit): Tap['target'] => ({
    slot: e.slot,
    pos: e.select ? e.select.to : e.pos,
  })
  const taps: Record<Who, Tap[]> = {
    alex: [
      { at: SEND1, target: { el: 'send' } },
      { at: alexIntro.arrive, target: caretAt(alexIntro) },
      { at: Q2_CLICK, target: { el: 'input' } },
      { at: ADD_CLICK, target: { el: 'add' } },
      { at: alexAi1.arrive, target: caretAt(alexAi1) },
      { at: alexBdH.arrive, target: caretAt(alexBdH) },
    ],
    sofia: [
      { at: sofiaVik.arrive, target: caretAt(sofiaVik) },
      { at: sofiaVik2.arrive, target: caretAt(sofiaVik2) },
      { at: CHECK_CARS, target: { el: 'check0' } },
      { at: CHECK_NIGHT, target: { el: 'check1' } },
      { at: sofiaRk.arrive, target: caretAt(sofiaRk) },
      { at: sofiaSpH.arrive, target: caretAt(sofiaSpH) },
    ],
    ben: [
      { at: benGc.arrive, target: caretAt(benGc) },
      { at: benWbH.arrive, target: caretAt(benWbH) },
      { at: benFix.arrive, target: caretAt(benFix) },
    ],
  }

  /* ── What each person does, in order: edits, or a click elsewhere (no caret in the note). ── */
  interface Act {
    at: number
    edit?: Edit
  }
  const acts: Record<Who, Act[]> = {
    alex: [
      { at: 0 },
      { at: alexIntro.arrive, edit: alexIntro },
      { at: Q2_CLICK },
      { at: ADD_CLICK },
      { at: alexAi1.arrive, edit: alexAi1 },
      { at: alexBdH.arrive, edit: alexBdH },
      { at: alexBdP.arrive, edit: alexBdP },
    ],
    sofia: [
      { at: sofiaVik.arrive, edit: sofiaVik },
      { at: sofiaVik2.arrive, edit: sofiaVik2 },
      { at: CHECK_CARS },
      { at: CHECK_NIGHT },
      { at: sofiaRk.arrive, edit: sofiaRk },
      { at: sofiaSpH.arrive, edit: sofiaSpH },
      { at: sofiaSpP.arrive, edit: sofiaSpP },
    ],
    ben: [
      { at: benGc.arrive, edit: benGc },
      { at: benWbH.arrive, edit: benWbH },
      { at: benWbP.arrive, edit: benWbP },
      { at: benFix.arrive, edit: benFix },
    ],
  }

  const caretOf = (who: Who, t: number): CaretState => {
    const list = acts[who]
    let i = -1
    for (let k = 0; k < list.length; k++) if ((list[k]?.at ?? Infinity) <= t) i = k
    const cur = list[i]
    const next = list[i + 1]
    const none: CaretState = {
      on: 0,
      slot: 'intro',
      offset: 0,
      sel: null,
      busy: false,
      active: false,
    }
    const e = cur?.edit
    if (!cur || !e) return none
    let offset: number
    let sel: [number, number] | null = null
    if (e.select && t < e.select.del) {
      offset = e.select.to
      if (t >= e.select.at) sel = [e.select.from, e.select.to]
    } else offset = e.pos + typed(e.keys, t)
    // A caret never jumps: it fades out before its person clicks somewhere else and fades in there.
    const leave = next ? fadeOut(t, next.at - 0.12, 0.1) : 1
    const on = fadeIn(t, cur.at, 0.1) * fadeOut(t, CALM[who], 0.3) * leave
    const n = typed(e.keys, t)
    const last = n > 0 ? (e.keys.at[n - 1] ?? -1) : -1
    return {
      on,
      slot: e.slot,
      offset,
      sel,
      busy: t >= e.arrive && t < e.end + 0.1 && t - last < 0.5,
      active: t <= e.end + 0.25,
    }
  }

  const EDITED: [number, string][] = [
    [0, c.edited[0] ?? ''],
    [sofiaVik.select?.del ?? 0, c.edited[1] ?? ''],
    [benGc.select?.del ?? 0, c.edited[2] ?? ''],
    [alexIntro.select?.del ?? 0, c.edited[3] ?? ''],
  ]

  const frameAt = (time: number): Frame => {
    const reset = time >= LOOP_SWAP
    const t = reset ? 0 : time
    const content = reset
      ? clamp01((time - LOOP_SWAP) / (DURATION - LOOP_SWAP))
      : time >= LOOP_OUT
        ? fadeOut(time, LOOP_OUT, 0.2)
        : 1
    const slots = {} as Record<SlotId, string>
    for (const k of SLOTS) slots[k] = textAt(k, t)

    let edited = EDITED[0]?.[1] ?? ''
    let editedOn = 1
    for (const [at, label] of EDITED) {
      if (t >= at) edited = label
      if (at > 0 && t >= at - 0.12 && t < at + 0.15)
        editedOn = t < at ? fadeOut(t, at - 0.12, 0.12) : fadeIn(t, at, 0.15)
    }

    const q2n = typed(q2Keys, t)
    const input =
      t < SEND1 ? c.assistant.q1 : t >= Q2_CLICK && t < SEND2 ? c.assistant.q2.slice(0, q2n) : ''
    const focused = t < SEND1 || (t >= Q2_CLICK && t < SEND2)
    const lastKey = t < SEND1 ? -0.1 : q2n > 0 ? (q2Keys.at[q2n - 1] ?? 0) : Q2_CLICK
    const inputCaret =
      focused && (t - lastKey < 0.5 || Math.floor((t - lastKey - 0.5) / 0.53) % 2 === 1)
    const placeholder = input.length
      ? 0
      : t >= SEND2
        ? fadeIn(t, SEND2 + 0.04, 0.15)
        : t >= SEND1 && t < Q2_CLICK
          ? fadeIn(t, SEND1 + 0.04, 0.15)
          : 1

    return {
      slots,
      sections: {
        wb: [t >= benWbH.arrive, t >= benWbP.arrive],
        sp: [t >= sofiaSpH.arrive, t >= sofiaSpP.arrive],
        bd: [t >= alexBdH.arrive, t >= alexBdP.arrive],
      },
      checks: [
        t < CHECK_CARS ? 0 : fadeIn(t, CHECK_CARS, 0.15),
        t < CHECK_NIGHT ? 0 : fadeIn(t, CHECK_NIGHT, 0.15),
      ],
      edited,
      editedOn,
      insert: t < INSERT ? 0 : clamp01((t - INSERT) / INSERT_DUR),
      carets: { alex: caretOf('alex', t), sofia: caretOf('sofia', t), ben: caretOf('ben', t) },
      input,
      inputCaret,
      placeholder,
      sendDown: t >= SEND1 - 0.02 && t < SEND1 + 0.12,
      ask: [
        t < SEND1 + 0.06 ? 0 : fadeIn(t, SEND1 + 0.06, 0.22),
        t < SEND2 + 0.06 ? 0 : fadeIn(t, SEND2 + 0.06, 0.22),
      ],
      busy: [
        t < a1.busy ? 0 : fadeIn(t, a1.busy, 0.15) * fadeOut(t, a1.found - 0.06, 0.15),
        t < a2.busy ? 0 : fadeIn(t, a2.busy, 0.15) * fadeOut(t, a2.ready - 0.06, 0.15),
      ],
      done: [
        t < a1.found ? 0 : fadeIn(t, a1.found, 0.15),
        t < a2.ready ? 0 : fadeIn(t, a2.ready, 0.15),
      ],
      spin: ((t * 360) / 0.9) % 360,
      a1p1: c.assistant.p1.slice(0, streamed(a1.p1, t)),
      a1p2: c.assistant.p2.slice(0, streamed(a1.p2, t)),
      a1cards: [0, 0.07, 0.12].map((d) =>
        t < a1.cards + d ? 0 : fadeIn(t, a1.cards + d, 0.25),
      ) as [number, number, number],
      a2intro: c.assistant.intro.slice(0, streamed(a2.intro, t)),
      a2items: c.assistant.items.map((text, i) => {
        const s = a2.items[i]
        return s ? text.slice(0, streamed(s, t)) : ''
      }),
      a2card: t < a2.card ? 0 : fadeIn(t, a2.card, 0.25),
      button: t < a2.button ? 0 : fadeIn(t, a2.button, 0.2),
      buttonDown: t >= ADD_CLICK - 0.02 && t < ADD_CLICK + 0.12,
      added: t < ADDED ? 0 : fadeIn(t, ADDED, 0.15),
      content,
    }
  }

  return { frameAt, taps, DURATION, LOOP_OUT, LOOP_SWAP, INSERT }
}

export type Timeline = ReturnType<typeof buildTimeline>
