import { ChatError } from '@fixnote/ai'
import { i18n } from '@fixnote/i18n'
import { create } from 'zustand'

/**
 * The account's plan, as the server has it (`my_plan()` in supabase/migrations/*_plans.sql). Free
 * is everything on the device; Pro is what goes through the server. The server enforces it; the app
 * only uses it to explain, never to decide what is allowed.
 */
export interface PlanInfo {
  plan: 'free' | 'pro'
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'free'
  /** Only a label ("Beta"): plans work the same either way. */
  beta: boolean
  trialEndsAt: number | null
  periodEnd: number | null
  /** Paid at least once: its files are never removed from the server. */
  paidBefore: boolean
  /** The 7 free days of Pro are still there to take (`begin_trial`). */
  trialAvailable: boolean
  /** When the server copy of the files goes (Free, never paid, files on the server); else null. */
  filesDeleteAt: number | null
  /** What Pro did for the account (the note at the end of the trial). */
  usage: { notes: number; aiAnswers: number; files: number }
  ai: { used: number; limit: number; resetsAt: number; today: number; dayLimit: number }
  storage: { used: number; limit: number }
}

/** Suby's self-serve portal: cancel, change the card, receipts (by the account's email). */
export const SUBY_PORTAL = 'https://customer.suby.fi'

/** What a Free account is shown a "Pro" prompt for. */
export type ProFeature = 'sync' | 'ai' | 'share' | 'link' | 'integrations' | 'files'

interface PlanState {
  /** Null when signed out, or not known yet. */
  info: PlanInfo | null
  /** A "this is part of Pro" dialog on screen. */
  prompt: ProFeature | null
  /** The offer of the free trial on screen (`Paywall`). */
  paywall: boolean
}

/** The last plan the server gave, kept on this device so the app starts knowing it. */
const PLAN_KEY = 'fixnote.plan'

function lastKnown(): PlanInfo | null {
  try {
    return JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null') as PlanInfo | null
  } catch {
    return null
  }
}

export const usePlan = create<PlanState>()(() => ({
  info: lastKnown(),
  prompt: null,
  paywall: false,
}))

usePlan.subscribe((s, prev) => {
  if (s.info === prev.info) return
  try {
    if (s.info) localStorage.setItem(PLAN_KEY, JSON.stringify(s.info))
    else localStorage.removeItem(PLAN_KEY)
  } catch {
    // Private window: it is fetched again next time.
  }
})

/** Shows the offer of the free trial. */
export const showPaywall = () => usePlan.setState({ paywall: true, prompt: null })

/** Signed in on Free (not signed out, not unknown). */
export const isFree = () => usePlan.getState().info?.plan === 'free'

/**
 * Runs `action` unless the account is on Free, in which case it explains Pro instead. Signed out
 * or not known yet, the action runs: its own sign-in step or the server has the last word.
 */
export function withPro(feature: ProFeature, action: () => void) {
  if (isFree()) usePlan.setState({ prompt: feature })
  else action()
}

export const showProPrompt = (feature: ProFeature) => usePlan.setState({ prompt: feature })

/** The server refused a write because the account is on Free. */
export const isProRequired = (err: unknown) =>
  /pro_required/.test(err instanceof Error ? err.message : String(err))

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(i18n.resolvedLanguage) : ''

/** FixNote AI's refusal (plan or allowance) in the UI language, or null for other errors. */
export function aiRefusalText(err: unknown): string | null {
  if (!(err instanceof ChatError) || !err.code) return null
  switch (err.code) {
    case 'pro_required':
      return i18n.t('plan.aiNeedsPro')
    case 'month_limit':
      return i18n.t('plan.aiMonthLimit', { date: day(err.resetsAt) })
    case 'day_limit':
      return i18n.t('plan.aiDayLimit')
    case 'paused':
      return i18n.t('plan.aiPaused')
    default:
      return null
  }
}

/** Raw `my_plan()` JSON → PlanInfo. */
export function toPlanInfo(raw: Record<string, unknown>): PlanInfo {
  const time = (v: unknown) => (typeof v === 'string' && v ? Date.parse(v) : null)
  const num = (v: unknown) => Number(v ?? 0)
  const ai = (raw.ai ?? {}) as Record<string, unknown>
  const storage = (raw.storage ?? {}) as Record<string, unknown>
  const usage = (raw.usage ?? {}) as Record<string, unknown>
  return {
    plan: raw.plan === 'pro' ? 'pro' : 'free',
    status: (raw.status as PlanInfo['status']) ?? 'free',
    beta: raw.beta === true,
    trialEndsAt: time(raw.trial_ends_at),
    periodEnd: time(raw.current_period_end),
    paidBefore: raw.paid_before === true,
    trialAvailable: raw.trial_available === true,
    filesDeleteAt: time(raw.files_delete_at),
    usage: {
      notes: num(usage.notes),
      aiAnswers: num(usage.ai_answers),
      files: num(usage.files),
    },
    ai: {
      used: num(ai.used),
      limit: num(ai.limit),
      resetsAt: time(ai.resets_at) ?? 0,
      today: num(ai.today),
      dayLimit: num(ai.day_limit),
    },
    storage: { used: num(storage.used), limit: num(storage.limit) },
  }
}
