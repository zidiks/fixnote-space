/**
 * suby-webhook: Suby's signed events about payments and subscriptions set the account's plan
 * (`subscriptions`, supabase/migrations/*_plans.sql). Every event is checked (HMAC-SHA256 of
 * "timestamp.body" with the endpoint secret, at most 5 minutes old), and the subscription's state is
 * read back from Suby rather than trusted from the event, so events arriving twice or out of order
 * end in the same place. Revoked right away on a refund or a chargeback.
 */

import type { Suby, SubySubscription } from '../_shared/suby.ts'

export type PlanStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface SubscriptionRow {
  status: PlanStatus
  currentPeriodEnd: string | null
  /** Set while the subscription is in its free trial (the card is on file, not charged yet). */
  trialEndsAt?: string | null
  customerId: string | null
  subscriptionId: string
}

export interface BillingStore {
  /** The event was handled before. */
  seen(eventId: string): Promise<boolean>
  markSeen(eventId: string, type: string): Promise<void>
  userBySubscription(subscriptionId: string): Promise<string | null>
  userByCustomer(customerId: string): Promise<string | null>
  userByEmail(email: string): Promise<string | null>
  save(userId: string, row: SubscriptionRow): Promise<void>
}

export interface WebhookDeps {
  secret: string | undefined
  suby: Suby | null
  store: BillingStore
  now?: () => number
}

const RELEVANT = new Set([
  'payment.succeeded',
  'payment.refunded',
  'subscription.created',
  'subscription.renewed',
  'subscription.past_due',
  'subscription.updated',
  'subscription.canceled',
  'subscription.expired',
  'dispute.opened',
  'dispute.won',
])
/** Events after which Pro ends now, whatever the subscription says. */
const REVOKE = new Set(['payment.refunded', 'dispute.opened'])

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function validSignature(secret: string, timestamp: string, body: string, signature: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = `v1=${hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)))}`
  // Constant time: the same length and every character compared.
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

/** Our plan status from Suby's subscription; null while it is not paid for yet. */
export function planFromSubscription(
  s: SubySubscription,
  nowIso: string,
): Pick<SubscriptionRow, 'status' | 'currentPeriodEnd' | 'trialEndsAt'> | null {
  switch (s.status) {
    case 'TRIALING': {
      // The trial: Pro until it ends, even when the first charge was cancelled in the meantime.
      const end = s.trialEndAt ?? s.currentCycleDueAt
      return s.cancelAtPeriodEnd
        ? { status: 'canceled', currentPeriodEnd: end }
        : { status: 'trialing', currentPeriodEnd: end, trialEndsAt: end }
    }
    case 'ACTIVE':
      // A cancellation that waits for the period end: Pro until then.
      return {
        status: s.cancelAtPeriodEnd ? 'canceled' : 'active',
        currentPeriodEnd: s.currentCycleDueAt,
      }
    case 'PAST_DUE':
      // Suby takes access away on the first failed renewal and gives it back if a retry pays.
      return { status: 'past_due', currentPeriodEnd: nowIso }
    case 'CANCELED':
    case 'EXPIRED':
    case 'PAUSED':
      return { status: 'canceled', currentPeriodEnd: s.endedAt ?? nowIso }
    default:
      return null
  }
}

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

export async function handle(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!deps.secret || !deps.suby) return new Response('Not configured', { status: 503 })
  const body = await req.text()
  const timestamp = req.headers.get('x-webhook-timestamp') ?? ''
  const signature = req.headers.get('x-webhook-signature') ?? ''
  const now = (deps.now ?? Date.now)()
  if (!timestamp || Math.abs(now / 1000 - Number(timestamp)) > 300) {
    return new Response('Stale or missing timestamp', { status: 401 })
  }
  if (!(await validSignature(deps.secret, timestamp, body, signature))) {
    return new Response('Bad signature', { status: 401 })
  }

  let event: { id?: string; type?: string; data?: Data }
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  const type = event.type ?? req.headers.get('x-webhook-event') ?? ''
  const id = event.id ?? ''
  const data = event.data ?? {}
  if (!id || !RELEVANT.has(type)) return new Response('ok')
  if (await deps.store.seen(id)) return new Response('ok')

  // Which subscription and whose: events name them in snake_case, the API in camelCase.
  const field = (snake: string, camel: string) => str(data[snake]) ?? str(data[camel])
  let subscriptionId =
    data.object === 'subscription' ? str(data.id) : field('subscription_id', 'subscriptionId')
  if (!subscriptionId && data.object === 'dispute') {
    const payment = field('payment_id', 'paymentId')
    subscriptionId = payment ? await deps.suby.paymentSubscription(payment) : null
  }
  if (!subscriptionId) {
    // A one-time payment, not FixNote Pro: nothing to do.
    await deps.store.markSeen(id, type)
    return new Response('ok')
  }

  const sub = await deps.suby.subscription(subscriptionId)
  if (!sub) return new Response('Subscription not found', { status: 404 })
  const customerId = sub.customerId ?? field('customer_id', 'customerId')
  const metadata = (data.metadata ?? {}) as Record<string, unknown>
  const user =
    str(metadata.user_id) ??
    (await deps.store.userBySubscription(subscriptionId)) ??
    (customerId ? await deps.store.userByCustomer(customerId) : null) ??
    (sub.customer?.email ? await deps.store.userByEmail(sub.customer.email) : null)
  if (!user) {
    // Answer an error so Suby retries: the event naming the account may still be on its way.
    console.error('no FixNote account for subscription', subscriptionId)
    return new Response('Unknown account', { status: 409 })
  }

  const nowIso = new Date(now).toISOString()
  const plan = REVOKE.has(type)
    ? { status: 'canceled' as const, currentPeriodEnd: nowIso }
    : planFromSubscription(sub, nowIso)
  if (plan) await deps.store.save(user, { ...plan, customerId, subscriptionId })
  await deps.store.markSeen(id, type)
  return new Response('ok')
}
