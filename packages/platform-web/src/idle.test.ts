import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdleTimer } from './idle'

function mockDocument(initialHidden = false) {
  let hidden = initialHidden
  const listeners = new Set<() => void>()
  const doc = {
    get hidden() {
      return hidden
    },
    addEventListener(type: string, cb: () => void) {
      if (type === 'visibilitychange') listeners.add(cb)
    },
    removeEventListener(type: string, cb: () => void) {
      if (type === 'visibilitychange') listeners.delete(cb)
    },
  }
  vi.stubGlobal('document', doc)
  return {
    setHidden(next: boolean) {
      hidden = next
      for (const cb of [...listeners]) cb()
    },
    listenerCount: () => listeners.size,
  }
}

describe('createIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fires after visibleMs when idle and cancels on next use', () => {
    const doc = mockDocument(false)
    let live = true
    const onIdle = vi.fn(() => {
      live = false
    })
    const idle = createIdleTimer({
      visibleMs: 120_000,
      hiddenMs: 15_000,
      isLive: () => live,
      onIdle,
    })

    idle.begin()
    idle.end()
    expect(doc.listenerCount()).toBe(1)

    vi.advanceTimersByTime(100_000)
    expect(onIdle).not.toHaveBeenCalled()

    // New operation cancels the idle timer.
    idle.begin()
    vi.advanceTimersByTime(200_000)
    expect(onIdle).not.toHaveBeenCalled()

    idle.end()
    vi.advanceTimersByTime(119_999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(doc.listenerCount()).toBe(0)
  })

  it('accelerates unload when document becomes hidden and restores when visible again', () => {
    const doc = mockDocument(false)
    let live = true
    const onIdle = vi.fn(() => {
      live = false
    })
    const idle = createIdleTimer({
      visibleMs: 720_000,
      hiddenMs: 90_000,
      isLive: () => live,
      onIdle,
    })

    idle.begin()
    idle.end()

    // 30s elapsed while visible, then hidden -> 60s remaining.
    vi.advanceTimersByTime(30_000)
    doc.setHidden(true)
    vi.advanceTimersByTime(40_000)
    expect(onIdle).not.toHaveBeenCalled()

    // Visible again at 70s -> does not fire at 90s.
    doc.setHidden(false)
    vi.advanceTimersByTime(40_000)
    expect(onIdle).not.toHaveBeenCalled()

    // Hidden again at 110s (> 90s elapsed) -> fires immediately.
    doc.setHidden(true)
    vi.advanceTimersByTime(0)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('never unloads while requests are in flight', () => {
    const doc = mockDocument(false)
    const onIdle = vi.fn()
    const idle = createIdleTimer({
      visibleMs: 60_000,
      hiddenMs: 10_000,
      isLive: () => true,
      onIdle,
    })

    idle.begin()
    idle.begin()
    idle.end()
    doc.setHidden(true)
    vi.advanceTimersByTime(120_000)
    expect(onIdle).not.toHaveBeenCalled()

    idle.end()
    vi.advanceTimersByTime(9_999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('honors shorter visibleOverrideMs (e.g. benchmark 60s TTL)', () => {
    const doc = mockDocument(false)
    const onIdle = vi.fn()
    const idle = createIdleTimer({
      visibleMs: 720_000,
      hiddenMs: 90_000,
      isLive: () => true,
      onIdle,
    })

    idle.begin()
    idle.end(60_000)
    // Even if hidden, TTL is min(90s, 60s) = 60s.
    doc.setHidden(true)
    vi.advanceTimersByTime(59_999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })
})
