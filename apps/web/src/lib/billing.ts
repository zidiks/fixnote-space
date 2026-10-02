/**
 * Settings → Billing, as the `billing` edge function answers it (supabase/functions/billing): the
 * subscription as Suby has it, its payments, a receipt, switching plans and cancelling. The app
 * only shows and asks; Suby and the server decide.
 */

export type BillingPlan = 'month' | 'year'

export interface BillingOverview {
  subscription: {
    plan: BillingPlan | null
    status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' | 'other'
    /** Ends at `periodEnd` instead of renewing. */
    cancelAtPeriodEnd: boolean
    periodEnd: string | null
    priceCents: number | null
    currency: string | null
    /** A switch to the other plan at the end of the period. */
    next: { plan: BillingPlan | null; at: string } | null
  } | null
  payments: BillingPayment[]
}

export interface BillingPayment {
  id: string
  at: string
  amountCents: number | null
  currency: string | null
  status: 'paid' | 'refunded' | 'processing'
  method: 'crypto' | 'card'
  plan: BillingPlan | null
}

export interface BillingApi {
  overview(): Promise<BillingOverview>
  /** The payment's receipt as a PDF. */
  receipt(paymentId: string): Promise<Uint8Array>
  /** To the other plan at the end of the paid period. */
  switchPlan(plan: BillingPlan): Promise<BillingOverview>
  /** Calls off a switch that has not happened yet. */
  keepPlan(): Promise<BillingOverview>
  /** No renewal: Pro until the end of the paid period. */
  cancel(): Promise<BillingOverview>
}

/** "$7.00" in the UI language. */
export function money(cents: number | null, currency: string | null, lang?: string): string {
  if (cents === null) return ''
  return new Intl.NumberFormat(lang, {
    style: 'currency',
    currency: currency ?? 'USD',
    minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100)
}
