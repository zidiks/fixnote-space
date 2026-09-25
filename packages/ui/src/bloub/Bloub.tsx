import { useEffect, useId, useRef, useState } from 'react'
import { NOTIF_BLUE } from './engine/decor'
import { BotEngine, type BotFrame } from './engine/engine'
import { lookTarget, TURN_TIME } from './engine/gaze'
import { clamp, easings } from './engine/math'
import { DEMI_VIEWBOX, RAYON } from './engine/repere'
import { mixHex } from './engine/skins'
import { STATE_BY_ID, type StateId } from './engine/states'

export type { StateId as BloubState }

export interface BloubProps {
  size?: number
  state?: StateId
  /** Body color (hex). */
  ink: string
  /** Page background behind the avatar (hex); the eyes show it through. */
  paper: string
  /** Eyes follow the pointer on states with a resting face. */
  follow?: boolean
  label?: string
  className?: string
}

const VB = DEMI_VIEWBOX
const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The assistant's avatar: one morphing shape with eyes cut out of it. The engine is a pure function
 * of time; this component owns the clock (requestAnimationFrame) and the pointer.
 */
export function Bloub({
  size = 64,
  state = 'idle',
  ink,
  paper,
  follow = false,
  label,
  className,
}: BloubProps) {
  const uid = useId().replace(/:/g, '')
  const maskId = `bloub-mask-${uid}`
  const engine = useRef<BotEngine | null>(null)
  engine.current ??= new BotEngine(RAYON, state)
  const clock = useRef(0)
  const svg = useRef<SVGSVGElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const aim = useRef<{ since: number } | null>(null)
  const [frame, setFrame] = useState<BotFrame>(() => (engine.current as BotEngine).sample(0))

  useEffect(() => {
    const e = engine.current
    if (!e || e.state === state) return
    e.setState(state, clock.current)
    if (reducedMotion()) setFrame(e.sample(clock.current + 2))
  }, [state])

  useEffect(() => {
    const e = engine.current
    if (!e || reducedMotion()) return
    let raf = 0
    let last = 0
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick)
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0
      last = ms
      clock.current += dt
      const now = clock.current

      const box = svg.current?.getBoundingClientRect()
      const canAim = follow && STATE_BY_ID.get(e.state)?.baseFace && box && box.width > 0
      if (canAim) {
        aim.current ??= { since: now }
        const p = pointer.current
        e.setLook(
          lookTarget({
            nx: p
              ? clamp((p.x - (box.left + box.width / 2)) / Math.max(1, innerWidth / 2), -1, 1)
              : 0,
            ny: p
              ? clamp((p.y - (box.top + box.height / 2)) / Math.max(1, innerHeight / 2), -1, 1)
              : 0,
            tour: easings.easeOutQuint(clamp((now - aim.current.since) / TURN_TIME)),
            pointer: p !== null,
          }),
          now,
        )
      } else if (aim.current) {
        e.setLook(null, now, TURN_TIME)
        aim.current = null
      }
      setFrame(e.sample(now))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [follow])

  useEffect(() => {
    if (!follow) return
    const move = (ev: PointerEvent) => {
      if (ev.pointerType !== 'touch') pointer.current = { x: ev.clientX, y: ev.clientY }
    }
    const leave = () => {
      pointer.current = null
    }
    addEventListener('pointermove', move)
    document.addEventListener('pointerleave', leave)
    return () => {
      removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
    }
  }, [follow])

  const dot = (d: BotFrame['dots'][number], key: string) => {
    const fill = d.color ?? (d.depth === undefined ? ink : mixHex(paper, ink, d.depth))
    return d.d ? (
      <path
        key={key}
        d={d.d}
        fill={fill}
        opacity={d.opacity}
        transform={`translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${RAYON})`}
      />
    ) : (
      <circle key={key} cx={d.x} cy={d.y} r={d.r} fill={fill} opacity={d.opacity} />
    )
  }

  return (
    <svg
      ref={svg}
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: two eyes in a fixed order
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch ? (
            <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
          ) : null}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: gradient stops are positional
              <stop key={i} offset={i / (arc.grad.stops.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        ))}
      </defs>

      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
      {frame.dotsBehind ? <g>{frame.dots.map((d, i) => dot(d, `pb${i}`))}</g> : null}
      <g opacity={frame.bodyAlpha}>
        {/* Opaque backing so arcs passing behind the body never show through the eye holes. */}
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
      </g>
      {frame.dotsBehind ? null : <g>{frame.dots.map((d, i) => dot(d, `pf${i}`))}</g>}
      {frame.notif ? (
        <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />
      ) : null}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  )
}
