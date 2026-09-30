import { useEffect, useRef } from 'react'
import { useUi } from '../app/store'

/**
 * The browser's (and the phone's) back button drives the app's own history (`useUi`): each route
 * change is a history entry, and so is each overlay opened with `useBackLayer` (the drawer, the
 * assistant on a narrow screen, search, settings), so back closes the overlay first. Dialogs and
 * menus without their own entry are closed by back too, which then stays on the same screen.
 * The URL never changes. Only the web app does this; the desktop app has no browser history.
 */

/** What each of our entries holds in `history.state`. */
interface Entry {
  /** Which page load made the entry; entries of an earlier load are "foreign". */
  fx: string
  /** Position among this load's entries. */
  i: number
  /** Position since the app's first entry in this tab, across reloads. */
  n: number
  /** The in-app history depth (`back.length`) the entry stands for. */
  r: number
  /** Stands for an open overlay rather than a route. */
  layer?: true
}

interface Layer {
  i: number
  close: () => void
}

export interface HistoryLike {
  readonly state: unknown
  pushState(state: unknown, unused: string, url?: string | URL | null): void
  replaceState(state: unknown, unused: string, url?: string | URL | null): void
  back(): void
  forward(): void
  go(delta: number): void
}

export interface NavEnv {
  history: HistoryLike
  addEventListener(type: 'popstate', fn: (e: { state: unknown }) => void): void
  removeEventListener(type: 'popstate', fn: (e: { state: unknown }) => void): void
  /** Closes the topmost dialog or menu that has no entry of its own; false when there is none. */
  closeStray: () => boolean
}

const isEntry = (s: unknown): s is Entry =>
  typeof s === 'object' && s !== null && typeof (s as Entry).fx === 'string'

let active: {
  back: () => void
  forward: () => void
  open: (close: () => void) => Layer
  closed: (layer: Layer) => void
} | null = null

/** Starts following the browser history; returns the function that stops it. */
export function startNavHistory(env: NavEnv): () => void {
  const { history } = env
  const fx = Math.random().toString(36).slice(2)
  const before = history.state
  const n0 = isEntry(before) ? before.n : 0
  let current: Entry = { fx, i: 0, n: n0, r: useUi.getState().back.length }
  history.replaceState(current, '')

  const layers: Layer[] = []
  /** The store is being moved to match the browser: not a new entry. */
  let applying = false
  /** An entry we left ourselves (an overlay closed on screen): its popstate is ours. */
  let expected: number | null = null

  const push = (entry: Omit<Entry, 'fx' | 'i' | 'n'>) => {
    const i = current.i + 1
    current = { ...entry, fx, i, n: n0 + i }
    history.pushState(current, '')
  }

  const unsubscribe = useUi.subscribe((s, prev) => {
    if (applying || s.back === prev.back) return
    const pushed = s.route !== prev.route && s.back.at(-1) === prev.route
    if (pushed) push({ r: s.back.length })
    else {
      current = { ...current, r: s.back.length }
      history.replaceState(current, '')
    }
  })

  const syncRoute = (r: number) => {
    applying = true
    try {
      const ui = useUi.getState
      while (ui().back.length > r && ui().back.length > 0) ui().goBack()
      while (ui().back.length < r && ui().forward.length > 0) ui().goForward()
    } finally {
      applying = false
    }
  }

  const onPop = (e: { state: unknown }) => {
    const st = e.state
    if (!isEntry(st) || st.fx !== fx) {
      // An entry of an earlier load (before a reload): back leaves the app, forward returns.
      const n = isEntry(st) ? st.n : -1
      if (n > current.n) history.back()
      else if (isEntry(st)) history.go(-(n + 1))
      else history.back()
      return
    }
    const from = current
    current = st
    const back = st.i < from.i
    if (expected === st.i) {
      expected = null
      return
    }
    expected = null
    if (back) {
      if (env.closeStray()) {
        // Back closed a dialog: stay where we were.
        current = from
        history.pushState(from, '')
        return
      }
      for (let k = layers.length - 1; k >= 0; k--) {
        const layer = layers[k]
        if (layer && layer.i > st.i) {
          layers.splice(k, 1)
          layer.close()
        }
      }
    }
    if (st.layer && !layers.some((l) => l.i === st.i)) {
      // An overlay that is closed by now: pass over its entry.
      if (back) history.back()
      else history.forward()
      return
    }
    syncRoute(st.r)
  }
  env.addEventListener('popstate', onPop)

  active = {
    back: () => {
      if (current.i > 0) history.back()
      else useUi.getState().goBack()
    },
    // Forward is a new entry like any navigation: the browser's forward entries may be gone.
    forward: () => useUi.getState().goForward(),
    open: (close) => {
      push({ r: useUi.getState().back.length, layer: true })
      const layer = { i: current.i, close }
      layers.push(layer)
      return layer
    },
    closed: (layer) => {
      const k = layers.indexOf(layer)
      if (k < 0) return // closed by back
      layers.splice(k, 1)
      // Closed on screen: leave its entry, unless something was pushed on top meanwhile (then
      // the entry is passed over on the way back).
      queueMicrotask(() => {
        if (current.i !== layer.i) return
        expected = layer.i - 1
        history.back()
      })
    },
  }

  return () => {
    env.removeEventListener('popstate', onPop)
    unsubscribe()
    active = null
  }
}

/** Back in the app; on the web through the browser history, so both stay in step. */
export function navBack() {
  if (active) active.back()
  else useUi.getState().goBack()
}

export function navForward() {
  if (active) active.forward()
  else useUi.getState().goForward()
}

/** Gives an open overlay its own history entry; call the returned function once it closes. */
export function openBackLayer(close: () => void): () => void {
  const nav = active
  if (!nav) return () => {}
  const layer = nav.open(close)
  return () => nav.closed(layer)
}

/**
 * An overlay that back closes: while `open`, it has its own history entry. Its root (or dialog
 * content) should carry `data-back-layer`, so back does not take it for a stray dialog.
 */
export function useBackLayer(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => (open ? openBackLayer(() => closeRef.current()) : undefined), [open])
}

const STRAY =
  '[data-state="open"]:is([role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"])'

/** Radix dialogs, menus and selects close on Escape; send one to the topmost stray one. */
export function closeStrayOverlay(): boolean {
  const open = [...document.querySelectorAll<HTMLElement>(STRAY)].filter(
    (el) => !el.closest('[data-back-layer]'),
  )
  const top = open.at(-1)
  if (!top) return false
  top.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  return true
}

/** Follows the window's history (web only). */
export function useNavHistory(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    return startNavHistory({
      history: window.history,
      addEventListener: (type, fn) => window.addEventListener(type, fn),
      removeEventListener: (type, fn) => window.removeEventListener(type, fn),
      closeStray: closeStrayOverlay,
    })
  }, [enabled])
}
