import {
  clamp01,
  createTimeline,
  D,
  inout,
  type OnePromptCopy,
  pressAt,
  type Step,
  settle,
  span,
  stepped,
  typed,
  wordIn,
} from './timeline'

export interface OnePromptAwayRenderer {
  duration: number
  stillTime: number
  render(t: number, still?: boolean): void
  measure(): void
  dispose(): void
}

const LINE_INPUT = 22.4
const LINE_REPLY = 25.6
const INPUT_H = 56
const CLAUDE_H = 624
/** Note viewport: content top → main bottom (796 − 92 − 32 px). */
const NOTE_VISIBLE = 672
const NOTE_MARGIN = 24
/** Chat: content must stay above the input (top at 544 in the window). */
const CHAT_BOTTOM = CLAUDE_H - 24 - INPUT_H - 16
const SPARK = 28
const ACTIONS_H = 50
const NEG = -1e9

export function onePromptAwayRenderer(
  root: HTMLElement,
  copy: OnePromptCopy,
): OnePromptAwayRenderer {
  const tl = createTimeline(copy)
  const T = tl.t

  const $ = (n: string) => {
    const el = root.querySelector<HTMLElement>(`[data-a="${n}"]`)
    if (!el) throw new Error(`OnePromptAway: missing [data-a="${n}"]`)
    return el
  }
  const $$ = (n: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-a="${n}"]`))

  const ex = copy.exchanges.map((_, i) => ({
    bubble: $(`bubble${i}`),
    reply: $(`reply${i}`),
    replyText: $(`replyText${i}`),
    words: $$(`rw${i}`),
    actions: $(`actions${i}`),
    spark: $(`spark${i}`),
    sparkImg: $(`sparkImg${i}`),
    prompt: $(`prompt${i}`),
    chars: $$(`ch${i}`),
  }))

  const el = {
    claude: $('claude'),
    chatScroll: $('chatScroll'),
    input: $('input'),
    placeholder: $('placeholder'),
    caret: $('caret'),
    send: $('send'),
    noteScroll: $('noteScroll'),
    fresh: $('fresh'),
    more: $('more'),
    draft: $('draft'),
    selLayer: $('selLayer'),
    draftText: $$('draftText'),
    noteWords: $$('nw'),
    blocks: tl.noteWordTimes.map((_, i) => $(`nb${i}`)),
    edited: [$('edited0'), $('edited1')] as const,
  }
  const noteTimes = tl.noteWordTimes.flat()

  const cache = new Map<HTMLElement, Record<string, string>>()
  const set = (node: HTMLElement, prop: string, value: string) => {
    let c = cache.get(node)
    if (!c) {
      c = {}
      cache.set(node, c)
    }
    if (c[prop] === value) return
    c[prop] = value
    node.style.setProperty(prop, value)
  }
  const op = (node: HTMLElement, v: number) =>
    set(node, 'opacity', v <= 0 ? '0' : v >= 1 ? '1' : v.toFixed(3))
  const ty = (node: HTMLElement, y: number) =>
    set(node, 'transform', Math.abs(y) < 0.005 ? 'none' : `translateY(${y.toFixed(2)}px)`)

  interface Measured {
    caret: { x: number; y: number }[][]
    inputSteps: Step[]
    chatSteps: Step[]
    sparkSteps: Step[][]
    noteSteps: Step[]
  }
  let selLines: HTMLElement[] = []
  let m: Measured = { caret: [[{ x: -1, y: 0 }]], inputSteps: [], chatSteps: [], sparkSteps: [], noteSteps: [] }

  const measure = () => {
    for (const n of [el.chatScroll, el.noteScroll, el.claude]) n.style.transform = 'none'
    cache.clear()
    const box = root.getBoundingClientRect()
    const k = box.width / root.offsetWidth || 1
    const rel = (r: DOMRect, origin: DOMRect) => ({
      left: (r.left - origin.left) / k,
      top: (r.top - origin.top) / k,
      right: (r.right - origin.left) / k,
      bottom: (r.bottom - origin.top) / k,
    })

    const caret: Measured['caret'] = []
    const inputSteps: Step[] = [{ t: NEG, v: INPUT_H }]
    ex.forEach((x, i) => {
      const origin = x.prompt.getBoundingClientRect()
      const pos = [{ x: -1, y: 0 }]
      const exT = T.ex[i]
      let lastLine = 0
      x.chars.forEach((c, j) => {
        const r = rel(c.getBoundingClientRect(), origin)
        const line = Math.round(r.top / LINE_INPUT)
        pos.push({ x: r.right, y: line * LINE_INPUT })
        if (line !== lastLine && exT) {
          inputSteps.push({ t: exT.chars[j] ?? exT.type, v: INPUT_H + line * LINE_INPUT })
          lastLine = line
        }
      })
      caret.push(pos)
      if (exT) inputSteps.push({ t: exT.send, v: INPUT_H })
    })

    const chatOrigin = el.chatScroll.getBoundingClientRect()
    const live: Step[] = []
    const sparkSteps: Step[][] = []
    ex.forEach((x, i) => {
      const exT = T.ex[i]
      if (!exT) return
      const bubble = rel(x.bubble.getBoundingClientRect(), chatOrigin)
      const reply = rel(x.replyText.getBoundingClientRect(), chatOrigin)
      const textH = reply.bottom - reply.top
      const { send, reply: rs } = exT
      live.push({ t: send, v: Math.max(bubble.bottom, reply.top + SPARK) })
      const steps: Step[] = [{ t: NEG, v: reply.top }]
      let lastLine = -1
      const replyTimes = tl.replyWordTimes[i] ?? []
      x.words.forEach((w, j) => {
        const line = Math.round((rel(w.getBoundingClientRect(), chatOrigin).top - reply.top) / LINE_REPLY)
        if (line > lastLine) {
          const at = replyTimes[j] ?? rs[0]
          steps.push({ t: at, v: reply.top + (line + 1) * LINE_REPLY })
          live.push({ t: at, v: reply.top + (line + 1) * LINE_REPLY + SPARK })
          lastLine = line
        }
      })
      steps.push({ t: rs[1], v: reply.top + textH + ACTIONS_H })
      live.push({ t: rs[1], v: reply.top + textH + ACTIONS_H + SPARK })
      sparkSteps.push(steps)
    })
    const chatSteps: Step[] = [{ t: NEG, v: 0 }]
    for (const s of live) {
      const lastV = chatSteps[chatSteps.length - 1]?.v ?? 0
      const need = Math.max(lastV, s.v - CHAT_BOTTOM)
      if (need > lastV + 0.5) chatSteps.push({ t: s.t, v: need })
    }

    const noteOrigin = el.noteScroll.getBoundingClientRect()
    const noteSteps: Step[] = [{ t: NEG, v: 0 }]
    const firstChild = el.noteScroll.firstElementChild
    const titleClear = firstChild ? rel(firstChild.getBoundingClientRect(), noteOrigin).bottom + 32 : 0
    el.blocks.forEach((b, i) => {
      const times = tl.noteWordTimes[i]
      if (!times?.length) return
      const bottom = rel(b.getBoundingClientRect(), noteOrigin).bottom
      const lastV = noteSteps[noteSteps.length - 1]?.v ?? 0
      let need = Math.max(lastV, bottom + NOTE_MARGIN - NOTE_VISIBLE)
      if (need > 0) need = Math.max(need, titleClear)
      if (need > lastV + 0.5) noteSteps.push({ t: times[0] ?? 0, v: need })
    })

    const draftOrigin = el.draft.getBoundingClientRect()
    const range = document.createRange()
    for (const old of selLines) old.remove()
    selLines = []
    for (const p of el.draftText) {
      const lh = Number.parseFloat(getComputedStyle(p).lineHeight) || 24
      const top = rel(p.getBoundingClientRect(), draftOrigin).top
      range.selectNodeContents(p)
      const lines = new Map<number, { l: number; r: number }>()
      for (const r of Array.from(range.getClientRects())) {
        const q = rel(r, draftOrigin)
        if (q.right - q.left < 0.5) continue
        const line = Math.floor(((q.top + q.bottom) / 2 - top) / lh)
        const cur = lines.get(line)
        lines.set(
          line,
          cur ? { l: Math.min(cur.l, q.left), r: Math.max(cur.r, q.right) } : { l: q.left, r: q.right },
        )
      }
      for (const [line, { l, r }] of [...lines].sort((a, b) => a[0] - b[0])) {
        const d = document.createElement('div')
        d.className = 'opa-sel-line'
        Object.assign(d.style, {
          left: `${l - 2}px`,
          top: `${top + line * lh}px`,
          width: `${r - l + 4}px`,
          height: `${lh}px`,
        })
        el.selLayer.appendChild(d)
        selLines.push(d)
      }
    }

    m = { caret, inputSteps, chatSteps, sparkSteps, noteSteps }
  }
  measure()

  const blink = (t: number, from: number, to: number) => {
    if (t < from || t >= to) return 1
    const p = ((t - from) % 1.06) / 1.06
    const edge = 0.06
    if (p < 0.5 - edge) return 1
    if (p < 0.5) return 1 - (p - (0.5 - edge)) / edge
    if (p < 1 - edge) return 0
    return (p - (1 - edge)) / edge
  }

  const render = (time: number, still = false) => {
    const t = time >= tl.duration - 1e-9 || time < 0 ? 0 : time
    const exit = span(t, T.exit, inout)

    const enter = span(t, T.windowIn)
    const lift = CLAUDE_H * D.windowY
    op(el.claude, enter * (1 - exit))
    ty(el.claude, lift * (1 - enter) + lift * exit)

    const [e0, e1] = T.ex
    const active: number = t < e0.send ? 0 : t >= e1.type && t < e1.send ? 1 : -1
    const n = active === 0 ? typed(t, e0.chars) : active === 1 ? typed(t, e1.chars) : 0
    ex.forEach((x, i) => {
      const shown = i === active ? n : 0
      x.chars.forEach((c, j) => {
        op(c, j < shown ? 1 : 0)
      })
    })
    op(el.placeholder, n === 0 ? 1 : 0)
    const caretRow = active >= 0 ? m.caret[active] : m.caret[0]
    const c = caretRow?.[active >= 0 ? n : 0] ?? { x: -1, y: 0 }
    set(el.caret, 'transform', `translate(${(c.x + 1).toFixed(2)}px, ${c.y.toFixed(2)}px)`)
    const lastKey1 = e1.chars[e1.chars.length - 1] ?? e1.type
    const caretOn = Math.min(blink(t, e0.send + 0.5, e1.type), blink(t, lastKey1 + 0.5, e1.send))
    op(el.caret, still ? 1 : caretOn)
    set(el.input, 'height', `${stepped(m.inputSteps, t, D.grow).toFixed(2)}px`)
    const press = Math.max(pressAt(t, e0.press), pressAt(t, e1.press))
    set(el.send, 'transform', press > 0 ? `scale(${(1 - 0.08 * press).toFixed(4)})` : 'none')

    ex.forEach((x, i) => {
      const s = T.ex[i]
      if (!s) return
      const b = span(t, [s.send, s.send + D.bubble])
      op(x.bubble, b)
      ty(x.bubble, D.bubbleY * (1 - b))
      const replyTimes = tl.replyWordTimes[i] ?? []
      x.words.forEach((w, j) => {
        const v = wordIn(t, replyTimes[j] ?? s.reply[0])
        op(w, v)
        ty(w, D.wordY * (1 - v))
      })
      op(x.actions, span(t, [s.reply[1], s.reply[1] + D.actions]))
      const sIn = span(t, [s.think[0] - 0.12, s.think[0] - 0.12 + D.sparkFade])
      const sOut = i === 0 ? span(t, [e1.send, e1.send + D.sparkFade]) : 0
      op(x.spark, sIn * (1 - sOut))
      ty(x.spark, stepped(m.sparkSteps[i] ?? [], t, D.follow, settle))
      const p = clamp01((t - s.think[0]) / (s.reply[1] - s.think[0]))
      const turn = 720 * inout(p)
      const breath = 1 - 0.07 * (0.5 - 0.5 * Math.cos(4 * Math.PI * p))
      set(
        x.sparkImg,
        'transform',
        p > 0 && p < 1 ? `rotate(${turn.toFixed(2)}deg) scale(${breath.toFixed(4)})` : 'none',
      )
    })
    ty(el.chatScroll, -stepped(m.chatSteps, t, D.scroll))

    el.noteWords.forEach((w, j) => {
      const v = wordIn(t, noteTimes[j] ?? 0)
      op(w, v)
      ty(w, D.wordY * (1 - v))
    })
    op(el.fresh, 1 - exit)
    op(el.more, 1 - exit)
    ty(el.noteScroll, -stepped(m.noteSteps, t, D.scroll) * (1 - exit))

    const sweep = clamp01((t - T.select[0]) / (T.select[1] - T.select[0])) * selLines.length
    selLines.forEach((line, i) => {
      const v = t >= T.del[1] ? 0 : clamp01(sweep - i)
      set(line, 'transform', `scaleX(${v.toFixed(4)})`)
    })
    op(
      el.draft,
      t < T.exit[0]
        ? 1 - span(t, T.del, inout)
        : span(t, [T.exit[0] + 0.15, T.exit[1]], inout),
    )
    const ed = span(t, T.edited) * (1 - exit)
    op(el.edited[0], Math.max(0, 1 - 2 * ed))
    op(el.edited[1], Math.max(0, 2 * ed - 1))
  }

  return {
    duration: tl.duration,
    stillTime: tl.stillTime,
    render,
    measure,
    dispose() {
      for (const line of selLines) line.remove()
      selLines = []
      cache.clear()
    },
  }
}
