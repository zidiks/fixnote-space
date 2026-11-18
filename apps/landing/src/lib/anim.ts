/**
 * Looping card animations as plain CSS, written at build time (views/home/recall). A timeline is a
 * list of tracks: one element (its `data-k`), one property, and the moves it makes in one loop.
 * Each track becomes one @keyframes rule on the loop's full length, so the browser plays it on the
 * compositor (transform and opacity only) and no script runs per frame.
 *
 * Playback is the card's own business (`--play` and `--at` on its root, see recall.css): paused
 * on the opening frame until a tiny script sees the card on screen, and a still frame with
 * reduced motion.
 */

/** cubic-bezier control points, or a jump at the start of the move. */
export type Ease = readonly [number, number, number, number] | 'linear' | 'snap'

export interface Move {
  /** Start, in seconds from the loop start. */
  at: number
  /** Length in seconds (0 or left out: a jump). */
  dur?: number
  to: string
  ease?: Ease
}

export interface Track {
  /** The element's `data-k`. */
  k: string
  prop: 'opacity' | 'transform' | 'clip-path' | 'visibility'
  /** The value at the loop start, which the loop must also end on. */
  from: string
  moves: Move[]
}

/** Movement with weight: travels visibly, then keeps easing into rest. */
export const SETTLE = [0.22, 0.61, 0.36, 1] as const
/** Opacity and crossfades. */
export const FADE = [0.33, 0, 0.67, 1] as const
/** Travel that starts and stops softly. */
export const TRAVEL = [0.65, 0, 0.35, 1] as const

const pct = (t: number, length: number) => `${+((t / length) * 100).toFixed(4)}%`
const easing = (e: Ease = 'linear') =>
  e === 'linear' ? 'linear' : e === 'snap' ? 'step-start' : `cubic-bezier(${e.join(',')})`

/**
 * The CSS for one card: `scope` is a class on the card's root, `length` the loop in seconds.
 * Throws when a track's moves overlap, run past the loop or do not come back to `from`: such a
 * loop would jump at the seam.
 */
export function loopCss(scope: string, length: number, tracks: Track[]): string {
  const byElement = new Map<string, string[]>()
  const rules: string[] = []
  tracks.forEach((track, i) => {
    const name = `${scope}-${i}`
    const frames: { t: number; value: string; ease: Ease }[] = [
      { t: 0, value: track.from, ease: 'linear' },
    ]
    let now = track.from
    let free = 0
    const moves = [...track.moves].sort((a, b) => a.at - b.at)
    for (const m of moves) {
      // A jump is a step over half a millisecond.
      const dur = m.dur || 0.0005
      const ease: Ease = m.dur ? (m.ease ?? 'linear') : 'snap'
      if (m.at < free - 1e-6)
        throw new Error(`${name} (${track.k} ${track.prop}): moves overlap at ${m.at}s`)
      if (m.at + dur > length + 1e-6) throw new Error(`${name} (${track.k}): runs past the loop`)
      const last = frames[frames.length - 1]
      if (last && m.at - last.t < 1e-6) last.ease = ease
      else frames.push({ t: m.at, value: now, ease })
      frames.push({ t: m.at + dur, value: m.to, ease: 'linear' })
      now = m.to
      free = m.at + dur
    }
    if (now !== track.from)
      throw new Error(`${name} (${track.k} ${track.prop}): ends on ${now}, not ${track.from}`)
    frames.push({ t: length, value: now, ease: 'linear' })
    // Linear is the animation's own timing (the shorthand below), so only other curves are written.
    const body = frames
      .map(
        (f) =>
          `${pct(f.t, length)}{${track.prop}:${f.value}${f.ease === 'linear' ? '' : `;animation-timing-function:${easing(f.ease)}`}}`,
      )
      .join('')
    rules.push(`@keyframes ${name}{${body}}`)
    const list = byElement.get(track.k) ?? []
    list.push(name)
    byElement.set(track.k, list)
  })
  for (const [k, names] of byElement) {
    rules.push(
      `.${scope} [data-k="${k}"]{animation:${names.map((n) => `${n} ${length}s linear infinite both`).join(',')};` +
        'animation-play-state:var(--play,paused);animation-delay:var(--at,0s)}',
    )
  }
  return rules.join('\n')
}

/**
 * Typing as tracks: every letter is its own element (`${prefix}c${i}`) that shows at its key, and
 * the caret is a child of the last shown letter (`${prefix}k${i}`; `${prefix}k0` stands before the
 * first one), so it always sits exactly at the end of the text, whatever the font does.
 * `shown` letters are there from the start; `clear` is when the typed ones go (at once while the
 * query is hidden, or fading over `clearDur`). `caretIn` < 0: the caret is on at the loop start.
 */
export function typing(
  prefix: string,
  keys: number[],
  {
    shown = 0,
    clear,
    clearDur = 0,
    caretIn,
    caretOut,
  }: { shown?: number; clear: number; clearDur?: number; caretIn: number; caretOut: number },
): Track[] {
  const tracks: Track[] = []
  const total = shown + keys.length
  const keyOf = (i: number) => (i < shown ? 0 : (keys[i - shown] ?? 0))
  for (let i = shown; i < total; i++) {
    tracks.push({
      k: `${prefix}c${i}`,
      prop: 'opacity',
      from: '0',
      moves: [
        { at: keyOf(i), to: '1' },
        { at: clear, dur: clearDur, ease: FADE, to: '0' },
      ],
    })
  }
  // Caret i stands after letter i - 1 (k0: before the first letter). The last one fades out.
  for (let i = shown; i <= total; i++) {
    const on = i === shown ? caretIn : keyOf(i - 1)
    const off: Move =
      i === total ? { at: caretOut, dur: 0.16, ease: FADE, to: '0' } : { at: keyOf(i), to: '0' }
    if (i === shown && caretIn < 0) {
      // On at the loop start (typing goes on from there); back once the typed letters are gone,
      // never inside a word.
      tracks.push({
        k: `${prefix}k${i}`,
        prop: 'opacity',
        from: '1',
        moves: [off, { at: clear + clearDur, dur: 0.16, ease: FADE, to: '1' }],
      })
      continue
    }
    // A caret replaced at the moment it would show (the first key lands as the field opens).
    if (off.at - on < 0.001) continue
    tracks.push({
      k: `${prefix}k${i}`,
      prop: 'opacity',
      from: '0',
      moves: [{ at: on, to: '1' }, off],
    })
  }
  return tracks
}
