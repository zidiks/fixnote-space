/**
 * billing: opens a Suby checkout for FixNote Pro (monthly or yearly) for the signed-in account.
 * The checkout carries the account's email (Suby's customer, and its self-serve portal) and id
 * (metadata), which suby-webhook uses to give the account Pro once the payment goes through.
 */

import { CORS, jsonError, userEmail, userId } from '../_shared/auth.ts'
import type { Suby } from '../_shared/suby.ts'

export interface BillingEnv {
  /** Products with the 7-day trial (set on the product in Suby: the card is taken, charged later). */
  products: { month: string | undefined; year: string | undefined }
  /** The same without a trial, for accounts that already had a subscription (one trial each). */
  noTrial: { month: string | undefined; year: string | undefined }
  /** Where Suby sends the buyer back to (the web app). */
  returnUrl: string
}

export function envFromDeno(): BillingEnv {
  return {
    products: {
      month: Deno.env.get('SUBY_PRODUCT_MONTH'),
      year: Deno.env.get('SUBY_PRODUCT_YEAR'),
    },
    noTrial: {
      month: Deno.env.get('SUBY_PRODUCT_MONTH_NO_TRIAL'),
      year: Deno.env.get('SUBY_PRODUCT_YEAR_NO_TRIAL'),
    },
    returnUrl: Deno.env.get('BILLING_RETURN_URL') ?? 'https://app.fixnote.space/',
  }
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json' } })

export async function handle(
  req: Request,
  env: BillingEnv,
  suby: Suby | null,
  /** Whether the account had a subscription before (then it gets no second trial). */
  hadSubscription: (userId: string) => Promise<boolean>,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')
  const user = userId(req)
  const email = userEmail(req)
  if (!user || !email) return jsonError(401, 'Sign in first')

  let body: { plan?: unknown }
  try {
    body = (await req.json()) as { plan?: unknown }
  } catch {
    return jsonError(400, 'Invalid JSON')
  }
  const plan = body.plan === 'year' ? 'year' : body.plan === 'month' ? 'month' : null
  if (!plan) return jsonError(400, 'Plan must be "month" or "year"')
  const again = await hadSubscription(user)
  const productId = (again ? env.noTrial[plan] : undefined) ?? env.products[plan]
  if (!suby || !productId) return jsonError(503, 'Payments are not set up yet')

  const back = new URL(env.returnUrl)
  const url = await suby
    .checkout({
      productId,
      email,
      userId: user,
      successUrl: new URL('?billing=success', back).toString(),
      cancelUrl: new URL('?billing=cancel', back).toString(),
    })
    .catch((err: unknown) => {
      console.error('checkout failed', err instanceof Error ? err.message : err)
      return null
    })
  return url ? json({ url }) : jsonError(502, 'Could not open the payment page')
}
