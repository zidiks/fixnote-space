import { type CSSProperties, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import { logo } from './data.gen'

type Phase = 'none' | 'draw' | 'mark' | 'expand' | 'collapse' | 'word'

/** The mark has written itself and rested a moment (logo.css: 0.28 s + 0.95 s). */
const DRAWN_MS = 1600
const WORD = logo.word.width / logo.word.height
const MARK = (logo.mark.width * logo.scale) / logo.word.height

/**
 * The FixNote logo: the `fn` mark or the whole word, in the text colour. Changing `variant`
 * unfolds the mark into the word or folds it back; `intro` writes it from nothing once, when it
 * first appears. Shapes and strokes come from brand/ (`pnpm logo`), the motion from logo.css.
 * Decorative: the name goes on what holds it (`aria-label`).
 */
export function Logo({
  variant = 'word',
  intro = false,
  height = 16,
  className,
}: {
  variant?: 'mark' | 'word'
  intro?: boolean
  /** Height in px; the width follows. */
  height?: number
  className?: string
}) {
  const id = `fx${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [written] = useState(intro)
  const [phase, setPhase] = useState<Phase>(written ? 'none' : variant)
  const shown = useRef(variant)

  useEffect(() => {
    if (!written) return
    const frame = requestAnimationFrame(() => setPhase((now) => (now === 'none' ? 'draw' : now)))
    // Settles whatever happened meanwhile: a hidden tab runs no frames, the variant may have changed.
    const timer = setTimeout(
      () =>
        setPhase((now) =>
          now === 'none' || now === 'draw' ? (shown.current === 'word' ? 'expand' : 'mark') : now,
        ),
      DRAWN_MS,
    )
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [written])

  useEffect(() => {
    if (shown.current === variant) return
    shown.current = variant
    // While the mark is still being written, the timer above unfolds it.
    setPhase((now) =>
      now === 'none' || now === 'draw' ? now : variant === 'word' ? 'expand' : 'collapse',
    )
  }, [variant])

  const wide = phase === 'expand' || phase === 'word'
  const use = (stroke: (typeof logo.strokes)[number]) => (
    <use key={stroke.id} href={`#${id}-${stroke.shape}`} mask={`url(#${id}-${stroke.id})`} />
  )

  return (
    <span
      aria-hidden
      className={cn('fx-logo-box', className)}
      style={{ height, width: height * (wide ? WORD : MARK) }}
    >
      <svg
        className="fx-logo"
        data-phase={phase}
        viewBox={`0 0 ${logo.word.width} ${logo.word.height}`}
        style={{ height, width: height * WORD, '--stop': logo.stop } as CSSProperties}
      >
        <title>FixNote</title>
        <defs>
          <path id={`${id}-f`} d={logo.shapes.f} />
          <path id={`${id}-mark`} fillRule="evenodd" d={logo.shapes.mark} />
          <path id={`${id}-xnot`} fillRule="evenodd" d={logo.shapes.xnot} />
          <path id={`${id}-e`} fillRule="evenodd" d={logo.shapes.e} />
          {logo.strokes.map((stroke) => (
            <mask key={stroke.id} id={`${id}-${stroke.id}`}>
              <path
                data-m={stroke.id}
                d={stroke.d}
                strokeWidth={stroke.width}
                pathLength={stroke.length}
                style={{ '--o': stroke.offset } as CSSProperties}
              />
              {stroke.block ? <path fill="#000" d={stroke.block} /> : null}
            </mask>
          ))}
        </defs>
        <g data-s="lockup">
          <g transform={`scale(${logo.scale})`}>
            {logo.strokes.filter((stroke) => stroke.space === 'mark').map(use)}
          </g>
          <path data-s="dot" d={logo.shapes.dot} />
          {logo.strokes.filter((stroke) => stroke.space === 'word').map(use)}
        </g>
      </svg>
    </span>
  )
}
