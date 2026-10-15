import { type BillingApi, type BillingOverview, CheckoutRefused } from '../billing'

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
  /** The paid plan, a switch waiting for the period end, cancelled, and what was paid. */
  billing?: {
    plan: 'month' | 'year'
    next: 'month' | 'year' | null
    canceled: boolean
    periodEnd: number
    payments: { id: string; at: number; plan: 'month' | 'year'; method?: 'card' | 'crypto' }[]
  }
  /** Paid by card (ListoPays): Pro until then, nothing renews (the fake `prepaid_until`). */
  prepaidUntil?: number
  /** Card orders on the fake server (`card_orders`). */
  cardOrders?: {
    id: string
    plan: 'month' | 'year'
    at: number
    status: 'pending' | 'paid' | 'failed'
    periodEnd?: number
  }[]
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

/** The fake checkout: paying turns Pro on, and it is a payment in the history. */
export function devCheckout(plan: 'month' | 'year' = 'month') {
  // As the real one: no subscription beside card time that still runs.
  if (prepaidNow(load())) throw new CheckoutRefused('prepaid_active')
  setDevPlanMode('pro')
  const s = load()
  const now = Date.now()
  const payments = s.billing?.payments ?? []
  save({
    ...s,
    billing: {
      plan,
      next: null,
      canceled: false,
      periodEnd: now + (plan === 'year' ? 365 : 30) * DAY,
      payments: [{ id: `pay_dev_${now}`, at: now, plan }, ...payments],
    },
  })
}

const PRICE = { month: 700, year: 6000 }

/** Card time runs (the fake `prepaid_now`). */
const prepaidNow = (s: DevPlanState) => (s.prepaidUntil ?? 0) > Date.now()
/** A Suby subscription renews (the fake `suby_renews`). */
const subyRenews = (s: DevPlanState) => s.mode === 'pro' && !s.billing?.canceled
/** A card order not paid within this long shows as expired (as `order-status` does). */
const ORDER_PENDING_FOR = 3 * 3_600_000

/**
 * The fake ListoPays webhook (`card_order_paid`): the order is paid, and the card time grows from
 * the end of what is paid (earlier card time, or a Suby period that does not renew).
 */
export function devCardPaid(orderId: string): boolean {
  const s = load()
  const order = s.cardOrders?.find((o) => o.id === orderId)
  if (!order || order.status === 'paid') return false
  const now = Date.now()
  const subyEnd = s.mode === 'pro' && s.billing ? s.billing.periodEnd : 0
  const base = Math.max(now, s.prepaidUntil ?? 0, subyEnd)
  const end = new Date(base)
  if (order.plan === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1)
  else end.setUTCMonth(end.getUTCMonth() + 1)
  order.status = 'paid'
  order.periodEnd = end.getTime()
  const billing = s.billing ?? {
    plan: order.plan,
    next: null,
    canceled: true,
    periodEnd: now,
    payments: [],
  }
  save({
    ...s,
    prepaidUntil: end.getTime(),
    subscribed: true,
    trialUsed: true,
    billing: {
      ...billing,
      payments: [
        { id: `card_${order.id}`, at: now, plan: order.plan, method: 'card' },
        ...billing.payments,
      ],
    },
  })
  return true
}

/** The fake `billing` function (supabase/functions/billing). */
export const devBilling: BillingApi = {
  overview: async () => devOverview(),
  cardCheckout: async (plan) => {
    const s = load()
    if (subyRenews(s)) throw new CheckoutRefused('subscription_active')
    const id = crypto.randomUUID()
    save({
      ...s,
      cardOrders: [...(s.cardOrders ?? []), { id, plan, at: Date.now(), status: 'pending' }],
    })
    // ListoPays' page, faked by the app itself (`DevCardPage`).
    const url = new URL(location.href)
    url.search = `?dev-backend&dev-card=${id}`
    url.hash = ''
    return { url: url.toString(), order: id }
  },
  orderStatus: async (id) => {
    const order = load().cardOrders?.find((o) => o.id === id)
    if (!order) throw new Error('No such order')
    const stale = order.status === 'pending' && Date.now() - order.at > ORDER_PENDING_FOR
    return {
      status: stale ? 'expired' : order.status,
      plan: order.plan,
      periodEnd: order.periodEnd ? new Date(order.periodEnd).toISOString() : null,
    }
  },
  receipt: async (id) => {
    if (!load().billing?.payments.some((p) => p.id === id)) throw new Error('No such payment')
    // A tiny real PDF, so saving and opening it works.
    return new TextEncoder().encode(DEV_PDF)
  },
  switchPlan: async (plan) => {
    const s = load()
    if (s.billing)
      save({ ...s, billing: { ...s.billing, next: plan === s.billing.plan ? null : plan } })
    return devOverview()
  },
  keepPlan: async () => {
    const s = load()
    if (s.billing) save({ ...s, billing: { ...s.billing, next: null } })
    return devOverview()
  },
  cancel: async () => {
    const s = load()
    if (s.billing) save({ ...s, billing: { ...s.billing, canceled: true, next: null } })
    return devOverview()
  },
}

function devOverview(): BillingOverview {
  const b = load().billing
  return {
    subscription:
      b && load().mode === 'pro'
        ? {
            plan: b.plan,
            status: 'active',
            cancelAtPeriodEnd: b.canceled,
            periodEnd: new Date(b.periodEnd).toISOString(),
            priceCents: PRICE[b.plan],
            currency: 'USD',
            next: b.next ? { plan: b.next, at: new Date(b.periodEnd).toISOString() } : null,
          }
        : null,
    payments: (b?.payments ?? []).map((p) => ({
      id: p.id,
      at: new Date(p.at).toISOString(),
      amountCents: PRICE[p.plan],
      currency: 'USD',
      status: 'paid',
      method: p.method ?? 'crypto',
      plan: p.plan,
    })),
  }
}

const DEV_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 52>>stream
BT /F1 14 Tf 20 60 Td (FixNote Pro receipt, dev) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`

/** The last day of the trial (to see the reminder). */
export function endDevTrialSoon() {
  save({ ...load(), mode: 'trial', trialEndsAt: Date.now() + DAY - 60_000 })
}

/** Back to a new account: Free, never paid, the trial still to take. */
export function resetDevAccount() {
  save({
    ...load(),
    mode: 'free',
    subscribed: false,
    trialUsed: false,
    billing: undefined,
    prepaidUntil: undefined,
    cardOrders: [],
  })
}

/** Spends the whole month's AI allowance (to see what running out looks like). */
export function spendDevAi() {
  const s = load()
  save({ ...s, tokens: s.mode === 'trial' ? LIMITS.trial : LIMITS.month })
}

/** Card time: two days left (to see the reminder before it ends). */
export function endDevPrepaidSoon() {
  save({ ...load(), prepaidUntil: Date.now() + 2 * DAY })
}

/** What the plan gives right now: card time counts as paid, also on top of a trial. */
const tier = (s: DevPlanState): 'free' | 'trial' | 'paid' =>
  s.mode === 'pro' || prepaidNow(s) ? 'paid' : s.mode === 'trial' ? 'trial' : 'free'

export const devIsPro = () => tier(load()) !== 'free'

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
    limit: tier(s) === 'free' ? 0 : tier(s) === 'trial' ? LIMITS.trial : LIMITS.month,
    today: s.requests,
    day_limit: LIMITS.dayRequests,
    resets_at: resetsAt(),
  }
}

/** The fake `my_plan()`. */
export function devMyPlan(storageUsed: number, notes: number): Record<string, unknown> {
  const s = load()
  const filesDeleteAt =
    tier(s) === 'free' && !s.subscribed && storageUsed > 0
      ? new Date(s.trialEndsAt + LIMITS.freeFilesDays * DAY).toISOString()
      : null
  return {
    plan: tier(s) === 'free' ? 'free' : 'pro',
    status:
      prepaidNow(s) && !subyRenews(s)
        ? 'prepaid'
        : s.mode === 'trial'
          ? 'trialing'
          : s.mode === 'pro'
            ? s.billing?.canceled
              ? 'canceled'
              : 'active'
            : 'free',
    beta: true,
    trial_ends_at: new Date(s.trialEndsAt).toISOString(),
    current_period_end:
      s.mode === 'pro'
        ? new Date(s.billing?.periodEnd ?? Date.now() + 30 * DAY).toISOString()
        : null,
    prepaid_until: s.prepaidUntil ? new Date(s.prepaidUntil).toISOString() : null,
    paid_before: s.subscribed,
    trial_available: !s.trialUsed && !s.subscribed,
    files_delete_at: filesDeleteAt,
    ai: aiStatus(s),
    storage: {
      used: storageUsed,
      limit: tier(s) === 'free' ? 0 : tier(s) === 'trial' ? LIMITS.trialStorage : LIMITS.storage,
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
  if (tier(s) === 'free') return refuse(402, 'pro_required', 'The assistant is part of FixNote Pro')
  if (ai.used >= ai.limit) return refuse(429, 'month_limit', 'This month’s AI allowance is used up')
  if (ai.today >= ai.day_limit) return refuse(429, 'day_limit', 'Today’s AI allowance is used up')
  return null
}

/** The fake `ai_record()`; a step that only brings tool results back is not a new request. */
export function devAiRecord(tokens: number, requests = 1) {
  const s = load()
  save({ ...s, tokens: s.tokens + Math.max(tokens, 0), requests: s.requests + requests })
}
