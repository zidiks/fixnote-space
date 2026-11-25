/* ──────────────────────────────────────────────────────────────────────────
 * "Your notes, one prompt away." — one loop (~12.97 s at 60 fps).
 *
 *  0.00–0.40  Fixnote: "Market Opportunity" with intro + draft section
 *  0.40–1.00  Claude window enters (opacity 0 → 1, translateY +2% → 0)
 *  1.20–2.80  prompt 1 typed (deterministic rhythm, caret)
 *  3.05       send pressed; 3.17 bubble 1
 *  3.42–4.12  Claude spark thinks (rotation + breathing)
 *  4.12–4.82  reply 1 streams by words; actions 4.82–5.02
 *  4.12–4.47  draft section drag-selected line by line
 *  4.62–4.76  selection deleted
 *  4.82–7.42  new "Key market insights" written in its place
 *  5.12–      prompt 2 typed while note is still being written
 *  7.50       send pressed; 7.62 bubble 2, chat scrolls up
 *  7.87–8.57  thinking; 8.57–9.27 reply 2; actions 9.27–9.47
 *  8.57–11.07 pass 2 written; note scrolls softly to keep it in view
 * 11.07–12.57 hold final composition
 * 12.57–12.97 Claude leaves, written sections fade out, draft fades back
 * ────────────────────────────────────────────────────────────────────────── */

export interface NoteBlock {
  kind: 'p' | 'h2' | 'h3' | 'desc'
  text: string
  pass: 0 | 1 | 2
  group: 'intro' | 's1' | 's2'
  item?: number
}

export interface ExchangeCopy {
  prompt: string
  reply: string
}

export interface OnePromptCopy {
  note: readonly NoteBlock[]
  exchanges: readonly ExchangeCopy[]
}

export type Bezier = [number, number, number, number]
export const SETTLE: Bezier = [0.22, 0.61, 0.36, 1]
const INOUT: Bezier = [0.45, 0, 0.25, 1]

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function bezier([x1, y1, x2, y2]: Bezier) {
  const cx = (u: number) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3
  const cy = (u: number) => 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2
      if (cx(m) < x) lo = m
      else hi = m
    }
    return cy((lo + hi) / 2)
  }
}

export const settle = bezier(SETTLE)
export const inout = bezier(INOUT)
export const span = (t: number, [a, b]: readonly [number, number], ease = settle) =>
  ease(clamp01((t - a) / (b - a)))

export interface Step {
  t: number
  v: number
}

export function stepped(steps: readonly Step[], t: number, d: number, ease = inout) {
  if (!steps.length) return 0
  let v = steps[0]?.v ?? 0
  for (let i = 1; i < steps.length; i++) {
    const s = steps[i]
    const prev = steps[i - 1]
    if (!s || !prev || t <= s.t) break
    v += (s.v - prev.v) * ease(clamp01((t - s.t) / d))
  }
  return v
}

export const D = {
  bubble: 0.25,
  bubbleY: 8,
  actions: 0.2,
  press: 0.12,
  word: 0.22,
  wordY: 2,
  sparkFade: 0.18,
  scroll: 0.6,
  grow: 0.14,
  follow: 0.18,
  windowY: 0.02,
} as const

export function tokens(text: string) {
  return text.split(/( |\n)/).filter((w) => w && w !== ' ')
}

const JITTER = [
  1.0, 0.72, 1.18, 0.86, 1.32, 0.94, 0.78, 1.1, 1.24, 0.82, 0.98, 1.4, 0.76, 1.06, 0.9, 1.16,
]
const AFTER_SPACE = 1.5
const AFTER_PUNCT = 3.2
const TYPE1_DURATION = 1.6
const NOTE_CHUNKS = [2, 3, 2, 1, 3, 2, 4, 2, 3, 1, 2, 3]
const REPLY_CHUNKS = [2, 1, 2, 3, 1, 2]

function typingUnits(text: string) {
  const gaps: number[] = [0]
  for (let i = 1; i < text.length; i++) {
    const prev = text[i - 1] ?? ''
    let u = JITTER[i % JITTER.length] ?? 1
    if (prev === ' ') u += AFTER_SPACE
    else if (/[.,:;!?]/.test(prev)) u += AFTER_PUNCT
    gaps.push(u)
  }
  return gaps
}

function streamTimes(blocks: string[][], [a, b]: readonly [number, number], chunks: number[]) {
  const words = blocks.map((ws) => ws.filter((w) => w !== '\n').length)
  const plan: { block: number; size: number; pause: number }[] = []
  let c = 0
  words.forEach((n, block) => {
    let left = n
    let first = true
    while (left > 0) {
      const size = Math.min(left, chunks[c++ % chunks.length] ?? 2)
      plan.push({ block, size, pause: first && block > 0 ? 1 : 0 })
      left -= size
      first = false
    }
  })
  const beats = plan.reduce((s, p) => s + 1 + p.pause, 0) - 1
  const beat = (b - a - D.word) / Math.max(1, beats)
  const out: number[][] = words.map(() => [])
  let at = a - beat
  for (const p of plan) {
    at += beat * (1 + p.pause)
    const bucket = out[p.block]
    if (bucket) {
      for (let i = 0; i < p.size; i++) bucket.push(at)
    }
  }
  return out
}

export interface ExchangeTiming {
  type: number
  chars: number[]
  press: number
  send: number
  think: readonly [number, number]
  reply: readonly [number, number]
  write: readonly [number, number]
}

export interface OnePromptTimeline {
  duration: number
  stillTime: number
  t: {
    windowIn: readonly [number, number]
    exit: readonly [number, number]
    hold: readonly [number, number]
    ex: readonly [ExchangeTiming, ExchangeTiming]
    select: readonly [number, number]
    del: readonly [number, number]
    edited: readonly [number, number]
  }
  noteWordTimes: readonly (readonly number[])[]
  replyWordTimes: readonly (readonly number[])[]
}

export function createTimeline(copy: OnePromptCopy): OnePromptTimeline {
  const units = copy.exchanges.map((e) => typingUnits(e.prompt))
  const total0 = (units[0] ?? [0]).reduce((a, b) => a + b, 0) || 1
  const secPerUnit = TYPE1_DURATION / total0
  const typingTimes = (gaps: number[], start: number) => {
    let at = start
    return gaps.map((g) => {
      at += g * secPerUnit
      return at
    })
  }

  const windowIn: [number, number] = [0.4, 1.0]
  const type1 = 1.2
  const char1 = typingTimes(units[0] ?? [0], type1)
  const press1 = (char1[char1.length - 1] ?? type1) + 0.25
  const send1 = press1 + 0.12
  const think1: [number, number] = [send1 + 0.25, send1 + 0.95]
  const reply1: [number, number] = [think1[1], think1[1] + 0.7]
  const select: [number, number] = [reply1[0], reply1[0] + 0.35]
  const del: [number, number] = [select[1] + 0.15, select[1] + 0.29]
  const write1: [number, number] = [del[1] + 0.06, del[1] + 0.06 + 2.6]
  const type2 = select[0] + 1.0
  const char2 = typingTimes(units[1] ?? [0], type2)
  const send2 = Math.max(write1[1] + 0.2, (char2[char2.length - 1] ?? type2) + 0.37)
  const press2 = send2 - 0.12
  const think2: [number, number] = [send2 + 0.25, send2 + 0.95]
  const reply2: [number, number] = [think2[1], think2[1] + 0.7]
  const write2: [number, number] = [reply2[0], reply2[0] + 2.5]
  const hold: [number, number] = [write2[1], write2[1] + 1.5]
  const exit: [number, number] = [hold[1], hold[1] + 0.4]

  const ex: [ExchangeTiming, ExchangeTiming] = [
    { type: type1, chars: char1, press: press1, send: send1, think: think1, reply: reply1, write: write1 },
    { type: type2, chars: char2, press: press2, send: send2, think: think2, reply: reply2, write: write2 },
  ]

  const noteTokens = copy.note.map((b) => tokens(b.text))
  const noteWordTimes: number[][] = copy.note.map(() => [])
  for (const n of [1, 2] as const) {
    const ids = copy.note.map((b, i) => (b.pass === n ? i : -1)).filter((i) => i >= 0)
    const times = streamTimes(
      ids.map((i) => noteTokens[i] ?? []),
      n === 1 ? write1 : write2,
      NOTE_CHUNKS,
    )
    ids.forEach((id, k) => {
      noteWordTimes[id] = times[k] ?? []
    })
  }

  const replyWordTimes = copy.exchanges.map((e, i) => {
    const spanReply = ex[i]?.reply ?? reply1
    return streamTimes([tokens(e.reply)], spanReply, REPLY_CHUNKS)[0] ?? []
  })

  return {
    duration: Math.round(exit[1] * 1000) / 1000,
    stillTime: Math.round((hold[0] + 0.7) * 100) / 100,
    t: {
      windowIn,
      exit,
      hold,
      ex,
      select,
      del,
      edited: [select[0], select[0] + 0.2],
    },
    noteWordTimes,
    replyWordTimes,
  }
}

export const wordIn = (t: number, at: number) => settle(clamp01((t - at) / D.word))

export function typed(t: number, chars: readonly number[]) {
  let n = 0
  while (n < chars.length && (chars[n] ?? Number.POSITIVE_INFINITY) <= t) n++
  return n
}

export const pressAt = (t: number, at: number, d = D.press) =>
  t >= at && t < at + d ? Math.sin((Math.PI * (t - at)) / d) : 0
