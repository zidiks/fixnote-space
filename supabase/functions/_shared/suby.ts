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
  /** The subscription a payment belongs to (for disputes, which name only the payment). */
  paymentSubscription(id: string): Promise<string | null>
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
    async paymentSubscription(id) {
      const data = await call<{ subscriptionId?: string | null }>(
        `/v3/payments/${encodeURIComponent(id)}`,
      )
      return data?.subscriptionId ?? null
    },
  }
}
