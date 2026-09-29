/**
 * `?dev-backend`: the account's plan on the fake server, with the rules of the real one
 * (supabase/migrations/*_plans.sql) and a switch in Settings → Plan to try every state. Kept in
 * localStorage like the rest of the fake server.
 */

export type DevPlanMode = 'trial' | 'pro' | 'free'

interface DevPlanState {
  mode: DevPlanMode
  trialEndsAt: number
  /** Paid once: files are never removed from the server. */
  subscribed: boolean
  /** The trial was started (once per account). */
  trialUsed: boolean
  month: string
  tokens: number
  day: string
  requests: number
}

const KEY = 'fixnote.dev-plan'
const DAY = 86_400_000
/** Small, so "used up" is easy to reach while trying things. */
const LIMITS = {
  month: 200_000,
  trial: 50_000,
  dayRequests: 150,
  storage: 20 * 1024 ** 3,
  trialStorage: 1024 ** 3,
  freeFilesDays: 90,
}

const today = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => today().slice(0, 7)

function load(): DevPlanState {
  const fresh: DevPlanState = {
    mode: 'free',
    trialEndsAt: Date.now() + 7 * DAY,
    subscribed: false,
    trialUsed: false,
    month: thisMonth(),
    tokens: 0,
    day: today(),
    requests: 0,
  }
  try {
    const s = { ...fresh, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as DevPlanState) }
    if (s.month !== thisMonth()) Object.assign(s, { month: thisMonth(), tokens: 0 })
    if (s.day !== today()) Object.assign(s, { day: today(), requests: 0 })
    // Saved before the beta became only a label.
    if ((s.mode as string) === 'beta') s.mode = 'trial'
    return s
  } catch {
    return fresh
  }
}

const save = (s: DevPlanState) => localStorage.setItem(KEY, JSON.stringify(s))

export const devPlanMode = () => load().mode

/** Free after the trial means the trial just ended; Pro means paid. */
export function setDevPlanMode(mode: DevPlanMode) {
  const s = load()
  save({
    ...s,
    mode,
    trialEndsAt:
      mode === 'trial'
        ? Date.now() + 7 * DAY
        : mode === 'free'
          ? Date.now() - 60_000
          : s.trialEndsAt,
    subscribed: s.subscribed || mode === 'pro',
    trialUsed: s.trialUsed || mode !== 'free',
  })
}

/** The fake `begin_trial()`: once per account, never after a subscription. */
export function devStartTrial() {
  const s = load()
  if (s.trialUsed || s.subscribed) throw new Error('trial_unavailable')
  setDevPlanMode('trial')
}

/** The fake checkout: paying turns Pro on. */
export const devCheckout = () => setDevPlanMode('pro')

/** The last day of the trial (to see the reminder). */
export function endDevTrialSoon() {
  save({ ...load(), mode: 'trial', trialEndsAt: Date.now() + DAY - 60_000 })
}

/** Back to a new account: Free, never paid, the trial still to take. */
export function resetDevAccount() {
  save({ ...load(), mode: 'free', subscribed: false, trialUsed: false })
}

/** Spends the whole month's AI allowance (to see what running out looks like). */
export function spendDevAi() {
  const s = load()
  save({ ...s, tokens: s.mode === 'trial' ? LIMITS.trial : LIMITS.month })
}

export const devIsPro = () => load().mode !== 'free'

/** What the real triggers raise when a Free account writes something that needs Pro. */
export function devRequirePro() {
  if (!devIsPro()) throw new Error('pro_required')
}

const resetsAt = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
}

function aiStatus(s: DevPlanState) {
  return {
    used: s.tokens,
    limit: s.mode === 'free' ? 0 : s.mode === 'trial' ? LIMITS.trial : LIMITS.month,
    today: s.requests,
    day_limit: LIMITS.dayRequests,
    resets_at: resetsAt(),
  }
}

/** The fake `my_plan()`. */
export function devMyPlan(storageUsed: number, notes: number): Record<string, unknown> {
  const s = load()
  const filesDeleteAt =
    s.mode === 'free' && !s.subscribed && storageUsed > 0
      ? new Date(s.trialEndsAt + LIMITS.freeFilesDays * DAY).toISOString()
      : null
  return {
    plan: s.mode === 'free' ? 'free' : 'pro',
    status: s.mode === 'trial' ? 'trialing' : s.mode === 'pro' ? 'active' : 'free',
    beta: true,
    trial_ends_at: new Date(s.trialEndsAt).toISOString(),
    current_period_end: s.mode === 'pro' ? new Date(Date.now() + 30 * DAY).toISOString() : null,
    paid_before: s.subscribed,
    trial_available: !s.trialUsed && !s.subscribed,
    files_delete_at: filesDeleteAt,
    ai: aiStatus(s),
    storage: {
      used: storageUsed,
      limit: s.mode === 'free' ? 0 : s.mode === 'trial' ? LIMITS.trialStorage : LIMITS.storage,
    },
    usage: { notes, ai_answers: s.requests, files: storageUsed },
  }
}

/** The fake `ai_allowance()`: null when the request may go, else the refusal llm-proxy sends. */
export function devAiRefusal(): Response | null {
  const s = load()
  const ai = aiStatus(s)
  const refuse = (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ error: { message, code, resetsAt: ai.resets_at } }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  if (s.mode === 'free') return refuse(402, 'pro_required', 'The assistant is part of FixNote Pro')
  if (ai.used >= ai.limit) return refuse(429, 'month_limit', 'This month’s AI allowance is used up')
  if (ai.today >= ai.day_limit) return refuse(429, 'day_limit', 'Today’s AI allowance is used up')
  return null
}

/** The fake `ai_record()`; a step that only brings tool results back is not a new request. */
export function devAiRecord(tokens: number, requests = 1) {
  const s = load()
  save({ ...s, tokens: s.tokens + Math.max(tokens, 0), requests: s.requests + requests })
}
