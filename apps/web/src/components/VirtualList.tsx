import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'

function RowContent<T>({
  item,
  index,
  render,
}: {
  item: T
  index: number
  render: (item: T, index: number) => ReactNode
}) {
  return useMemo(() => render(item, index), [item, index, render])
}

/** Variable-height rows share the surrounding scroll container, including its header offset. */
export function VirtualList<T>({
  items,
  itemKey,
  estimate,
  render,
  className,
  keepKey,
  fixedSize = false,
}: {
  items: T[]
  itemKey: (item: T) => string
  estimate: (item: T) => number
  render: (item: T, index: number) => ReactNode
  className?: string
  keepKey?: string | null
  fixedSize?: boolean
}) {
  const root = useRef<HTMLUListElement>(null)
  const [scroll, setScroll] = useState<HTMLElement | null>(null)
  const [margin, setMargin] = useState(0)
  const [held, setHeld] = useState<string | null>(null)
  useLayoutEffect(() => {
    let parent = root.current?.parentElement
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY))
      parent = parent.parentElement
    if (!parent) return
    setScroll(parent)
    const scroller = parent
    const measure = () => {
      if (root.current)
        setMargin(
          Math.round(
            root.current.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop,
          ),
        )
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(scroller)
    // Navigation entries above the list can appear without changing either observed size.
    const children = new MutationObserver(measure)
    children.observe(scroller, { childList: true })
    return () => {
      resize.disconnect()
      children.disconnect()
    }
  }, [])
  const heldIndex = held === null ? -1 : items.findIndex((item) => itemKey(item) === held)
  const keptIndex = keepKey == null ? -1 : items.findIndex((item) => itemKey(item) === keepKey)
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroll,
    getItemKey: (i) => itemKey(items[i] as T),
    estimateSize: (i) => estimate(items[i] as T),
    overscan: 8,
    scrollMargin: margin,
    rangeExtractor: (range) => {
      const indices = defaultRangeExtractor(range)
      // Keep the focus/context-menu/drag source alive when it leaves the viewport.
      if (heldIndex >= 0 && !indices.includes(heldIndex)) indices.push(heldIndex)
      if (keptIndex >= 0 && !indices.includes(keptIndex)) indices.push(keptIndex)
      return indices.sort((a, b) => a - b)
    },
  })
  return (
    <ul
      ref={root}
      className={className}
      data-virtual-count={items.length}
      style={{ height: virtual.getTotalSize(), position: 'relative', overflowAnchor: 'none' }}
    >
      {virtual.getVirtualItems().map((row) => (
        <li
          key={row.key}
          data-index={row.index}
          data-virtual-key={row.key}
          ref={fixedSize ? undefined : virtual.measureElement}
          aria-posinset={row.index + 1}
          aria-setsize={items.length}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            contain: 'layout style',
            transform: `translate3d(0, ${row.start - margin}px, 0)`,
          }}
          onFocusCapture={() => setHeld(String(row.key))}
          onPointerDownCapture={() => setHeld(String(row.key))}
          onContextMenuCapture={() => setHeld(String(row.key))}
          onKeyDown={(event) => {
            if (!event.currentTarget.contains(event.target as Node)) return
            if (event.altKey || event.ctrlKey || event.metaKey) return
            if (event.target instanceof HTMLInputElement) return
            const tab = event.key === 'Tab'
            if (event.shiftKey && !tab) return
            const direction = tab
              ? event.shiftKey
                ? -1
                : 1
              : event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowUp'
                  ? -1
                  : 0
            if (!direction && event.key !== 'Home' && event.key !== 'End') return
            if (tab) {
              const buttons = [
                ...event.currentTarget.querySelectorAll('button:not(:disabled)'),
              ].filter((button) => button.getClientRects().length)
              if (event.target !== buttons[direction > 0 ? buttons.length - 1 : 0]) return
              // Leave native Tab alone when its next row is already mounted.
              if (root.current?.querySelector(`[data-index="${row.index + direction}"]`)) return
            }
            let index =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : row.index + direction
            if (index < 0 || index >= items.length) return
            event.preventDefault()
            const seek = direction || (event.key === 'Home' ? 1 : -1)
            const focus = () => {
              const item = items[index]
              if (item === undefined) return
              setHeld(itemKey(item))
              virtual.scrollToIndex(index, { align: 'auto' })
              requestAnimationFrame(() => {
                const button = root.current?.querySelector<HTMLElement>(
                  `[data-index="${index}"] button`,
                )
                if (button) button.focus({ preventScroll: true })
                else if (index + seek >= 0 && index + seek < items.length) {
                  index += seek
                  focus()
                }
              })
            }
            focus()
          }}
        >
          <RowContent item={items[row.index] as T} index={row.index} render={render} />
        </li>
      ))}
    </ul>
  )
}

export function useCardColumns() {
  const [columns, setColumns] = useState(() =>
    window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1,
  )
  useLayoutEffect(() => {
    const update = () =>
      setColumns(window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return columns
}
