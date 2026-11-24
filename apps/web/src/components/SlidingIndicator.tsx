import { cn } from '@fixnote/ui'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'

/**
 * Flip to `false` to immediately revert to static active backgrounds/borders
 * across Sidebar, SettingsDialog and LinksBar.
 */
export const SLIDING_INDICATOR = true

interface Rect {
  x: number
  y: number
  w: number
  h: number
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
}: {
  container: RefObject<HTMLElement | null>
  /** Stable identifier of the active item (or null/false when nothing in this group is active). */
  activeKey: string | null | false
  className?: string
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
        hadActive.current = false
        setAnimate(false)
        setRect(null)
        return
      }
      const next: Rect = {
        x: target.offsetLeft,
        y: target.offsetTop,
        w: target.offsetWidth,
        h: target.offsetHeight,
      }
      setAnimate(allowMotion && hadActive.current)
      hadActive.current = true
      setRect(next)
    }

    measure(true)
    const ro = new ResizeObserver(() => measure(false))
    ro.observe(root)
    return () => ro.disconnect()
  }, [container, activeKey])

  if (!SLIDING_INDICATOR || !rect) return null

  return (
    <span
      aria-hidden="true"
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
