/* ──────────────────────────────────────────────────────────────────────────
 * "Refine with AI" — one loop of 9.6 s (576 frames at 60 fps).
 *
 * 0.00–0.60  frame 1; the pointer enters from bottom right to the first word
 * 0.60–1.30  drag-select the line (selection snaps to character edges)
 * 1.30–1.55  the rest of the note dims (frame 2); pointer moves into the
 *            selection; 1.80 right click → menu 1.92–2.10 (frame 3 position)
 * 2.50–2.80  to Rewrite; hover 2.80–2.92; click 3.10; menu leaves 3.22–3.37
 * 3.47       suggested-edit panel (frame 4): diff revealed 3.47–4.17,
 *            read until 5.57
 * 5.57–6.02  to Accept; hover 6.02–6.14; press 6.22; panel leaves 6.32–6.50
 * 6.50–7.00  edit applied in the note; added words keep a green tint
 *            until 7.60; selection and dimming clear; pointer leaves
 * 7.60–9.20  hold the new line
 * 9.20–9.60  crossfade back to the original line = frame 0
 * ────────────────────────────────────────────────────────────────────────── */

export interface DiffPart {
  kind: 'same' | 'del' | 'ins'
  text: string
}

export const DURATION = 9.6
/** Reduced motion: frame 4 composition, without the pointer. */
export const STILL_TIME = 5.0

type Bezier = [number, number, number, number]
const SETTLE: Bezier = [0.22, 0.61, 0.36, 1]
const INOUT: Bezier = [0.45, 0, 0.25, 1]
/** Pointer travel: soft start, gentle slow-down at the end. */
const GLIDE: Bezier = [0.35, 0, 0.15, 1]

export const T = {
  enter: [0.2, 0.6],
  drag: [0.6, 1.3],
  dim: [1.3, 1.55],
  toClick: [1.32, 1.76],
  rightClick: 1.8,
  menuIn: [1.92, 2.1],
  toRewrite: [2.5, 2.8],
  hover: [2.8, 2.92],
  click: 3.1,
  menuOut: [3.22, 3.37],
  aside: [3.3, 3.8],
  panelIn: [3.47, 3.69],
  chunk: 3.47,
  toAccept: [5.57, 6.02],
  acceptHover: [6.02, 6.14],
  accept: 6.22,
  panelOut: [6.32, 6.5],
  apply: [6.5, 7.0],
  tint: [7.0, 7.6],
  selOut: [6.5, 6.75],
  undim: [6.5, 6.8],
  exit: [6.45, 7.05],
  back: [9.2, 9.6],
} as const

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function bezier([x1, y1, x2, y2]: Bezier) {
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

const settle = bezier(SETTLE)
const inout = bezier(INOUT)
export const glide = bezier(GLIDE)
const span = (t: number, [a, b]: readonly [number, number], ease = settle) =>
  ease(clamp01((t - a) / (b - a)))

export interface Frame {
  selected: number
  selectionOpacity: number
  dim: number
  menu: { opacity: number; scale: number; y: number }
  hover: number
  panel: { opacity: number; y: number }
  chunks: number[]
  acceptHover: number
  acceptPress: number
  apply: number
  tint: number
  back: number
  pointer: { opacity: number; press: number }
}

const PRESS = 0.12

export function frameAt(
  time: number,
  originalLength: number,
  chunkCount: number,
  { still = false } = {},
): Frame {
  const t = time >= DURATION - 1e-9 ? 0 : time
  const selected = Math.round(originalLength * span(t, T.drag, inout))
  const menuIn = span(t, T.menuIn)
  const menuOut = span(t, T.menuOut)
  const apply = span(t, T.apply, inout)
  const pressAt = (at: number, d = PRESS) =>
    t >= at && t < at + d ? Math.sin((Math.PI * (t - at)) / d) : 0
  const chunks: number[] = []
  for (let k = 0; k < chunkCount; k++) {
    chunks.push(span(t, [T.chunk + k * 0.1, T.chunk + k * 0.1 + 0.12]))
  }
  return {
    selected,
    selectionOpacity: 1 - span(t, T.selOut),
    dim: span(t, T.dim) * (1 - span(t, T.undim)),
    menu: {
      opacity: t < T.menuIn[0] ? 0 : menuIn * (1 - menuOut),
      scale: t < T.menuOut[0] ? 0.97 + 0.03 * menuIn : 1 - 0.02 * menuOut,
      y: t < T.menuOut[0] ? -4 * (1 - menuIn) : 0,
    },
    hover: span(t, T.hover) * (1 - menuOut),
    panel: {
      opacity: span(t, T.panelIn) * (1 - span(t, T.panelOut)),
      y: 6 * (1 - span(t, T.panelIn)),
    },
    chunks,
    acceptHover: span(t, T.acceptHover),
    acceptPress: pressAt(T.accept, 0.1),
    apply,
    tint: t < T.tint[0] ? (apply > 0 ? 1 : 0) : 1 - span(t, T.tint),
    back: span(t, T.back, inout),
    pointer: {
      opacity: still ? 0 : span(t, [T.enter[0], T.enter[0] + 0.15]) * (1 - span(t, T.exit)),
      press: Math.max(pressAt(T.rightClick), pressAt(T.click), pressAt(T.accept)),
    },
  }
}
