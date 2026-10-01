import type { NoteSummary } from '@fixnote/core'
import type React from 'react'
import { useRef } from 'react'
import { create } from 'zustand'
import { useUi } from '../app/store'

/**
 * Picking several notes in a list, as in the iPhone's Photos: a long press on a note starts it
 * with that note checked, then a click checks or unchecks; Ctrl/⌘+click does the same at once.
 * `SelectionBar` shows what can be done with them.
 */
interface SelectionState {
  active: boolean
  ids: string[]
}

export const useSelection = create<SelectionState>()(() => ({ active: false, ids: [] }))

const set = useSelection.setState

export function toggleSelected(id: string) {
  set((s) => ({
    active: true,
    ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
  }))
}

export function selectAll(ids: string[]) {
  set({ active: true, ids })
}

export function endSelection() {
  set({ active: false, ids: [] })
}

/** How long a press takes to start picking notes. */
const LONG_PRESS_MS = 450
/** Moving the pointer further than this is scrolling, not a press. */
const MOVE_PX = 10

/**
 * What a note in a list does when pressed: opens on a click, or, once picking notes started (a
 * long press, or Ctrl/⌘+click), is checked or unchecked. On touch a long press picks instead of
 * opening the right-click menu.
 */
export function useNotePress(note: NoteSummary) {
  const navigate = useUi((s) => s.navigate)
  const selecting = useSelection((s) => s.active)
  const selected = useSelection((s) => s.ids.includes(note.id))
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  // The long press already acted: the click that follows it does nothing.
  const pressed = useRef(false)

  const cancel = () => {
    clearTimeout(timer.current)
    start.current = null
  }

  const props = {
    'data-selected': selected ? '' : undefined,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      pressed.current = false
      start.current = { x: e.clientX, y: e.clientY }
      // Touch: the long press is ours, not the right-click menu's (Radix opens it on a long touch).
      if (e.pointerType !== 'mouse') e.preventDefault()
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        pressed.current = true
        start.current = null
        if (!useSelection.getState().ids.includes(note.id)) toggleSelected(note.id)
        navigator.vibrate?.(10)
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_PX) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      // A long touch also fires contextmenu on Android: it picked the note already.
      if (pressed.current || selecting) e.preventDefault()
    },
    onClick: (e: React.MouseEvent) => {
      if (pressed.current) {
        pressed.current = false
        e.preventDefault()
        return
      }
      if (selecting || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        toggleSelected(note.id)
        return
      }
      navigate({ kind: 'note', id: note.id })
    },
  }
  return { props, selecting, selected }
}
