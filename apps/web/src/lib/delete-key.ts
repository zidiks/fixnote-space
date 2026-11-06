import { isApple } from '@fixnote/ui'
import { useEffect, useRef } from 'react'
import { isDeleteKey } from './hotkeys'
import { useSelection } from './selection'
import { useShortcuts } from './shortcuts'

/**
 * The Delete key removes what was last clicked or focused in a list: a note card
 * (`data-note-id`), a folder in the sidebar (`data-folder-id`), or the notes being picked. Each
 * asks first, and Enter confirms. Never while typing, while a dialog or menu is open, or once the
 * item has left the screen. Not rebindable: like Escape, it is the key itself.
 */

type Target = 'note' | 'folder' | 'selection'
type Picked = { kind: 'note' | 'folder'; id: string }

const handlers: Partial<Record<Target, (id: string) => void>> = {}
let picked: Picked | null = null

/** What Delete does for one kind of item; `null` while it can do nothing. Last mounted wins. */
export function useDeleteKeyHandler(kind: Target, fn: ((id: string) => void) | null) {
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => {
    const run = (id: string) => latest.current?.(id)
    handlers[kind] = run
    return () => {
      if (handlers[kind] === run) delete handlers[kind]
    }
  }, [kind])
}

function pickedFrom(target: EventTarget | null): Picked | null {
  if (!(target instanceof Element)) return null
  const el = target.closest<HTMLElement>('[data-note-id], [data-folder-id]')
  const note = el?.dataset.noteId
  if (note) return { kind: 'note', id: note }
  const folder = el?.dataset.folderId
  return folder ? { kind: 'folder', id: folder } : null
}

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || el.closest('input, textarea, select, [contenteditable]') !== null)

/** A dialog or menu (Radix keeps closed ones out of the DOM, so open ones are what is there). */
const overlayOpen = () =>
  document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"], [role="menu"], [role="listbox"]',
  ) !== null

const onScreen = ({ kind, id }: Picked) =>
  document.querySelector(`[data-${kind}-id="${CSS.escape(id)}"]`) !== null

/** The one listener behind the Delete key: mounted once, by `DeleteKey`. */
export function useDeleteKey() {
  useEffect(() => {
    // A Mac does not focus a clicked button, so the last press counts as well as focus.
    const onPress = (e: Event) => {
      picked = pickedFrom(e.target)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || !isDeleteKey(e, isApple)) return
      if (useShortcuts.getState().recording || isEditable(e.target) || overlayOpen()) return
      const selection = useSelection.getState()
      if (selection.active) {
        const fn = handlers.selection
        if (selection.ids.length && fn) {
          e.preventDefault()
          fn('')
        }
        return
      }
      const p = picked
      const fn = p ? handlers[p.kind] : undefined
      if (!p || !fn || !onScreen(p)) return
      e.preventDefault()
      fn(p.id)
    }
    window.addEventListener('pointerdown', onPress, true)
    window.addEventListener('focusin', onPress, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPress, true)
      window.removeEventListener('focusin', onPress, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}
