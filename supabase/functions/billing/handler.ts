/**
 * billing: the signed-in account's subscription, through Suby (the key never leaves here).
 * - `checkout` (the default): a Suby checkout for FixNote Pro, monthly or yearly. It carries the
 *   account's email (Suby's customer) and id (metadata), which suby-webhook uses to give the
 *   account Pro once the payment goes through.
 * - `overview`: the subscription as Suby has it (plan, period, a switch waiting) and its payments.
 * - `receipt`: one of the account's payments as a PDF invoice.
 * - `switch` / `keep-plan`: change to the other plan at the end of the paid period, or call that off.
 * - `cancel`: no renewal; Pro stays until the end of the paid period.
 * Bought in the desktop app (`app: true`), the buyer comes back to a page that hands over to the
 * app (`?billing=success&to=app`, which opens fixnote://) instead of to the web app.
 *
 * Card payments go through ListoPays instead (_shared/listopays.ts): no subscription, a prepaid
 * month or year that starts where the paid time ends.
 * - `card-checkout`: opens an order and ListoPays' payment page for it (refused while a Suby
 *   subscription renews: that would pay twice). listopays-webhook settles the order.
 * - `order-status`: the order as the server has it; the device that opened it asks until it is
 *   paid (ListoPays' return pages are the same for everyone, so they cannot say whose order it was).
 * `overview` lists the card payments too, and `receipt` makes our own PDF for them (ListoPays has
 * no receipts). A Suby checkout is refused while card time runs (it would start a second period).
 */

import { CORS, jsonError, rateLimiter, userEmail, userId } from '../_shared/auth.ts'
import { CARD_PRICES, type ListoPays, receiptPdf } from '../_shared/listopays.ts'
import type { Suby, SubyPayment, SubySubscription } from '../_shared/suby.ts'

export interface CardOrder {
  id: string
  plan: 'month' | 'year'
  amount: number
  currency: string
  status: 'pending' | 'paid' | 'failed' | 'expired'
  createdAt: string
  paidAt: string | null
  paidAmount: number | null
  periodStart: string | null
  periodEnd: string | null
  transactionId: string | null
}

/** The account's card orders and plan row (`card_orders`, `subscriptions`; service role). */
export interface CardStore {
  /** Whether a Suby subscription renews by itself, and until when card time runs. */
  state(userId: string): Promise<{ subyRenews: boolean; prepaidUntil: string | null }>
  /** The ListoPays customer made for the account before, if any. */
  customer(userId: string): Promise<string | null>
  createOrder(
    userId: string,
    order: { plan: 'month' | 'year'; amount: number; currency: string; customerId: string },
  ): Promise<string>
  failOrder(id: string): Promise<void>
  /** One of the account's orders. */
  order(userId: string, id: string): Promise<CardOrder | null>
  /** The account's paid orders, newest first. */
  paidOrders(userId: string, limit: number): Promise<CardOrder[]>
}

export interface CardDeps {
  api: ListoPays | null
  store: CardStore
  now?: () => number
}

/** An order nobody paid within this long is shown as expired (a late payment still counts). */
const ORDER_PENDING_FOR = 3 * 3_600_000
const CARD_ID = 'card_'
const cardLimit = rateLimiter()

export interface BillingEnv {
  products: { month: string | undefined; year: string | undefined }
  /** Where Suby sends the buyer back to (the web app, or its page that opens the desktop app). */
  returnUrl: string
}

export function envFromDeno(): BillingEnv {
  return {
    products: {
      month: Deno.env.get('SUBY_PRODUCT_MONTH'),
      year: Deno.env.get('SUBY_PRODUCT_YEAR'),
    },
    returnUrl: Deno.env.get('BILLING_RETURN_URL') ?? 'https://app.fixnote.space/',
  }
}

/** The account's Suby ids, from `subscriptions` (written by suby-webhook). */
export interface BillingAccounts {
  of(userId: string): Promise<{ subscriptionId: string | null; customerId: string | null } | null>
  /** After a cancellation: Pro until the end of the paid period (the webhook says the same). */
  canceled(userId: string, periodEnd: string | null): Promise<void>
}

type Plan = 'month' | 'year'

export interface BillingOverview {
  subscription: {
    plan: Plan | null
    status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' | 'other'
    /** Ends at `periodEnd` instead of renewing. */
    cancelAtPeriodEnd: boolean
    periodEnd: string | null
    priceCents: number | null
    currency: string | null
    /** A switch to the other plan at the end of the period. */
    next: { plan: Plan | null; at: string } | null
  } | null
  payments: {
    id: string
    at: string
    amountCents: number | null
    currency: string | null
    status: 'paid' | 'refunded' | 'processing'
    method: 'crypto' | 'card'
    plan: Plan | null
  }[]
}

const HISTORY = 24
/** Payments worth listing: paid, refunded, or on their way (crypto still confirming). */
const SHOWN: Record<string, BillingOverview['payments'][number]['status']> = {
  COMPLETED: 'paid',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'refunded',
  RECEIVED: 'processing',
  BRIDGING: 'processing',
  AUTHORIZED: 'processing',
}

const STATUS: Record<string, NonNullable<BillingOverview['subscription']>['status']> = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json' } })

export async function handle(
  req: Request,
  env: BillingEnv,
  suby: Suby | null,
  accounts?: BillingAccounts,
  card?: CardDeps,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')
  const user = userId(req)
  const email = userEmail(req)
  if (!user || !email) return jsonError(401, 'Sign in first')

  let body: {
    action?: unknown
    plan?: unknown
    app?: unknown
    paymentId?: unknown
    order?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonError(400, 'Invalid JSON')
  }
  const action = body.action ?? 'checkout'
  const paymentId = typeof body.paymentId === 'string' ? body.paymentId : ''
  if (
    action === 'card-checkout' ||
    action === 'order-status' ||
    (action === 'receipt' && paymentId.startsWith(CARD_ID)) ||
    (action === 'overview' && card && (!suby || !accounts))
  ) {
    if (!card) return jsonError(503, 'Payments are not set up yet')
    return cardAction(action, body, { user, email, card }).catch((err: unknown) => {
      console.error(`billing ${String(action)} failed`, err instanceof Error ? err.message : err)
      return jsonError(502, 'Could not open the payment page')
    })
  }
  if (action !== 'checkout') {
    if (!suby || !accounts) return jsonError(503, 'Payments are not set up yet')
    return manage(action, body, { user, email, env, suby, accounts, card }).catch(
      (err: unknown) => {
        console.error(`billing ${String(action)} failed`, err instanceof Error ? err.message : err)
        return jsonError(502, 'Suby did not answer')
      },
    )
  }
  const plan = body.plan === 'year' ? 'year' : body.plan === 'month' ? 'month' : null
  if (!plan) return jsonError(400, 'Plan must be "month" or "year"')
  const productId = env.products[plan]
  if (!suby || !productId) return jsonError(503, 'Payments are not set up yet')
  // Card time still runs: a subscription now would start a second paid period beside it.
  if (card) {
    const { prepaidUntil } = await card.store.state(user)
    if (prepaidUntil && Date.parse(prepaidUntil) > (card.now ?? Date.now)()) {
      return jsonError(409, 'Pro is paid by card until then', { code: 'prepaid_active' })
    }
  }

  const back = new URL(env.returnUrl)
  const to = body.app === true ? '&to=app' : ''
  const url = await suby
    .checkout({
      productId,
      email,
      userId: user,
      successUrl: new URL(`?billing=success${to}`, back).toString(),
      cancelUrl: new URL(`?billing=cancel${to}`, back).toString(),
    })
    .catch((err: unknown) => {
      console.error('checkout failed', err instanceof Error ? err.message : err)
      return null
    })
  return url ? json({ url }) : jsonError(502, 'Could not open the payment page')
}

interface Ctx {
  user: string
  email: string
  env: BillingEnv
  suby: Suby
  accounts: BillingAccounts
  card?: CardDeps
}

async function manage(
  action: unknown,
  body: { plan?: unknown; paymentId?: unknown },
  ctx: Ctx,
): Promise<Response> {
  const { suby, env } = ctx
  const ids = await ctx.accounts.of(ctx.user)
  const subscriptionId = ids?.subscriptionId ?? null
  const live = subscriptionId ? await suby.subscriptionWithChange(subscriptionId) : null
  // Suby's customer for this account: kept by the webhook, else found by the account's email.
  const customerId =
    ids?.customerId ?? live?.subscription.customerId ?? (await suby.customerByEmail(ctx.email))
  const planOf = (productId: string | null | undefined): Plan | null =>
    productId === env.products.year ? 'year' : productId === env.products.month ? 'month' : null

  switch (action) {
    case 'overview':
      return json(await overview(ctx, live, customerId, planOf))
    case 'receipt': {
      const id = typeof body.paymentId === 'string' ? body.paymentId : ''
      const payment = id ? await suby.payment(id) : null
      // Only the account's own payments.
      if (!payment || !customerId || payment.customerId !== customerId) {
        return jsonError(404, 'No such payment')
      }
      const pdf = await suby.receiptPdf(id)
      if (!pdf) return jsonError(404, 'No receipt')
      return json({ pdf: toBase64(pdf) })
    }
    case 'switch': {
      const plan = body.plan === 'year' ? 'year' : body.plan === 'month' ? 'month' : null
      const productId = plan ? env.products[plan] : undefined
      if (!live || !productId) return jsonError(400, 'Nothing to switch')
      if (planOf(live.subscription.productId) !== plan) {
        await suby.changePlan(live.subscription.id, productId)
      }
      return json(
        await overview(
          ctx,
          await suby.subscriptionWithChange(live.subscription.id),
          customerId,
          planOf,
        ),
      )
    }
    case 'keep-plan': {
      if (!live) return jsonError(400, 'No subscription')
      if (live.scheduledChange) await suby.cancelPlanChange(live.subscription.id)
      return json(
        await overview(
          ctx,
          await suby.subscriptionWithChange(live.subscription.id),
          customerId,
          planOf,
        ),
      )
    }
    case 'cancel': {
      if (!live) return jsonError(400, 'No subscription')
      const after = (await suby.cancel(live.subscription.id)) ?? live.subscription
      await ctx.accounts.canceled(ctx.user, after.currentCycleDueAt ?? null)
      return json(
        await overview(
          ctx,
          await suby.subscriptionWithChange(live.subscription.id),
          customerId,
          planOf,
        ),
      )
    }
    default:
      return jsonError(400, 'Unknown action')
  }
}

async function overview(
  ctx: Ctx,
  live: Awaited<ReturnType<Suby['subscriptionWithChange']>>,
  customerId: string | null,
  planOf: (productId: string | null | undefined) => Plan | null,
): Promise<BillingOverview> {
  const [payments, cards] = await Promise.all([
    customerId ? ctx.suby.payments(customerId, HISTORY) : ([] as SubyPayment[]),
    ctx.card ? ctx.card.store.paidOrders(ctx.user, HISTORY) : ([] as CardOrder[]),
  ])
  const s: SubySubscription | undefined = live?.subscription
  const change = live?.scheduledChange
  const pending = change && !change.appliedAt && !change.canceledAt ? change : null
  const subyPayments: BillingOverview['payments'] = payments.flatMap((p) => {
    const status = SHOWN[p.status]
    if (!status) return []
    return [
      {
        id: p.id,
        at: p.paymentConfirmedAt ?? p.createdAt,
        amountCents: p.grossAmountCents ?? (p.priceCents ? Number(p.priceCents) : null),
        currency: p.currency ?? null,
        status,
        method: p.rail === 'card' ? 'card' : 'crypto',
        plan: planOf(p.productId),
      },
    ]
  })
  return {
    subscription: s
      ? {
          plan: planOf(s.productId),
          status: STATUS[s.status] ?? 'other',
          cancelAtPeriodEnd: s.cancelAtPeriodEnd,
          periodEnd: s.trialEndAt ?? s.currentCycleDueAt ?? s.endedAt ?? null,
          priceCents: s.priceCents ? Number(s.priceCents) : null,
          currency: s.currency ?? null,
          next: pending ? { plan: planOf(pending.targetPriceId), at: pending.scheduledFor } : null,
        }
      : null,
    payments: [...subyPayments, ...cards.map(cardPayment)]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, HISTORY),
  }
}

/** A paid card order as a row of the history. */
function cardPayment(o: CardOrder): BillingOverview['payments'][number] {
  return {
    id: `${CARD_ID}${o.id}`,
    at: o.paidAt ?? o.createdAt,
    amountCents: Math.round((o.paidAmount ?? o.amount) * 100),
    currency: o.currency,
    status: 'paid',
    method: 'card',
    plan: o.plan,
  }
}

async function cardAction(
  action: unknown,
  body: { plan?: unknown; paymentId?: unknown; order?: unknown },
  { user, email, card }: { user: string; email: string; card: CardDeps },
): Promise<Response> {
  const now = (card.now ?? Date.now)()
  switch (action) {
    case 'card-checkout': {
      const plan = body.plan === 'year' ? 'year' : body.plan === 'month' ? 'month' : null
      if (!plan) return jsonError(400, 'Plan must be "month" or "year"')
      const api = card.api
      if (!api) return jsonError(503, 'Payments are not set up yet')
      if (!cardLimit(user, 10, now)) return jsonError(429, 'Too many payment pages')
      // A subscription that renews by itself would be paid twice.
      if ((await card.store.state(user)).subyRenews) {
        return jsonError(409, 'A subscription is running', { code: 'subscription_active' })
      }
      const { amount, currency } = CARD_PRICES[plan]
      const customerId =
        (await card.store.customer(user)) ??
        (await api.createCustomer({ name: email.split('@')[0] || email, email }))
      const order = await card.store.createOrder(user, { plan, amount, currency, customerId })
      let url: string
      try {
        url = await api.createPayment({ customer: customerId, order, amount, currency })
      } catch (err) {
        await card.store.failOrder(order)
        throw err
      }
      return json({ url, order })
    }
    case 'order-status': {
      const id = typeof body.order === 'string' ? body.order : ''
      const order = id ? await card.store.order(user, id) : null
      if (!order) return jsonError(404, 'No such order')
      const stale = order.status === 'pending' && now - Date.parse(order.createdAt) > ORDER_PENDING_FOR
      return json({
        status: stale ? 'expired' : order.status,
        plan: order.plan,
        periodEnd: order.periodEnd,
      })
    }
    case 'overview': {
      const orders = await card.store.paidOrders(user, HISTORY)
      return json({ subscription: null, payments: orders.map(cardPayment) } satisfies BillingOverview)
    }
    case 'receipt': {
      const id = typeof body.paymentId === 'string' ? body.paymentId.slice(CARD_ID.length) : ''
      const order = id ? await card.store.order(user, id) : null
      // Only the account's own, paid orders.
      if (!order || order.status !== 'paid') return jsonError(404, 'No such payment')
      const date = (iso: string | null) => (iso ?? '').slice(0, 10)
      const paid = (order.paidAmount ?? order.amount).toFixed(2)
      const pdf = receiptPdf([
        'FixNote Pro - receipt',
        `Date: ${date(order.paidAt)}`,
        `Plan: FixNote Pro, ${order.plan === 'year' ? '1 year' : '1 month'}, prepaid (no automatic renewal)`,
        `Pro from ${date(order.periodStart)} to ${date(order.periodEnd)}`,
        `Amount: ${paid} ${order.currency}`,
        'Paid by card through ListoPays',
        `Account: ${email}`,
        `Order: ${order.id}`,
        `Transaction: ${order.transactionId ?? ''}`,
        'FixNote - https://fixnote.space',
      ])
      return json({ pdf: toBase64(pdf) })
    }
    default:
      return jsonError(400, 'Unknown action')
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}
