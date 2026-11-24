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

const isSimpleFrame = (f: BotFrame) =>
  f.arcs.length === 0 && f.dots.length === 0 && !f.notch && !f.notif && f.eyes.length === 2

/**
 * The assistant's avatar: one morphing shape with eyes cut out of it. The engine is a pure function
 * of time; this component owns the clock (requestAnimationFrame) and the pointer.
 *
 * Pauses automatically when the document is hidden (tray/background tab) or scrolled off-screen,
 * caches its own bounding box instead of forcing layout reads every frame, and mutates simple
 * body/eye SVG paths directly via refs to avoid 60–120Hz React reconciliations while idle.
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
  const maskBodyRef = useRef<SVGPathElement>(null)
  const backingBodyRef = useRef<SVGPathElement>(null)
  const bodyGroupRef = useRef<SVGGElement>(null)
  const eye0Ref = useRef<SVGPathElement>(null)
  const eye1Ref = useRef<SVGPathElement>(null)
  const pointer = useRef<{ x: number; y: number; movedAt: number } | null>(null)
  const aim = useRef<{ since: number } | null>(null)
  const [frame, setFrame] = useState<BotFrame>(() => (engine.current as BotEngine).sample(0))
  const renderedSimple = useRef(isSimpleFrame(frame))
  renderedSimple.current = isSimpleFrame(frame)

  useEffect(() => {
    const e = engine.current
    if (!e || e.state === state) return
    e.setState(state, clock.current)
    if (reducedMotion()) setFrame(e.sample(clock.current + 2))
  }, [state])

  useEffect(() => {
    const e = engine.current
    const svgEl = svg.current
    if (!e || !svgEl || reducedMotion()) return
    let raf = 0
    let last = 0
    let lastDrawn = 0
    let inView = true
    let boxDirty = true
    let cachedBox: { cx: number; cy: number; w: number } | null = null

    const markBoxDirty = () => {
      boxDirty = true
    }

    const readBox = () => {
      if (boxDirty) {
        const r = svgEl.getBoundingClientRect()
        cachedBox =
          r.width > 0 ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width } : null
        boxDirty = false
      }
      return cachedBox
    }

    const shouldRun = () => !document.hidden && inView

    const applyDirect = (next: BotFrame): boolean => {
      if (!renderedSimple.current || !isSimpleFrame(next)) return false
      const m = maskBodyRef.current
      const b = backingBodyRef.current
      const g = bodyGroupRef.current
      const e0 = eye0Ref.current
      const e1 = eye1Ref.current
      const [eye0, eye1] = next.eyes
      if (!m || !b || !g || !e0 || !e1 || !eye0 || !eye1) return false
      m.setAttribute('d', next.bodyPath)
      b.setAttribute('d', next.bodyPath)
      g.setAttribute('opacity', String(next.bodyAlpha))
      e0.setAttribute('d', eye0.d)
      e0.setAttribute('transform', eye0.matrix)
      e0.setAttribute('opacity', String(eye0.alpha))
      e1.setAttribute('d', eye1.d)
      e1.setAttribute('transform', eye1.matrix)
      e1.setAttribute('opacity', String(eye1.alpha))
      return true
    }

    const tick = (ms: number) => {
      if (!shouldRun()) {
        raf = 0
        last = 0
        return
      }
      raf = requestAnimationFrame(tick)
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0
      last = ms
      clock.current += dt
      const now = clock.current

      // Quiet idle breathing without recent pointer motion needs ~30fps, saving half the idle work.
      const pointerRecent = pointer.current !== null && ms - pointer.current.movedAt < 1500
      if (e.state === 'idle' && !pointerRecent && lastDrawn && ms - lastDrawn < 32) {
        return
      }
      lastDrawn = ms

      const box = follow ? readBox() : null
      const canAim = follow && STATE_BY_ID.get(e.state)?.baseFace && box && box.w > 0
      if (canAim) {
        aim.current ??= { since: now }
        const p = pointer.current
        e.setLook(
          lookTarget({
            nx: p ? clamp((p.x - box.cx) / Math.max(1, innerWidth / 2), -1, 1) : 0,
            ny: p ? clamp((p.y - box.cy) / Math.max(1, innerHeight / 2), -1, 1) : 0,
            tour: easings.easeOutQuint(clamp((now - aim.current.since) / TURN_TIME)),
            pointer: p !== null,
          }),
          now,
        )
      } else if (aim.current) {
        e.setLook(null, now, TURN_TIME)
        aim.current = null
      }
      const next = e.sample(now)
      if (!applyDirect(next)) {
        renderedSimple.current = isSimpleFrame(next)
        setFrame(next)
      }
    }

    const syncLoop = () => {
      if (shouldRun()) {
        if (!raf) {
          last = 0
          raf = requestAnimationFrame(tick)
        }
      } else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
        last = 0
      }
    }

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            inView = entries.some((entry) => entry.isIntersecting)
            if (inView) markBoxDirty()
            syncLoop()
          })
        : null
    io?.observe(svgEl)

    const ro =
      follow && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(markBoxDirty) : null
    ro?.observe(svgEl)

    const onVisibility = () => syncLoop()
    document.addEventListener('visibilitychange', onVisibility)
    if (follow) {
      window.addEventListener('resize', markBoxDirty, { passive: true })
      window.addEventListener('scroll', markBoxDirty, { capture: true, passive: true })
    }

    syncLoop()
    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
      ro?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      if (follow) {
        window.removeEventListener('resize', markBoxDirty)
        window.removeEventListener('scroll', markBoxDirty, true)
      }
    }
  }, [follow])

  useEffect(() => {
    if (!follow) return
    const move = (ev: PointerEvent) => {
      if (ev.pointerType !== 'touch') {
        pointer.current = { x: ev.clientX, y: ev.clientY, movedAt: performance.now() }
      }
    }
    const leave = () => {
      pointer.current = null
    }
    addEventListener('pointermove', move, { passive: true })
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
          <path ref={maskBodyRef} d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path
              // biome-ignore lint/suspicious/noArrayIndexKey: two eyes in a fixed order
              key={i}
              ref={i === 0 ? eye0Ref : i === 1 ? eye1Ref : undefined}
              d={eye.d}
              transform={eye.matrix}
              opacity={eye.alpha}
              fill="#000"
            />
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
      <g ref={bodyGroupRef} opacity={frame.bodyAlpha}>
        {/* Opaque backing so arcs passing behind the body never show through the eye holes. */}
        <path ref={backingBodyRef} d={frame.bodyPath} fill={paper} />
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
