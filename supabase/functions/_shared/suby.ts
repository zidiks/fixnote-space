/**
 * Suby.fi API v3 (https://docs.suby.fi/v3-beta): the few calls FixNote needs. The key's prefix picks
 * the environment (sk_sandbox_… or sk_live_…); it lives only in the edge functions' secrets.
 */

export const SUBY_API = 'https://api.beta.suby.fi'

export interface SubySubscription {
  id: string
  customerId: string | null
  status: string
  cancelAtPeriodEnd: boolean
  /** End of the free trial, while there is one. */
  trialEndAt?: string | null
  /** When the paid period ends (the next renewal). */
  currentCycleDueAt: string | null
  endedAt: string | null
  customer?: { id?: string; email?: string } | null
  /** The plan (recurring product) it bills. */
  productId?: string
  /** The price agreed at subscribe time, in minor units. */
  priceCents?: string | null
  currency?: string | null
}

/** A plan switch waiting for the period end (pending while not applied or canceled). */
export interface SubyScheduledChange {
  type: string
  targetPriceId: string | null
  scheduledFor: string
  appliedAt: string | null
  canceledAt: string | null
}

export interface SubyPayment {
  id: string
  rail?: 'card' | 'crypto'
  customerId: string | null
  productId: string | null
  subscriptionId: string | null
  status: string
  priceCents?: string | null
  grossAmountCents?: number | null
  currency?: string | null
  refundedAmountCents?: number | null
  createdAt: string
  paymentConfirmedAt?: string | null
}

export interface Suby {
  /** A hosted checkout page for a subscription to `productId`; returns its URL. */
  checkout(req: {
    productId: string
    email: string
    userId: string
    successUrl: string
    cancelUrl: string
  }): Promise<string>
  subscription(id: string): Promise<SubySubscription | null>
  /** The subscription with the plan switch it waits for, if any. */
  subscriptionWithChange(
    id: string,
  ): Promise<{ subscription: SubySubscription; scheduledChange: SubyScheduledChange | null } | null>
  /** The subscription a payment belongs to (for disputes, which name only the payment). */
  paymentSubscription(id: string): Promise<string | null>
  payment(id: string): Promise<SubyPayment | null>
  /** A customer's payments, newest first. */
  payments(customerId: string, limit: number): Promise<SubyPayment[]>
  /** The receipt of a payment as a PDF invoice. */
  receiptPdf(paymentId: string): Promise<Uint8Array | null>
  /** The customer with this email, if Suby has one. */
  customerByEmail(email: string): Promise<string | null>
  /** Ends the subscription at the end of the paid period. */
  cancel(subscriptionId: string): Promise<SubySubscription | null>
  /** Switches the plan at the end of the paid period (nothing is charged now). */
  changePlan(subscriptionId: string, productId: string): Promise<void>
  /** Drops a plan switch that has not happened yet. */
  cancelPlanChange(subscriptionId: string): Promise<void>
}

export function subyApi(key: string, fetcher: typeof fetch = fetch, base = SUBY_API): Suby {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T | null> => {
    const res = await fetcher(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Suby-Api-Key': key, ...init.headers },
    })
    if (res.status === 404) return null
    const body = (await res.json().catch(() => null)) as {
      success?: boolean
      data?: T
      error?: { message?: string }
    } | null
    if (!res.ok || !body?.success) {
      throw new Error(`Suby ${res.status}: ${body?.error?.message ?? 'request failed'}`)
    }
    return body.data ?? null
  }
  return {
    async checkout({ productId, email, userId, successUrl, cancelUrl }) {
      const data = await call<{ url?: string }>('/v3/checkout/sessions', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'subscription',
          productId,
          customer: { email },
          metadata: { user_id: userId },
          successUrl,
          cancelUrl,
        }),
      })
      if (!data?.url) throw new Error('Suby: no checkout URL')
      return data.url
    },
    async subscription(id) {
      const data = await call<{ subscription?: SubySubscription }>(
        `/v3/subscriptions/${encodeURIComponent(id)}?expand=customer`,
      )
      return data?.subscription ?? null
    },
    async subscriptionWithChange(id) {
      const data = await call<{
        subscription?: SubySubscription
        scheduledChange?: SubyScheduledChange | null
      }>(`/v3/subscriptions/${encodeURIComponent(id)}`)
      return data?.subscription
        ? { subscription: data.subscription, scheduledChange: data.scheduledChange ?? null }
        : null
    },
    async payment(id) {
      return call<SubyPayment>(`/v3/payments/${encodeURIComponent(id)}`)
    },
    async payments(customerId, limit) {
      const query = new URLSearchParams({ customerId, limit: String(limit) })
      const data = await call<{ items?: SubyPayment[] }>(`/v3/payments?${query}`)
      return (data?.items ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async receiptPdf(paymentId) {
      // Raw PDF bytes, not the JSON envelope.
      const res = await fetcher(
        `${base}/v3/payments/${encodeURIComponent(paymentId)}/receipt.pdf`,
        { headers: { 'X-Suby-Api-Key': key } },
      )
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Suby ${res.status}: receipt failed`)
      return new Uint8Array(await res.arrayBuffer())
    },
    async customerByEmail(email) {
      const data = await call<{ items?: { id: string }[] }>(
        `/v3/customers?${new URLSearchParams({ email, limit: '1' })}`,
      )
      return data?.items?.[0]?.id ?? null
    },
    async cancel(subscriptionId) {
      const data = await call<{ subscription?: SubySubscription }>(
        `/v3/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
        { method: 'POST', body: JSON.stringify({ atPeriodEnd: true }) },
      )
      return data?.subscription ?? null
    },
    async changePlan(subscriptionId, productId) {
      // At the period end: a crypto subscription has no card to charge a difference now.
      await call(`/v3/subscriptions/${encodeURIComponent(subscriptionId)}/change-plan`, {
        method: 'POST',
        body: JSON.stringify({ productId, effective: 'period_end', proration: 'none' }),
      })
    },
    async cancelPlanChange(subscriptionId) {
      await call(`/v3/subscriptions/${encodeURIComponent(subscriptionId)}/cancel-plan-change`, {
        method: 'POST',
      })
    },
    async paymentSubscription(id) {
      const data = await call<{ subscriptionId?: string | null }>(
        `/v3/payments/${encodeURIComponent(id)}`,
      )
      return data?.subscriptionId ?? null
    },
  }
}
