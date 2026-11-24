import type { SecretCandidate } from '@fixnote/core/privacy/detect'

const IDLE_MS = 30_000

let worker: Worker | null = null
let nextId = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined
const jobs = new Map<number, (c: SecretCandidate[]) => void>()

function terminate() {
  clearTimeout(idleTimer)
  idleTimer = undefined
  if (worker) {
    worker.terminate()
    worker = null
  }
  for (const resolve of jobs.values()) resolve([])
  jobs.clear()
}

function scheduleIdle() {
  clearTimeout(idleTimer)
  if (jobs.size > 0 || !worker) return
  idleTimer = setTimeout(terminate, IDLE_MS)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && jobs.size === 0) terminate()
  })
}

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./privacy.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<{ id: number; candidates: SecretCandidate[] }>) => {
    const resolve = jobs.get(e.data.id)
    jobs.delete(e.data.id)
    resolve?.(e.data.candidates)
    scheduleIdle()
  }
  w.onerror = () => terminate()
  worker = w
  return w
}

/**
 * Runs secret-pattern detection on a single shared Web Worker with a 30s idle TTL
 * (and immediate release when hidden to tray), avoiding per-note worker churn.
 */
export function scanPrivacyText(text: string): Promise<SecretCandidate[]> {
  clearTimeout(idleTimer)
  idleTimer = undefined
  const id = ++nextId
  return new Promise((resolve) => {
    jobs.set(id, resolve)
    getWorker().postMessage({ id, text })
  })
}
