import { cn } from '@fixnote/ui'
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Flip to `false` to immediately revert to static active backgrounds/borders
 * across Sidebar, NoteColumn, SettingsDialog and LinksBar.
 */
export const SLIDING_INDICATOR = true

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Measures `target` relative to `root`'s padding-box origin. Unlike `offsetLeft`/`offsetTop`,
 * this also accounts for CSS transforms on intermediate wrappers (such as `VirtualList` rows).
 */
function measureIn(root: HTMLElement, target: HTMLElement): Rect {
  const rr = root.getBoundingClientRect()
  const tr = target.getBoundingClientRect()
  return {
    x: tr.left - rr.left + root.scrollLeft - root.clientLeft,
    y: tr.top - rr.top + root.scrollTop - root.clientTop,
    w: tr.width,
    h: tr.height,
  }
}

function sameRect(a: Rect | null, b: Rect): boolean {
  return (
    a !== null &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 &&
    Math.abs(a.h - b.h) < 0.5
  )
}

/**
 * Tracks the active `[data-active="true"]` descendant inside a `relative` container and renders a
 * GPU-composited sliding highlight behind it. Snaps on first mount or after leaving the group,
 * glides via `translate3d` between items in the group, and disables motion for reduced-motion users.
 */
export function SlidingIndicator({
  container,
  activeKey,
  className,
  observeMutations = false,
}: {
  container: RefObject<HTMLElement | null>
  /** Stable identifier of the active item (or null/false when nothing in this group is active). */
  activeKey: string | null | false
  className?: string
  /** Set true when items live inside a virtualized list that shifts row transforms or mounts rows dynamically. */
  observeMutations?: boolean
}) {
  const [rect, setRect] = useState<Rect | null>(null)
  const [animate, setAnimate] = useState(false)
  const hadActive = useRef(false)

  useLayoutEffect(() => {
    if (!SLIDING_INDICATOR || !activeKey) {
      hadActive.current = false
      setAnimate(false)
      setRect(null)
      return
    }
    const root = container.current
    if (!root) return

    const measure = (allowMotion: boolean) => {
      const target = root.querySelector<HTMLElement>('[data-active="true"]')
      if (!target) {
        if (!observeMutations) hadActive.current = false
        setAnimate(false)
        setRect(null)
        return
      }
      const next = measureIn(root, target)
      setAnimate(allowMotion && hadActive.current)
      hadActive.current = true
      setRect((prev) => (sameRect(prev, next) ? prev : next))
    }

    measure(true)
    const ro = new ResizeObserver(() => measure(false))
    ro.observe(root)

    let mo: MutationObserver | undefined
    let frame = 0
    if (observeMutations) {
      const schedule = () => {
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          measure(false)
        })
      }
      mo = new MutationObserver((records) => {
        if (
          records.every(
            (r) => r.target instanceof HTMLElement && r.target.dataset.slidingIndicator === 'true',
          )
        )
          return
        schedule()
      })
      mo.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style'],
      })
    }

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      mo?.disconnect()
    }
  }, [container, activeKey, observeMutations])

  if (!SLIDING_INDICATOR || !rect) return null

  return (
    <span
      aria-hidden="true"
      data-sliding-indicator="true"
      className={cn(
        'pointer-events-none absolute top-0 left-0 z-0 motion-reduce:transition-none',
        animate &&
          'transition-[transform,width,height] duration-[var(--duration-spring)] ease-[var(--ease-apple)]',
        className,
      )}
      style={{
        width: rect.w,
        height: rect.h,
        transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
      }}
    />
  )
}

const HOVER_GLIDE_TRANSITION =
  'transform var(--duration-spring-fast) var(--ease-apple), width var(--duration-spring-fast) var(--ease-apple), height var(--duration-spring-fast) var(--ease-apple), opacity 140ms ease-out'
const HOVER_FADE_TRANSITION = 'opacity 140ms ease-out'

/**
 * Tracks the pointer-hovered item matching `itemSelector` inside a `relative` container and glides
 * a GPU-composited hover backdrop behind it via direct DOM updates (zero React re-renders on pointer
 * movement). Snaps on fresh entry, glides between items with the Apple spring curve, hides on the
 * currently active item so it doesn't double-stack with `SlidingIndicator`, and fades out on leave.
 */
export function SlidingHoverIndicator({
  container,
  itemSelector,
  activeKey,
  className,
}: {
  container: RefObject<HTMLElement | null>
  itemSelector: string
  /** Active item key so the hover backdrop hides immediately when the hovered item becomes active. */
  activeKey?: string | null | false
  className?: string
}) {
  const pillRef = useRef<HTMLSpanElement>(null)
  const hoveredRef = useRef<HTMLElement | null>(null)
  const trackingRef = useRef(false)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!SLIDING_INDICATOR) return
    const root = container.current
    const pill = pillRef.current
    if (!root || !pill) return

    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const applyRect = (r: Rect, glide: boolean, visible: boolean) => {
      const reduced = reducedMotion()
      if (!glide || reduced) {
        pill.style.transition = reduced ? 'none' : HOVER_FADE_TRANSITION
        pill.style.width = `${r.w}px`
        pill.style.height = `${r.h}px`
        pill.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`
        if (!reduced) {
          // Commit snapped geometry before enabling glide transitions so entry never flies in.
          void pill.offsetWidth
          pill.style.transition = HOVER_GLIDE_TRANSITION
        }
      } else {
        pill.style.transition = HOVER_GLIDE_TRANSITION
        pill.style.width = `${r.w}px`
        pill.style.height = `${r.h}px`
        pill.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`
      }
      pill.style.opacity = visible ? '1' : '0'
    }

    const hideNow = () => {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = undefined
      hoveredRef.current = null
      trackingRef.current = false
      pointerRef.current = null
      pill.style.opacity = '0'
    }

    const hoverElement = (el: Element | null) => {
      const hit = el?.closest<HTMLElement>(itemSelector) ?? null
      const target = hit && root.contains(hit) ? hit : null
      if (!target) {
        if (trackingRef.current && hideTimerRef.current === undefined) {
          // Short grace window prevents flicker when crossing the 2px gap between cards.
          hideTimerRef.current = setTimeout(() => {
            hideTimerRef.current = undefined
            hoveredRef.current = null
            trackingRef.current = false
            pill.style.opacity = '0'
          }, 70)
        }
        return
      }
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = undefined
      if (target === hoveredRef.current) return
      hoveredRef.current = target
      const isActive = target.dataset.active === 'true'
      const rect = measureIn(root, target)
      applyRect(rect, trackingRef.current, !isActive)
      trackingRef.current = true
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      pointerRef.current = { x: e.clientX, y: e.clientY }
      hoverElement(e.target as Element | null)
    }

    const syncHovered = () => {
      const target = hoveredRef.current
      if (!target) return
      if (!root.contains(target)) {
        hoveredRef.current = null
        trackingRef.current = false
        pill.style.opacity = '0'
        return
      }
      const isActive = target.dataset.active === 'true'
      applyRect(measureIn(root, target), false, !isActive)
    }

    let frame = 0
    const scheduleSync = () => {
      if (frame || !hoveredRef.current) return
      frame = requestAnimationFrame(() => {
        frame = 0
        syncHovered()
      })
    }

    let scrollFrame = 0
    const onScroll = () => {
      if (scrollFrame || !pointerRef.current) return
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0
        const pt = pointerRef.current
        if (!pt) return
        hoverElement(document.elementFromPoint(pt.x, pt.y))
      })
    }

    let scroller: HTMLElement | null = root.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement
    }

    const ro = new ResizeObserver(scheduleSync)
    ro.observe(root)
    const mo = new MutationObserver((records) => {
      if (
        !hoveredRef.current ||
        records.every(
          (r) =>
            r.target === pill ||
            (r.target instanceof HTMLElement && r.target.dataset.slidingIndicator === 'true'),
        )
      )
        return
      scheduleSync()
    })
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })

    root.addEventListener('pointermove', onPointerMove, { passive: true })
    root.addEventListener('pointerleave', hideNow)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(hideTimerRef.current)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(scrollFrame)
      ro.disconnect()
      mo.disconnect()
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerleave', hideNow)
      scroller?.removeEventListener('scroll', onScroll)
    }
  }, [container, itemSelector])

  // Immediately hide or reveal the hover backdrop when the active card changes under the pointer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync hover opacity whenever active item changes
  useLayoutEffect(() => {
    if (!SLIDING_INDICATOR) return
    const pill = pillRef.current
    const target = hoveredRef.current
    if (!pill || !target || !trackingRef.current) return
    pill.style.opacity = target.dataset.active === 'true' ? '0' : '1'
  }, [activeKey])

  if (!SLIDING_INDICATOR) return null

  return (
    <span
      ref={pillRef}
      aria-hidden="true"
      data-sliding-indicator="true"
      className={cn(
        'pointer-events-none absolute top-0 left-0 z-0 opacity-0 motion-reduce:transition-none',
        className,
      )}
    />
  )
}
