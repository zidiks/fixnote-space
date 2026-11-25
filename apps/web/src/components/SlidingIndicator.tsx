import { cn } from '@fixnote/ui'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'

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
