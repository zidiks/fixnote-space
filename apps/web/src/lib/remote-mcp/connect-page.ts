import { CONSENT_POLL_FOR_MS, CONSENT_POLL_MS, type ConsentResult } from '@fixnote/core'
import type { ConsentDetails, PollAnswer } from './consent'

/**
 * The connect page's steps (`ConnectPage`, docs/remote-mcp.md "Connecting"). Pure, so the order of
 * things can be tested without a browser.
 *
 * start ──open app──▶ waiting (hints after a few seconds) ──answer──▶ returning | declined
 *   │                    └──3 min──▶ expired ──again──▶ waiting
 *   └──email──▶ email ──code sent──▶ code ──signed in──▶ ask ──allow/deny──▶ returning
 * A session this browser already has (the web app's) goes straight to ask.
 */
export type ConnectStep =
  | { kind: 'loading' }
  | { kind: 'start' }
  | { kind: 'waiting'; slow: boolean }
  | { kind: 'expired' }
  | { kind: 'email' }
  | { kind: 'code'; email: string }
  | { kind: 'ask'; details: ConsentDetails; pro: boolean }
  | { kind: 'returning'; approved: boolean }
  | { kind: 'declined' }
  | { kind: 'invalid' }

export type ConnectEvent =
  | { type: 'no-session' }
  | { type: 'details'; details: ConsentDetails; pro: boolean }
  | { type: 'invalid' }
  | { type: 'open-app' }
  | { type: 'slow' }
  | { type: 'answer'; result: ConsentResult }
  | { type: 'timeout' }
  | { type: 'use-email' }
  | { type: 'code-sent'; email: string }
  | { type: 'back' }
  | { type: 'redirect'; approved: boolean }

/** After this long without an answer, the page offers the download and the email code. */
export const SLOW_AFTER_MS = 5000

export function connectReducer(step: ConnectStep, e: ConnectEvent): ConnectStep {
  switch (e.type) {
    case 'no-session':
      return step.kind === 'loading' ? { kind: 'start' } : step
    case 'details':
      return { kind: 'ask', details: e.details, pro: e.pro }
    case 'invalid':
      return { kind: 'invalid' }
    case 'open-app':
      return { kind: 'waiting', slow: false }
    case 'slow':
      return step.kind === 'waiting' ? { kind: 'waiting', slow: true } : step
    case 'answer':
      // Only while waiting: a late answer must not pull someone out of the email sign-in.
      if (step.kind !== 'waiting' && step.kind !== 'expired') return step
      return e.result.redirect
        ? { kind: 'returning', approved: e.result.approved }
        : { kind: 'declined' }
    case 'timeout':
      return step.kind === 'waiting' ? { kind: 'expired' } : step
    case 'use-email':
      return { kind: 'email' }
    case 'code-sent':
      return { kind: 'code', email: e.email }
    case 'back':
      return { kind: 'start' }
    case 'redirect':
      return { kind: 'returning', approved: e.approved }
  }
}

/**
 * Asks the relay until the app answered, the time is up or `signal` aborts. Network trouble is
 * not an answer: it keeps asking.
 */
export async function waitForAnswer(
  poll: () => Promise<PollAnswer>,
  opts: {
    signal: AbortSignal
    every?: number
    forMs?: number
    now?: () => number
    sleep?: (ms: number) => Promise<void>
  },
): Promise<ConsentResult | 'timeout' | 'aborted'> {
  const every = opts.every ?? CONSENT_POLL_MS
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const until = now() + (opts.forMs ?? CONSENT_POLL_FOR_MS)
  while (!opts.signal.aborted) {
    if (now() >= until) return 'timeout'
    const answer = await poll().catch(() => 'waiting' as const)
    if (opts.signal.aborted) break
    if (answer !== 'waiting') return answer
    await sleep(every)
  }
  return 'aborted'
}
