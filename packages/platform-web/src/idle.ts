export interface IdleTimerOptions {
  /** Idle duration before firing while the page is visible. */
  visibleMs: number
  /** Accelerated idle duration while `document.hidden` is true. */
  hiddenMs: number
  /** Whether the underlying worker/resource is currently live. */
  isLive: () => boolean
  /** Called once the resource has been idle for the active TTL with nothing in flight. */
  onIdle: () => void
}

export interface IdleTimer {
  /** Marks an operation as in flight and cancels any pending idle timer. */
  begin(): void
  /**
   * Marks an operation as finished. When nothing remains in flight and the resource is still live,
   * arms the idle timer (optionally overriding the visible TTL for this idle window).
   */
  end(visibleOverrideMs?: number): void
  /** Cancels any pending idle timer and detaches the visibility listener. */
  cancel(): void
}

const isHidden = () => typeof document !== 'undefined' && document.hidden

/**
 * Shared idle auto-unload scheduler for on-device ML workers.
 *
 * Accelerates eviction when the window is hidden (`document.hidden`, e.g. minimized to tray or
 * backgrounded tab) and never fires while an operation is in flight.
 */
export function createIdleTimer(opts: IdleTimerOptions): IdleTimer {
  let inFlight = 0
  let idleSince: number | null = null
  let activeVisibleMs = opts.visibleMs
  let timer: ReturnType<typeof setTimeout> | null = null
  let listening = false

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const detach = () => {
    if (!listening || typeof document === 'undefined') return
    document.removeEventListener('visibilitychange', onVisibility)
    listening = false
  }

  const attach = () => {
    if (listening || typeof document === 'undefined') return
    document.addEventListener('visibilitychange', onVisibility)
    listening = true
  }

  const fire = () => {
    clearTimer()
    idleSince = null
    detach()
    if (inFlight > 0 || !opts.isLive()) return
    opts.onIdle()
  }

  const schedule = () => {
    clearTimer()
    if (inFlight > 0 || idleSince === null || !opts.isLive()) return
    const targetMs = isHidden() ? Math.min(opts.hiddenMs, activeVisibleMs) : activeVisibleMs
    const remaining = Math.max(0, targetMs - (Date.now() - idleSince))
    timer = setTimeout(fire, remaining)
  }

  const onVisibility = () => {
    if (inFlight > 0 || idleSince === null || !opts.isLive()) return
    schedule()
  }

  return {
    begin() {
      inFlight++
      idleSince = null
      clearTimer()
    },
    end(visibleOverrideMs) {
      if (inFlight > 0) inFlight--
      if (inFlight > 0) return
      if (!opts.isLive()) {
        idleSince = null
        clearTimer()
        detach()
        return
      }
      activeVisibleMs = visibleOverrideMs ?? opts.visibleMs
      idleSince = Date.now()
      attach()
      schedule()
    },
    cancel() {
      idleSince = null
      activeVisibleMs = opts.visibleMs
      clearTimer()
      detach()
    },
  }
}
