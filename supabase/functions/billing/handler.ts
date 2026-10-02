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
 */

import { CORS, jsonError, userEmail, userId } from '../_shared/auth.ts'
import type { Suby, SubyPayment, SubySubscription } from '../_shared/suby.ts'

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
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')
  const user = userId(req)
  const email = userEmail(req)
  if (!user || !email) return jsonError(401, 'Sign in first')

  let body: { action?: unknown; plan?: unknown; app?: unknown; paymentId?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonError(400, 'Invalid JSON')
  }
  const action = body.action ?? 'checkout'
  if (action !== 'checkout') {
    if (!suby || !accounts) return jsonError(503, 'Payments are not set up yet')
    return manage(action, body, { user, email, env, suby, accounts }).catch((err: unknown) => {
      console.error(`billing ${String(action)} failed`, err instanceof Error ? err.message : err)
      return jsonError(502, 'Suby did not answer')
    })
  }
  const plan = body.plan === 'year' ? 'year' : body.plan === 'month' ? 'month' : null
  if (!plan) return jsonError(400, 'Plan must be "month" or "year"')
  const productId = env.products[plan]
  if (!suby || !productId) return jsonError(503, 'Payments are not set up yet')

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
  const payments: SubyPayment[] = customerId ? await ctx.suby.payments(customerId, HISTORY) : []
  const s: SubySubscription | undefined = live?.subscription
  const change = live?.scheduledChange
  const pending = change && !change.appliedAt && !change.canceledAt ? change : null
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
    payments: payments.flatMap((p) => {
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
    }),
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}
