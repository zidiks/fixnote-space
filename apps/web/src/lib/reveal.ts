import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Smooth "typing" for streamed answers. The model sends text in uneven bursts; the chat shows it
 * at a steady pace instead, a little behind the stream: a base speed plus a share of what is
 * waiting, so a fast model is never trailed by much, and whatever is left once the stream ends
 * comes out within a moment. Each newly shown word fades in (`fx-word` in styles.css).
 */

/** Characters per second with nothing waiting: a calm reading pace. */
export const BASE_RATE = 40
/** How far behind the stream the text may stay, in seconds of what is waiting. */
export const LAG_S = 0.3
/** Once the stream has ended, what is left is shown within about this long. */
export const DRAIN_S = 0.25
/** …but at least this fast, so a short tail does not crawl. */
export const DRAIN_MIN_RATE = 400
/** A longer gap (a hidden tab, a stalled frame) counts as this long, so nothing jumps. */
export const MAX_FRAME_MS = 250
/** How long a word takes to fade in (keep in step with `fx-word`). */
export const FADE_MS = 420

/**
 * How many more characters to show this frame. `carry` is the fraction left over from earlier
 * frames, so slow rates still advance evenly at 60 or 120 fps.
 */
export function revealStep(
  waiting: number,
  frameMs: number,
  ended: boolean,
  carry = 0,
): { count: number; carry: number } {
  if (waiting <= 0) return { count: 0, carry: 0 }
  const seconds = Math.min(Math.max(frameMs, 0), MAX_FRAME_MS) / 1000
  const rate = ended ? Math.max(DRAIN_MIN_RATE, waiting / DRAIN_S) : BASE_RATE + waiting / LAG_S
  const exact = rate * seconds + carry
  const count = Math.min(waiting, Math.floor(exact))
  return { count, carry: count === waiting ? 0 : exact - count }
}

/**
 * The shown part of a Markdown answer, made presentable mid-word: a citation still being written
 * ("[1") waits, and a bold or code span that is open gets closed for now, so it does not flash as
 * raw asterisks or backticks first.
 */
export function settleMarkdown(text: string): string {
  let t = text.replace(/\[[\d,\s]*$/, '')
  if (((t.match(/\*\*/g) ?? []).length & 1) === 1) {
    if (/\*\*\s*$/.test(t)) t = t.replace(/\*\*\s*$/, '')
    else t = `${t.replace(/(?<!\*)\*$/, '')}**`
  }
  if (((t.match(/`/g) ?? []).length & 1) === 1) {
    t = /`\s*$/.test(t) ? t.replace(/`\s*$/, '') : `${t}\``
  }
  return t
}

/** When each part of the text was shown, so a word that re-mounts keeps its place in the fade. */
export interface RevealClock {
  /** The time (performance.now) the character at `offset` was shown. */
  at(offset: number): number
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Shows `text` smoothly while `streaming`, then lets it finish. Answers that were already there
 * when this mounted (history, a reopened panel) show at once; so does everything with reduced
 * motion. `clock` is null when nothing animates: render plain text then.
 */
export function useReveal(
  text: string,
  streaming: boolean,
): { shown: string; clock: RevealClock | null; typing: boolean } {
  const [live, setLive] = useState(() => streaming && !reducedMotion())
  if (streaming && !live && !reducedMotion()) setLive(true)
  const [count, setCount] = useState(text.length)
  const counted = useRef(count)
  const target = useRef({ text, streaming })
  target.current = { text, streaming }
  // Checkpoints [end offset, time]: everything before `end` was shown by `time`.
  const marks = useRef<[number, number][]>([])

  const clock = useMemo<RevealClock>(
    () => ({
      at(offset) {
        const list = marks.current
        let lo = 0
        let hi = list.length
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if ((list[mid]?.[0] ?? 0) > offset) hi = mid
          else lo = mid + 1
        }
        return list[lo]?.[1] ?? performance.now()
      },
    }),
    [],
  )

  useEffect(() => {
    if (!live) return
    let shown = counted.current
    let carry = 0
    let last = performance.now()
    let lastShown = last
    let frame = 0
    const tick = (now: number) => {
      const { text: full, streaming: open } = target.current
      if (shown > full.length) shown = full.length
      const { count: more, carry: rest } = revealStep(full.length - shown, now - last, !open, carry)
      carry = rest
      last = now
      if (more > 0) {
        shown += more
        // Never split a surrogate pair (emoji).
        const code = full.charCodeAt(shown - 1)
        if (code >= 0xd800 && code <= 0xdbff && shown < full.length) shown++
        marks.current.push([shown, now])
        lastShown = now
        counted.current = shown
        setCount(shown)
      }
      // Done: the stream ended, all is shown and the last words have faded in.
      if (!open && shown >= full.length && now - lastShown > FADE_MS) {
        setLive(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [live])

  if (!live) return { shown: text, clock: null, typing: false }
  const shown = text.slice(0, Math.min(count, text.length))
  return {
    shown: streaming || shown.length < text.length ? settleMarkdown(shown) : shown,
    clock,
    typing: streaming || shown.length < text.length,
  }
}
