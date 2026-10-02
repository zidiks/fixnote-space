import { assertEquals } from 'jsr:@std/assert@1'
import { subyApi } from '../_shared/suby.ts'
import { type BillingEnv, handle } from './handler.ts'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const token = (claims: object) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`
const signedIn = {
  Authorization: `Bearer ${token({ sub: 'user-1', email: 'ann@x.io', role: 'authenticated' })}`,
}
const env: BillingEnv = {
  products: { month: 'pro_month', year: 'pro_year' },
  returnUrl: 'https://app.fixnote.space/',
}
const post = (body: unknown, headers: Record<string, string> = signedIn) =>
  new Request('http://fn/billing', { method: 'POST', headers, body: JSON.stringify(body) })

/** Suby's API as it answers, recording what it was asked. */
function fakeSuby() {
  const calls: { url: string; key: string | null; body: unknown }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    calls.push({
      url,
      key: new Headers(init?.headers).get('x-suby-api-key'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })
    if (url.endsWith('/v3/checkout/sessions')) {
      return Response.json(
        { success: true, data: { url: 'https://pay.suby.fi/cs_1' } },
        { status: 201 },
      )
    }
    if (url.includes('/v3/subscriptions/sub_1')) {
      return Response.json({
        success: true,
        data: {
          subscription: { id: 'sub_1', status: 'ACTIVE', customer: { email: 'ann@x.io' } },
          scheduledChange: null,
        },
      })
    }
    return Response.json({ success: false, error: { message: 'not found' } }, { status: 404 })
  }
  return { suby: subyApi('sk_sandbox_x', fetcher, 'https://api.test'), calls }
}

Deno.test('opens a Suby checkout for the plan, with the account email and id', async () => {
  const { suby, calls } = fakeSuby()
  const res = await handle(post({ plan: 'year' }), env, suby)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { url: 'https://pay.suby.fi/cs_1' })
  assertEquals(calls[0]?.key, 'sk_sandbox_x')
  assertEquals(calls[0]?.body, {
    mode: 'subscription',
    productId: 'pro_year',
    customer: { email: 'ann@x.io' },
    metadata: { user_id: 'user-1' },
    successUrl: 'https://app.fixnote.space/?billing=success',
    cancelUrl: 'https://app.fixnote.space/?billing=cancel',
  })
})

Deno.test('from the desktop app, the buyer comes back to the page that opens the app', async () => {
  const { suby, calls } = fakeSuby()
  const res = await handle(post({ plan: 'month', app: true }), env, suby)
  assertEquals(res.status, 200)
  const body = calls[0]?.body as { successUrl: string; cancelUrl: string }
  assertEquals(body.successUrl, 'https://app.fixnote.space/?billing=success&to=app')
  assertEquals(body.cancelUrl, 'https://app.fixnote.space/?billing=cancel&to=app')
})

Deno.test('needs a signed-in account, a known plan and the payment setup', async () => {
  const { suby } = fakeSuby()
  assertEquals((await handle(post({ plan: 'year' }, {}), env, suby)).status, 401)
  assertEquals((await handle(post({ plan: 'lifetime' }), env, suby)).status, 400)
  assertEquals((await handle(post({ plan: 'month' }), env, null)).status, 503)
  const noProducts = { ...env, products: { month: undefined, year: undefined } }
  assertEquals((await handle(post({ plan: 'month' }), noProducts, suby)).status, 503)
})

Deno.test('reads a subscription back, and nothing for an unknown one', async () => {
  const { suby } = fakeSuby()
  assertEquals((await suby.subscription('sub_1'))?.customer?.email, 'ann@x.io')
  assertEquals(await suby.subscription('sub_404'), null)
})

/** Suby with one account's subscription and payments, changed by cancel and change-plan. */
function subyAccount() {
  const sub = {
    id: 'sub_1',
    customerId: 'cus_ann',
    productId: 'pro_month',
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
    currentCycleDueAt: '2026-11-02T00:00:00.000Z',
    endedAt: null,
    priceCents: '700',
    currency: 'USD',
  }
  let scheduled: Record<string, unknown> | null = null
  const payments = [
    {
      id: 'pay_1',
      rail: 'crypto',
      customerId: 'cus_ann',
      productId: 'pro_month',
      subscriptionId: 'sub_1',
      status: 'COMPLETED',
      priceCents: '700',
      grossAmountCents: 700,
      currency: 'USD',
      createdAt: '2026-10-02T10:00:00.000Z',
      paymentConfirmedAt: '2026-10-02T10:03:00.000Z',
    },
    // An abandoned checkout: not a payment worth showing.
    {
      id: 'pay_0',
      customerId: 'cus_ann',
      productId: 'pro_year',
      subscriptionId: null,
      status: 'EXPIRED',
      currency: 'USD',
      createdAt: '2026-10-01T10:00:00.000Z',
    },
  ]
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const ok = (data: unknown, status = 200) => Response.json({ success: true, data }, { status })
    if (url.pathname === '/v3/subscriptions/sub_1/cancel') {
      sub.cancelAtPeriodEnd = true
      return ok({ subscription: sub })
    }
    if (url.pathname === '/v3/subscriptions/sub_1/change-plan') {
      const body = JSON.parse(String(init?.body))
      scheduled = {
        type: 'UPGRADE',
        targetPriceId: body.productId,
        scheduledFor: sub.currentCycleDueAt,
        appliedAt: null,
        canceledAt: null,
      }
      return ok({ subscription: sub, scheduledChange: scheduled, applied: false }, 202)
    }
    if (url.pathname === '/v3/subscriptions/sub_1/cancel-plan-change') {
      scheduled = null
      return ok({ subscription: sub })
    }
    if (url.pathname === '/v3/subscriptions/sub_1') {
      return ok({ subscription: sub, scheduledChange: scheduled })
    }
    if (url.pathname === '/v3/payments') {
      const mine = payments.filter((p) => p.customerId === url.searchParams.get('customerId'))
      return ok({ items: mine, pagination: { nextCursor: null, hasMore: false } })
    }
    if (url.pathname === '/v3/payments/pay_1/receipt.pdf') {
      return new Response(new Uint8Array([37, 80, 68, 70]), {
        headers: { 'Content-Type': 'application/pdf' },
      })
    }
    if (url.pathname === '/v3/payments/pay_1') return ok(payments[0])
    if (url.pathname === '/v3/payments/pay_other')
      return ok({ ...payments[0], customerId: 'cus_bob' })
    return Response.json({ success: false, error: { message: 'not found' } }, { status: 404 })
  }
  const canceled: [string, string | null][] = []
  const accounts = {
    of: async (user: string) =>
      user === 'user-1' ? { subscriptionId: 'sub_1', customerId: 'cus_ann' } : null,
    canceled: async (user: string, end: string | null) => void canceled.push([user, end]),
  }
  return { suby: subyApi('sk_live_x', fetcher, 'https://api.test'), accounts, canceled }
}

Deno.test('overview: the subscription as Suby has it, and the payments that went through', async () => {
  const { suby, accounts } = subyAccount()
  const res = await handle(post({ action: 'overview' }), env, suby, accounts)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), {
    subscription: {
      plan: 'month',
      status: 'active',
      cancelAtPeriodEnd: false,
      periodEnd: '2026-11-02T00:00:00.000Z',
      priceCents: 700,
      currency: 'USD',
      next: null,
    },
    payments: [
      {
        id: 'pay_1',
        at: '2026-10-02T10:03:00.000Z',
        amountCents: 700,
        currency: 'USD',
        status: 'paid',
        method: 'crypto',
        plan: 'month',
      },
    ],
  })
})

Deno.test('receipts only for the account’s own payments', async () => {
  const { suby, accounts } = subyAccount()
  const res = await handle(post({ action: 'receipt', paymentId: 'pay_1' }), env, suby, accounts)
  assertEquals(await res.json(), { pdf: btoa('%PDF') })
  const other = await handle(
    post({ action: 'receipt', paymentId: 'pay_other' }),
    env,
    suby,
    accounts,
  )
  assertEquals(other.status, 404)
})

Deno.test('switching to yearly waits for the period end, and can be called off', async () => {
  const { suby, accounts } = subyAccount()
  const res = await handle(post({ action: 'switch', plan: 'year' }), env, suby, accounts)
  const body = (await res.json()) as { subscription: { next: unknown } }
  assertEquals(body.subscription.next, { plan: 'year', at: '2026-11-02T00:00:00.000Z' })
  const kept = await handle(post({ action: 'keep-plan' }), env, suby, accounts)
  assertEquals(((await kept.json()) as { subscription: { next: unknown } }).subscription.next, null)
})

Deno.test('cancel: no renewal, Pro until the end of the paid period', async () => {
  const { suby, accounts, canceled } = subyAccount()
  const res = await handle(post({ action: 'cancel' }), env, suby, accounts)
  const body = (await res.json()) as { subscription: { cancelAtPeriodEnd: boolean } }
  assertEquals(body.subscription.cancelAtPeriodEnd, true)
  assertEquals(canceled, [['user-1', '2026-11-02T00:00:00.000Z']])
})

Deno.test('an account that never subscribed has nothing to manage', async () => {
  const { suby, accounts } = subyAccount()
  const stranger = {
    Authorization: `Bearer ${token({ sub: 'user-2', email: 'bob@x.io', role: 'authenticated' })}`,
  }
  const res = await handle(post({ action: 'cancel' }, stranger), env, suby, accounts)
  assertEquals(res.status, 400)
  assertEquals((await handle(post({ action: 'overview' }), env, null, accounts)).status, 503)
})
