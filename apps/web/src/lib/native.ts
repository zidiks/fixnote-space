import type { Platform } from '@fixnote/core'
import { useEffect } from 'react'

interface NativeActions {
  back: () => void
  forward: () => void
  search: () => void
}

/** Browser shortcuts that make no sense in a desktop app (reload, print, find, view source…). */
function isBrowserShortcut(e: KeyboardEvent, apple: boolean): boolean {
  const mod = apple ? e.metaKey : e.ctrlKey
  const key = e.key.toLowerCase()
  if (['f3', 'f5', 'f7'].includes(key)) return true
  if (mod && ['r', 'p', 'g', 'u', 's', 'h', 'o', 'l', 't', 'w'].includes(key) && !e.altKey)
    return true
  if (mod && e.shiftKey && ['r', 'p', 'g'].includes(key)) return true
  // Zoom stays available on the web only.
  if (mod && ['+', '=', '-', '0'].includes(key)) return true
  return false
}

/**
 * Makes the app behave like an app, not a page.
 * Everywhere: mouse back/forward buttons and Alt+←/→ drive in-app history; dropped files never
 * replace the page. Desktop only: no browser context menu (our own menus still open), no browser
 * shortcuts, Ctrl/⌘+F opens search. Dev tools stay reachable in development builds.
 */
export function useNativeFeel(platform: Platform, apple: boolean, actions: NativeActions) {
  useEffect(() => {
    const desktop = platform.kind === 'desktop'
    const dev = import.meta.env.DEV

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault()
        actions.back()
      } else if (e.button === 4) {
        e.preventDefault()
        actions.forward()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        e.preventDefault()
        if (e.key === 'ArrowLeft') actions.back()
        else actions.forward()
        return
      }
      if (!desktop) return
      const mod = apple ? e.metaKey : e.ctrlKey
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        actions.search()
        return
      }
      if (isBrowserShortcut(e, apple)) e.preventDefault()
    }
    const onContextMenu = (e: MouseEvent) => {
      // Custom menus (Radix) open on their triggers first; this only hides the browser's menu.
      if (desktop && !dev) e.preventDefault()
      if (desktop && dev && !e.shiftKey) e.preventDefault() // Shift+right-click → inspect in dev
    }
    const onDrag = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }

    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('dragover', onDrag)
    window.addEventListener('drop', onDrag)
    return () => {
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('dragover', onDrag)
      window.removeEventListener('drop', onDrag)
    }
  }, [platform, apple, actions])
}
