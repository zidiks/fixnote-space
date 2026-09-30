import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Route, useUi } from '../app/store'
import {
  type HistoryLike,
  navBack,
  navForward,
  openBackLayer as openLayer,
  startNavHistory,
} from './nav-history'

/** Session history like a browser's: pushes drop forward entries, traversals fire popstate later. */
class FakeHistory implements HistoryLike {
  entries: unknown[]
  index: number
  listeners = new Set<(e: { state: unknown }) => void>()
  constructor(entries: unknown[] = [null]) {
    this.entries = [...entries]
    this.index = this.entries.length - 1
  }
  get state() {
    return this.entries[this.index]
  }
  pushState(state: unknown) {
    this.entries = [...this.entries.slice(0, this.index + 1), state]
    this.index++
  }
  replaceState(state: unknown) {
    this.entries[this.index] = state
  }
  back() {
    this.go(-1)
  }
  forward() {
    this.go(1)
  }
  go(delta: number) {
    const to = this.index + delta
    setTimeout(() => {
      if (to < 0 || to >= this.entries.length) {
        if (to < 0) this.left = true
        return
      }
      this.index = to
      for (const fn of this.listeners) fn({ state: this.state })
    })
  }
  left = false
}

const settle = () => new Promise((r) => setTimeout(r, 5))
const route = () => useUi.getState().route
const note = (id: string): Route => ({ kind: 'note', id })

let h: FakeHistory
let stop: () => void
let stray = 0

function start(entries?: unknown[]) {
  h = new FakeHistory(entries)
  stop = startNavHistory({
    history: h,
    addEventListener: (_, fn) => h.listeners.add(fn),
    removeEventListener: (_, fn) => h.listeners.delete(fn),
    closeStray: () => {
      if (!stray) return false
      stray--
      return true
    },
  })
}

beforeEach(() => {
  useUi.setState({ route: { kind: 'home' }, back: [], forward: [], drawerOpen: false })
  stray = 0
})
afterEach(() => stop())

describe('browser history', () => {
  it('back and forward in the browser move through the app', async () => {
    start()
    useUi.getState().navigate(note('a'))
    useUi.getState().navigate(note('b'))
    expect(h.entries).toHaveLength(3)
    h.back()
    await settle()
    expect(route()).toEqual(note('a'))
    h.back()
    await settle()
    expect(route()).toEqual({ kind: 'home' })
    h.forward()
    await settle()
    expect(route()).toEqual(note('a'))
  })

  it("the app's own back goes through the browser, forward adds an entry", async () => {
    start()
    useUi.getState().navigate(note('a'))
    navBack()
    await settle()
    expect(route()).toEqual({ kind: 'home' })
    expect(h.index).toBe(0)
    navForward()
    expect(route()).toEqual(note('a'))
    expect(h.index).toBe(1)
    h.back()
    await settle()
    expect(route()).toEqual({ kind: 'home' })
  })

  it('back closes an overlay before leaving the screen', async () => {
    start()
    useUi.getState().navigate(note('a'))
    let open = true
    // What useBackLayer does while an overlay is open.
    openLayer(() => {
      open = false
    })
    h.back()
    await settle()
    expect(open).toBe(false)
    expect(route()).toEqual(note('a'))
    h.back()
    await settle()
    expect(route()).toEqual({ kind: 'home' })
  })

  it('an overlay closed on screen gives its entry back', async () => {
    start()
    const close = openLayer(() => {})
    expect(h.index).toBe(1)
    close()
    await settle()
    expect(h.index).toBe(0)
    expect(route()).toEqual({ kind: 'home' })
  })

  it('an overlay that navigates leaves an entry that back passes over', async () => {
    start()
    const close = openLayer(() => {})
    useUi.getState().navigate(note('a'))
    close()
    await settle()
    expect(h.index).toBe(2)
    h.back()
    await settle()
    await settle()
    expect(route()).toEqual({ kind: 'home' })
    expect(h.index).toBe(0)
  })

  it('back closes a stray dialog and stays on the screen', async () => {
    start()
    useUi.getState().navigate(note('a'))
    stray = 1
    h.back()
    await settle()
    expect(stray).toBe(0)
    expect(route()).toEqual(note('a'))
    expect(h.index).toBe(1)
  })

  it('back into entries of an earlier load leaves the app', async () => {
    const old = { fx: 'old', i: 3, n: 3, r: 3 }
    start([null, { ...old, i: 1, n: 1 }, { ...old, i: 2, n: 2 }, old])
    expect(h.index).toBe(3)
    h.back()
    await settle()
    await settle()
    expect(h.left).toBe(true)
  })
})
