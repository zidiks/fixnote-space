import {
  buildTimeline,
  type CaretState,
  type Copy,
  easeInOut,
  type Frame,
  PEOPLE,
  SLOTS,
  type SlotId,
  type Tap,
  type Who,
} from './timeline'

/*
 * Draws the hero timeline into HeroApp.astro's markup. Carets are inline elements placed inside
 * the text at their offset, so the browser lays them out exactly at the end of what is typed; a
 * name flag hangs on its caret, on a side where it covers no text (else it waits, hidden). Only
 * scrolling and the flags' sides are measured, and only when something moved.
 */

const SAFE = 56 // px kept free under the lowest caret line
const ROOM = 64 // px of new room a scroll opens (two or three lines)
const TOP = 40 // px kept free above a caret line for its flag
const SCROLL = 0.35 // s

interface Tween {
  from: number
  to: number
  at: number
}
const tweenAt = (w: Tween, t: number) => w.from + (w.to - w.from) * easeInOut((t - w.at) / SCROLL)

type Place = 'up' | 'side' | 'upl' | 'down'
// Beside the caret where nothing follows it on the line, else above, else below.
const PLACES: Place[] = ['side', 'up', 'upl', 'down']

export function heroRenderer(root: HTMLElement, copy: Copy) {
  const tl = buildTimeline(copy)
  const $ = (name: string) => {
    const el = root.querySelector<HTMLElement>(`[data-h="${name}"]`)
    if (!el) throw new Error(`HeroApp: no [data-h="${name}"]`)
    return el
  }
  const doc = $('doc')
  const view = $('view')
  const slot = Object.fromEntries(SLOTS.map((s) => [s, $(`s-${s}`)])) as Record<SlotId, HTMLElement>
  const sections = (['wb', 'sp', 'bd'] as const).map((id) => ({
    id,
    head: $(`${id}`),
    para: $(`${id}-p`),
  }))
  const el = {
    checks: [$('check0'), $('check1')],
    edited: $('edited'),
    insert: $('insert'),
    insertIn: $('insert-in'),
    conv: $('conv'),
    messages: $('messages'),
    ask: [$('ask0'), $('ask1')],
    ans: [$('ans0'), $('ans1')],
    busy: [$('busy0'), $('busy1')],
    done: [$('done0'), $('done1')],
    spin: [$('spin0'), $('spin1')],
    a1p1: $('a1p1'),
    a1p2: $('a1p2'),
    a1cards: $('a1cards'),
    a1card: [$('a1c0'), $('a1c1'), $('a1c2')],
    a2intro: $('a2intro'),
    a2list: $('a2list'),
    a2li: [$('a2li0'), $('a2li1'), $('a2li2')],
    a2cards: $('a2cards'),
    a2card: $('a2c0'),
    a2actions: $('a2actions'),
    add: $('add'),
    addPlus: $('add-plus'),
    addCheck: $('add-check'),
    addLabel: $('add-label'),
    addedLabel: $('added-label'),
    inputPh: $('input-ph'),
    input: $('input'),
    inputText: $('input-text'),
    inputCaret: $('input-caret'),
    send: $('send'),
  }

  /* Cached writes: a property is set only when its value changes. */
  const cache = new WeakMap<HTMLElement, Record<string, string>>()
  const set = (node: HTMLElement, prop: string, value: string) => {
    let c = cache.get(node)
    if (!c) {
      c = {}
      cache.set(node, c)
    }
    if (c[prop] === value) return false
    c[prop] = value
    if (prop === 'text') node.textContent = value
    else if (prop.startsWith('data-')) {
      if (value) node.setAttribute(prop, value)
      else node.removeAttribute(prop)
    } else node.style.setProperty(prop, value)
    return true
  }
  const op = (node: HTMLElement, v: number) => set(node, 'opacity', v >= 0.999 ? '1' : v.toFixed(3))
  const show = (node: HTMLElement, on: boolean, display = '') =>
    set(node, 'display', on ? display : 'none')
  const lift = (node: HTMLElement, y: number) =>
    set(node, 'transform', y ? `translateY(${y.toFixed(2)}px)` : '')

  /* One caret per person, moved between the slots. */
  const caret = Object.fromEntries(
    PEOPLE.map((who) => {
      const c = document.createElement('span')
      c.className = 'ha-c'
      c.dataset.who = who
      const bar = document.createElement('i')
      c.append(bar)
      if (who !== 'alex') {
        const flag = document.createElement('b')
        flag.textContent =
          root.querySelector<HTMLElement>(`[data-name="${who}"]`)?.textContent ?? who
        c.append(flag)
      }
      return [who, c]
    }),
  ) as Record<Who, HTMLElement>
  const flagOf = (who: Who) => caret[who].querySelector('b')

  /** Writes one slot: its text with the carets and a selection inside, when that changed. */
  const painted = new Map<SlotId, string>()
  const paint = (id: SlotId, text: string, carets: { who: Who; c: CaretState }[]) => {
    const here = carets.filter((x) => x.c.on > 0 && x.c.slot === id)
    const key = `${text}\u0000${here.map((x) => `${x.who}:${x.c.offset}:${x.c.sel?.join('-') ?? ''}`).join(',')}`
    if (painted.get(id) === key) return false
    painted.set(id, key)
    const cuts = new Set<number>([0, text.length])
    for (const x of here) {
      cuts.add(Math.min(x.c.offset, text.length))
      if (x.c.sel) cuts.add(x.c.sel[0]).add(x.c.sel[1])
    }
    const points = [...cuts].sort((a, b) => a - b)
    const out: Node[] = []
    for (let i = 0; i < points.length; i++) {
      const at = points[i] ?? 0
      for (const x of here) if (Math.min(x.c.offset, text.length) === at) out.push(caret[x.who])
      const next = points[i + 1]
      if (next === undefined || next === at) continue
      const part = text.slice(at, next)
      const sel = here.find((x) => x.c.sel && at >= x.c.sel[0] && next <= x.c.sel[1])
      if (sel) {
        const mark = document.createElement('mark')
        mark.dataset.who = sel.who
        mark.textContent = part
        out.push(mark)
      } else out.push(document.createTextNode(part))
    }
    // A caret after the last letter goes after the text, before anything else.
    slot[id].replaceChildren(...out)
    return true
  }

  /* Natural height of the assistant's block in the note, for its opening. */
  let insertH = 0
  const measureInsert = () => {
    el.insert.style.display = 'block'
    el.insert.style.height = 'auto'
    insertH = el.insert.offsetHeight
    el.insert.style.display = 'none'
    el.insert.style.height = '0px'
    cache.delete(el.insert)
  }
  measureInsert()

  /* Scroll of the note and of the conversation: tweens in timeline seconds. */
  let docTween: Tween = { from: 0, to: 0, at: -1 }
  let convTween: Tween = { from: 0, to: 0, at: -1 }
  const scale = () => root.getBoundingClientRect().width / root.offsetWidth || 1

  const follow = (t: number, f: Frame) => {
    const k = scale()
    const v = view.getBoundingClientRect()
    const viewH = view.clientHeight
    const lines: { who: Who; top: number; bottom: number }[] = []
    for (const who of PEOPLE) {
      const c = f.carets[who]
      if (c.on <= 0 || !c.active) continue
      const r = caret[who].getBoundingClientRect()
      if (!r.height) continue
      const mid = ((r.top + r.bottom) / 2 - v.top) / k
      lines.push({ who, top: mid - 14, bottom: mid + 14 })
    }
    if (t >= docTween.at + SCROLL && lines.length) {
      const S = tweenAt(docTween, t)
      const lowest = lines.reduce((a, b) => (b.bottom > a.bottom ? b : a))
      const alex = lines.find((x) => x.who === 'alex')
      let delta = 0
      if (lowest.bottom > viewH - SAFE) {
        delta = lowest.bottom - (viewH - SAFE) + ROOM
        // Never push Alex's own line (or anyone's flag) out at the top.
        const top = Math.min(...lines.map((x) => x.top))
        delta = Math.min(delta, Math.max(0, top - TOP))
      } else {
        const top = alex ?? lowest
        if (top.top < TOP) delta = top.top - TOP - 28
      }
      const to = Math.max(0, S + delta)
      if (Math.abs(to - S) > 4) docTween = { from: S, to, at: t }
    }
    // The conversation keeps its newest line in view.
    if (t >= convTween.at + SCROLL) {
      const A = tweenAt(convTween, t)
      const bottom = el.conv.offsetHeight
      const room = el.messages.clientHeight - 32
      if (bottom - A > room - 24) convTween = { from: A, to: bottom - room + ROOM, at: t }
    }
  }

  /* Flags: the first side with no text under it; hidden while there is none. */
  const range = document.createRange()
  const place: Partial<Record<Who, Place>> = {}
  const flagSize: Partial<Record<Who, [number, number]>> = {}
  const textRects = () => {
    const out: DOMRect[] = []
    const walk = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim() || n.parentElement?.closest('.ha-c')) continue
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) if (r.width > 0) out.push(r)
    }
    for (const b of doc.querySelectorAll<HTMLElement>('.ha-box'))
      out.push(b.getBoundingClientRect())
    return out
  }
  const placeFlags = (f: Frame) => {
    const remote = (['sofia', 'ben'] as const).filter((w) => f.carets[w].on > 0)
    if (!remote.length) return
    const k = scale()
    const v = view.getBoundingClientRect()
    const text = textRects()
    const taken: DOMRect[] = []
    for (const who of remote) {
      const flag = flagOf(who)
      if (!flag) continue
      const bar = caret[who].firstElementChild?.getBoundingClientRect()
      if (!bar) continue
      flagSize[who] ??= [flag.offsetWidth, flag.offsetHeight]
      const [fw, fh] = flagSize[who] ?? [0, 0]
      const w = fw * k
      const h = fh * k
      const rectOf = (p: Place) => {
        const left = p === 'side' ? bar.right + 3 * k : p === 'upl' ? bar.right - w : bar.left
        const top =
          p === 'side' ? bar.top + (bar.height - h) / 2 : p === 'down' ? bar.bottom : bar.top - h
        return new DOMRect(left, top, w, h)
      }
      const free = (p: Place) => {
        const r = rectOf(p)
        // Inside the note, below the faded top edge.
        if (
          r.left < v.left + 2 * k ||
          r.right > v.right - 2 * k ||
          r.top < v.top + 28 * k ||
          r.bottom > v.bottom - 4 * k
        )
          return false
        // A little air on both sides: a flag never touches a letter (or a full stop after the caret).
        const hits = (o: DOMRect) =>
          Math.min(r.right + 4 * k, o.right) - Math.max(r.left - 4 * k, o.left) > 0 &&
          Math.min(r.bottom, o.bottom - 3 * k) - Math.max(r.top, o.top + 3 * k) > 0.5
        return !text.some(hits) && !taken.some(hits)
      }
      const keep = place[who]
      const pick = keep && free(keep) ? keep : PLACES.find(free)
      if (pick) {
        place[who] = pick
        taken.push(rectOf(pick))
      }
      set(caret[who], 'data-place', pick ?? keep ?? 'up')
      set(caret[who], 'data-flag', pick ? '1' : '')
    }
  }

  /*
   * Mouse pointers: each glides to where its person clicks, presses, and hides while they type (as
   * the system pointer does), so it never rests over the text. Placed in the app's own px.
   */
  const MOVE = 0.45
  /** When the pointer sets off for a tap: never before the loop's first frame, which has none. */
  const setOff = (tap: Tap) => Math.max(0.02, tap.at - MOVE)
  const COLORS: Record<Who, string> = { alex: '#211f1c', sofia: '#ec4870', ben: '#14beaf' }
  const svgNs = 'http://www.w3.org/2000/svg'
  const layer = document.createElement('div')
  layer.className = 'ha-pointers'
  root.append(layer)
  const pointer = Object.fromEntries(
    PEOPLE.map((who) => {
      const p = document.createElement('i')
      p.className = 'ha-pointer'
      const svg = document.createElementNS(svgNs, 'svg')
      svg.setAttribute('width', '14')
      svg.setAttribute('height', '19')
      svg.setAttribute('viewBox', '0 0 14 19')
      const path = document.createElementNS(svgNs, 'path')
      path.setAttribute('d', 'M1.2 1.2v14.3l3.6-3.4 2.6 5.9 2.5-1.1-2.6-5.8h5z')
      path.setAttribute('fill', COLORS[who])
      path.setAttribute('stroke', '#fff')
      path.setAttribute('stroke-width', '1.4')
      path.setAttribute('stroke-linejoin', 'round')
      svg.append(path)
      p.append(svg)
      layer.append(p)
      return [who, p]
    }),
  ) as Record<Who, HTMLElement>

  /** A tap's click point in app px: the caret's spot in the text, or a control's middle. */
  const tapRange = document.createRange()
  const tapPoint = (tap: Tap, k: number, box: DOMRect): { x: number; y: number } | null => {
    const local = (x: number, y: number) => ({ x: (x - box.left) / k, y: (y - box.top) / k })
    const target = tap.target
    if ('el' in target) {
      const r = root.querySelector<HTMLElement>(`[data-h="${target.el}"]`)?.getBoundingClientRect()
      if (!r?.width) return null
      // The message field is clicked near its start; buttons and boxes in the middle.
      return target.el === 'input'
        ? local(r.left + 24 * k, r.top + r.height / 2)
        : local(r.left + r.width / 2, r.top + r.height / 2)
    }
    const host = slot[target.slot]
    if (!host.getClientRects().length || !host.textContent) {
      // A section not typed yet: its line opens under the last block of the note.
      const blocks = [...doc.children].filter((n) => (n as HTMLElement).offsetHeight > 0)
      const r = (
        host.getClientRects().length ? host : blocks[blocks.length - 1]
      )?.getBoundingClientRect()
      if (!r) return null
      return host.getClientRects().length
        ? local(r.left, r.top + r.height / 2)
        : local(r.left + 2 * k, r.bottom + 30 * k)
    }
    let left = target.pos
    const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.parentElement?.closest('.ha-c')) continue
      const len = n.textContent?.length ?? 0
      if (left <= len && len > 0) {
        const after = left > 0
        tapRange.setStart(n, after ? left - 1 : 0)
        tapRange.setEnd(n, after ? left : 1)
        const rects = tapRange.getClientRects()
        const r = after ? rects[rects.length - 1] : rects[0]
        if (r) return local(after ? r.right : r.left, (r.top + r.bottom) / 2)
        break
      }
      left -= len
    }
    const r = host.getBoundingClientRect()
    return local(r.right, r.top + r.height / 2)
  }

  const placePointers = (t: number, content: number) => {
    const box = root.getBoundingClientRect()
    const k = box.width / root.offsetWidth || 1
    for (const who of PEOPLE) {
      const list = tl.taps[who]
      const el = pointer[who]
      let i = -1
      for (let n = 0; n < list.length; n++) {
        const next = list[n]
        if (next && setOff(next) <= t) i = n
      }
      const tap = list[i]
      if (!tap || t > tap.at + 0.75) {
        op(el, 0)
        continue
      }
      const to = tapPoint(tap, k, box)
      if (!to) {
        op(el, 0)
        continue
      }
      // From the last click while the pointer is still out, else from a little off the target.
      const prev = list[i - 1]
      const start = setOff(tap)
      const chained = prev !== undefined && start < prev.at + 0.7
      const from = (chained && prev ? tapPoint(prev, k, box) : null) ?? {
        x: to.x + 40,
        y: to.y + 28,
      }
      const u = easeInOut((t - start) / (tap.at - start))
      const x = from.x + (to.x - from.x) * u
      const y = from.y + (to.y - from.y) * u
      const clamp = (v: number) => Math.min(1, Math.max(0, v))
      const show = chained ? 1 : clamp((t - start) / 0.15)
      const hide = 1 - clamp((t - (tap.at + 0.5)) / 0.2)
      op(el, show * hide * content)
      const down = t >= tap.at && t < tap.at + 0.12
      set(
        el,
        'transform',
        `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${down ? ' scale(0.86)' : ''}`,
      )
    }
  }

  const render = (time: number) => {
    const f = tl.frameAt(time)
    const t = time >= tl.LOOP_SWAP ? 0 : time
    if (time >= tl.LOOP_SWAP) {
      docTween = { from: 0, to: 0, at: -1 }
      convTween = { from: 0, to: 0, at: -1 }
    }
    const carets = PEOPLE.map((who) => ({ who, c: f.carets[who] }))
    let changed = false
    for (const id of SLOTS) changed = paint(id, f.slots[id], carets) || changed
    for (const who of PEOPLE) {
      const c = f.carets[who]
      op(caret[who], c.on)
      if (c.on <= 0 && caret[who].isConnected) {
        caret[who].remove()
        for (const id of SLOTS) if (painted.get(id)?.includes(`${who}:`)) painted.delete(id)
      }
      set(caret[who], 'data-busy', c.busy ? '1' : '')
    }
    for (const s of sections) {
      const [head, para] = f.sections[s.id]
      changed = show(s.head, head) || changed
      changed = show(s.para, para) || changed
    }
    f.checks.forEach((v, i) => {
      const box = el.checks[i]
      if (!box) return
      set(box, 'data-done', v > 0 ? '1' : '')
      const tick = box.firstElementChild as HTMLElement | null
      if (tick) op(tick, v)
      const label = box.nextElementSibling as HTMLElement | null
      if (label) set(label, 'color', v > 0 ? 'var(--ha-muted)' : '')
    })
    set(el.edited, 'text', f.edited)
    op(el.edited, f.editedOn * f.content)
    changed = show(el.insert, f.insert > 0, 'block') || changed
    if (f.insert > 0) {
      set(
        el.insert,
        'height',
        f.insert >= 1 ? 'auto' : `${(insertH * easeInOut(f.insert)).toFixed(2)}px`,
      )
      op(el.insertIn, Math.min(1, f.insert * 1.4))
      lift(el.insertIn, 6 * (1 - f.insert))
      changed = true
    }

    /* Assistant. */
    for (let i = 0; i < 2; i++) {
      const ask = el.ask[i]
      const ans = el.ans[i]
      const busy = el.busy[i]
      const done = el.done[i]
      const spin = el.spin[i]
      if (!ask || !ans || !busy || !done || !spin) continue
      show(ask, (f.ask[i] ?? 0) > 0, 'block')
      op(ask, f.ask[i] ?? 0)
      lift(ask, 6 * (1 - (f.ask[i] ?? 0)))
      show(ans, (f.busy[i] ?? 0) > 0 || (f.done[i] ?? 0) > 0, 'flex')
      op(busy, f.busy[i] ?? 0)
      op(done, f.done[i] ?? 0)
      if ((f.busy[i] ?? 0) > 0) set(spin, 'transform', `rotate(${f.spin.toFixed(1)}deg)`)
    }
    set(el.a1p1, 'text', f.a1p1)
    show(el.a1p1, f.a1p1.length > 0)
    set(el.a1p2, 'text', f.a1p2)
    show(el.a1p2, f.a1p2.length > 0)
    show(el.a1cards, f.a1cards[0] > 0, 'flex')
    f.a1cards.forEach((v, i) => {
      const card = el.a1card[i]
      if (!card) return
      op(card, v)
      lift(card, 4 * (1 - v))
    })
    set(el.a2intro, 'text', f.a2intro)
    show(el.a2intro, f.a2intro.length > 0)
    show(el.a2list, (f.a2items[0]?.length ?? 0) > 0, 'flex')
    f.a2items.forEach((text, i) => {
      const li = el.a2li[i]
      if (!li) return
      set(li, 'text', text)
      show(li, text.length > 0, 'list-item')
    })
    show(el.a2cards, f.a2card > 0, 'flex')
    op(el.a2card, f.a2card)
    lift(el.a2card, 4 * (1 - f.a2card))
    show(el.a2actions, f.button > 0, 'flex')
    op(el.add, f.button)
    set(el.add, 'data-down', f.buttonDown ? '1' : '')
    op(el.addPlus, 1 - f.added)
    op(el.addCheck, f.added)
    op(el.addLabel, 1 - f.added)
    op(el.addedLabel, f.added)
    op(el.conv, f.content)

    set(el.inputText, 'text', f.input)
    // Both fade with the loop, never across each other.
    op(el.inputPh, f.placeholder * f.content)
    op(el.inputCaret, f.inputCaret ? 1 : 0)
    op(el.input, f.content)
    set(el.send, 'data-down', f.sendDown ? '1' : '')

    if (changed) follow(t, f)
    const S = tweenAt(docTween, t)
    const moved = set(doc, 'transform', S > 0.01 ? `translateY(${(-S).toFixed(2)}px)` : '')
    op(doc, f.content)
    set(el.conv, 'transform', `translateY(${(-tweenAt(convTween, t)).toFixed(2)}px)`)
    if (changed || moved) placeFlags(f)
    placePointers(t, f.content)
  }

  /** Back to the start of the loop's scrolling (for a replay). */
  const reset = () => {
    docTween = { from: 0, to: 0, at: -1 }
    convTween = { from: 0, to: 0, at: -1 }
  }

  /** Something glides at t (a scroll, the block opening): worth every display frame. */
  const smooth = (t: number) =>
    t < docTween.at + SCROLL ||
    t < convTween.at + SCROLL ||
    (t >= tl.INSERT && t < tl.INSERT + 0.3) ||
    PEOPLE.some((who) => tl.taps[who].some((tap) => t >= setOff(tap) && t < tap.at))

  return { render, reset, smooth, duration: tl.DURATION }
}
