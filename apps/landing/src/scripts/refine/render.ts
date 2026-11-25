import { DURATION, type DiffPart, frameAt, glide, T } from './timeline'

export interface RefineRenderer {
  duration: number
  render(t: number, still?: boolean): void
  measure(): void
  dispose(): void
}

interface Pt {
  x: number
  y: number
}

/**
 * Binds frames to the RefineCard DOM. Character edges of the selected line,
 * natural widths of removed / added words and pointer targets are measured
 * from the real layout in card px (scale-independent), cached, and re-measured
 * on demand. Every write is a pure function of t.
 */
export function refineRenderer(root: HTMLElement, diff: readonly DiffPart[]): RefineRenderer {
  const $ = (n: string) => {
    const el = root.querySelector<HTMLElement>(`[data-a="${n}"]`)
    if (!el) throw new Error(`RefineCard: missing [data-a="${n}"]`)
    return el
  }

  const originalLength = diff
    .filter((p) => p.kind !== 'ins')
    .reduce((sum, p) => sum + p.text.length, 0)

  const delNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-a^="del"]'))
  const insNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-a^="ins"]'))

  const el = {
    selection: $('selection'),
    line: $('line'),
    orig: $('orig'),
    dim: [$('dim1'), $('dim2')],
    del: delNodes,
    ins: insNodes,
    menu: $('menu'),
    hover: $('hover'),
    panel: $('panel'),
    chunks: diff.map((_, k) =>
      Array.from(root.querySelectorAll<HTMLElement>(`[data-a="chunk${k}"]`)),
    ),
    accept: $('accept'),
    pointer: $('pointer'),
    arrow: $('arrow'),
  }

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
  const op = (node: HTMLElement, v: number) => set(node, 'opacity', v.toFixed(3))

  const range = document.createRange()
  let edges: number[] = []
  let lineCy = 0
  let wDel: number[] = el.del.map(() => 0)
  let wIns: number[] = el.ins.map(() => 0)
  let pRewrite: Pt = { x: 0, y: 0 }
  let pAccept: Pt = { x: 0, y: 0 }

  const measure = () => {
    const box = root.getBoundingClientRect()
    const k = box.width / root.offsetWidth || 1
    const lx = (x: number) => (x - box.left) / k
    const ly = (y: number) => (y - box.top) / k

    for (const n of [...el.del, ...el.ins]) {
      n.style.width = 'auto'
      cache.delete(n)
    }
    wDel = el.del.map((n) => (n.firstElementChild?.getBoundingClientRect().width ?? 0) / k)
    wIns = el.ins.map((n) => (n.firstElementChild?.getBoundingClientRect().width ?? 0) / k)
    for (const n of el.ins) n.style.width = '0px'

    const nodes: Text[] = []
    let p = 0
    for (const child of Array.from(el.line.children) as HTMLElement[]) {
      const part = diff[p++]
      if (!part || part.kind === 'ins') continue
      const tn = (
        part.kind === 'same' ? child.firstChild : child.firstElementChild?.firstChild
      ) as Text | null
      if (tn) nodes.push(tn)
    }

    edges = []
    let first = true
    for (const tn of nodes) {
      for (let i = 0; i < tn.length; i++) {
        range.setStart(tn, i)
        range.setEnd(tn, i + 1)
        const r = range.getBoundingClientRect()
        if (first) {
          edges.push(lx(r.left))
          lineCy = ly((r.top + r.bottom) / 2)
          first = false
        }
        edges.push(lx(r.right))
      }
    }

    const hr = el.hover.getBoundingClientRect()
    pRewrite = { x: lx(hr.left) + 46, y: ly(hr.top + hr.height / 2) + 3 }

    const prevPanel = el.panel.style.transform
    const prevAccept = el.accept.style.transform
    el.panel.style.transform = 'none'
    el.accept.style.transform = 'none'
    const ar = el.accept.getBoundingClientRect()
    el.panel.style.transform = prevPanel
    el.accept.style.transform = prevAccept
    pAccept = { x: lx(ar.left + ar.width / 2) - 10, y: ly(ar.top + ar.height / 2) + 4 }
  }
  measure()

  const OUT: Pt = { x: 612, y: 505 }
  const ASIDE: Pt = { x: 492, y: 352 }
  const arc = (a: Pt, b: Pt, u: number): Pt => {
    const e = glide(u)
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const cx = mx - dy * 0.16
    const cy = my + dx * 0.16
    const v = 1 - e
    return {
      x: v * v * a.x + 2 * v * e * cx + e * e * b.x,
      y: v * v * a.y + 2 * v * e * cy + e * e * b.y,
    }
  }
  const seg = (t: number, [a, b]: readonly [number, number]) =>
    Math.min(1, Math.max(0, (t - a) / (b - a)))

  const edgeAt = (idx: number) => edges[Math.min(idx, edges.length - 1)] ?? 0

  const pointerAt = (t: number, selected: number): Pt => {
    const y = lineCy - 3
    const start: Pt = { x: edgeAt(0) + 1, y }
    const dragEnd: Pt = { x: edgeAt(originalLength), y }
    const click: Pt = { x: 150, y: lineCy + 2 }
    if (t < T.enter[1]) return arc(OUT, start, seg(t, T.enter))
    if (t < T.drag[1]) return { x: edgeAt(selected), y }
    if (t < T.toRewrite[0]) return arc(dragEnd, click, seg(t, T.toClick))
    if (t < T.aside[0]) return arc(click, pRewrite, seg(t, T.toRewrite))
    if (t < T.toAccept[0]) return arc(pRewrite, ASIDE, seg(t, T.aside))
    if (t < T.exit[0]) return arc(ASIDE, pAccept, seg(t, T.toAccept))
    return arc(pAccept, OUT, seg(t, T.exit))
  }

  const render = (time: number, still = false) => {
    const f = frameAt(time, originalLength, diff.length, { still })
    const t = time >= DURATION - 1e-9 ? 0 : time

    const out = Math.min(1, f.apply / 0.7)
    const inn = Math.max(0, (f.apply - 0.3) / 0.7)
    el.del.forEach((n, i) => {
      set(n, 'width', `${((wDel[i] ?? 0) * (1 - out)).toFixed(2)}px`)
      op(n, 1 - out)
    })
    el.ins.forEach((n, i) => {
      set(n, 'width', `${((wIns[i] ?? 0) * inn).toFixed(2)}px`)
      op(n, inn)
      set(n, 'background-color', `rgba(224, 235, 226, ${(f.tint * inn).toFixed(3)})`)
    })

    const selW = f.selected > 0 ? edgeAt(f.selected) - edgeAt(0) + 4.8 : 0
    set(el.selection, 'width', `${selW.toFixed(2)}px`)
    op(el.selection, f.selectionOpacity)
    op(el.line, 1 - f.back)
    op(el.orig, f.back)
    for (const n of el.dim) op(n, 1 - 0.7 * f.dim)

    op(el.menu, f.menu.opacity)
    set(
      el.menu,
      'transform',
      `translateY(${f.menu.y.toFixed(2)}px) scale(${f.menu.scale.toFixed(4)})`,
    )
    op(el.hover, f.hover)
    op(el.panel, f.panel.opacity)
    set(el.panel, 'transform', `translateY(${f.panel.y.toFixed(2)}px)`)
    el.chunks.forEach((nodes, k) => {
      const v = f.chunks[k] ?? 0
      for (const n of nodes) op(n, v)
    })

    const h = f.acceptHover
    const mix = (a: number, b: number) => Math.round(a + (b - a) * h)
    set(
      el.accept,
      'background-color',
      `rgb(${mix(0x21, 0x36)}, ${mix(0x1f, 0x33)}, ${mix(0x1c, 0x2f)})`,
    )
    set(
      el.accept,
      'transform',
      f.acceptPress > 0 ? `scale(${(1 - 0.03 * f.acceptPress).toFixed(4)})` : 'none',
    )

    op(el.pointer, f.pointer.opacity)
    const pt = f.pointer.opacity > 0 ? pointerAt(t, f.selected) : OUT
    set(el.pointer, 'transform', `translate(${pt.x.toFixed(2)}px, ${pt.y.toFixed(2)}px)`)
    set(
      el.arrow,
      'transform',
      f.pointer.press > 0 ? `scale(${(1 - 0.1 * f.pointer.press).toFixed(4)})` : 'none',
    )
  }

  return {
    duration: DURATION,
    render,
    measure() {
      measure()
      cache.clear()
    },
    dispose() {
      cache.clear()
    },
  }
}
