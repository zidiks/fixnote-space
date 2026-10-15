import { assertEquals } from 'jsr:@std/assert@1'
import { listoPaysApi } from '../_shared/listopays.ts'
import { subyApi } from '../_shared/suby.ts'
import {
  type BillingEnv,
  type CardDeps,
  type CardOrder,
  type CardStore,
  handle,
} from './handler.ts'

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

const NOW = Date.parse('2026-10-15T12:00:00Z')
const bob = {
  Authorization: `Bearer ${token({ sub: 'user-2', email: 'bob@x.io', role: 'authenticated' })}`,
}

/** ListoPays as it answers, and our card orders as the service role keeps them. */
function cardSetup(state: { subyRenews?: boolean; prepaidUntil?: string | null } = {}) {
  const calls: { url: string; key: string | null; body: Record<string, unknown> }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body ?? '{}'))
    calls.push({ url, key: new Headers(init?.headers).get('x-public-key'), body })
    if (url.endsWith('/customers')) return Response.json({ success: true, data: { uuid: 'cus-1' } })
    if (url.endsWith('/payments')) {
      return Response.json({
        success: true,
        error: null,
        data: { url: `https://pay.listopays.com/payment/${body.order}` },
      })
    }
    return Response.json({ success: false, error: 'not found' }, { status: 404 })
  }
  const orders: (CardOrder & { user: string; customerId: string })[] = []
  const store: CardStore = {
    state: async () => ({
      subyRenews: state.subyRenews ?? false,
      prepaidUntil: state.prepaidUntil ?? null,
    }),
    customer: async (user) => orders.find((o) => o.user === user)?.customerId ?? null,
    createOrder: async (user, o) => {
      const id = crypto.randomUUID()
      orders.push({
        id,
        user,
        customerId: o.customerId,
        plan: o.plan,
        amount: o.amount,
        currency: o.currency,
        status: 'pending',
        createdAt: new Date(NOW).toISOString(),
        paidAt: null,
        paidAmount: null,
        periodStart: null,
        periodEnd: null,
        transactionId: null,
      })
      return id
    },
    failOrder: async (id) => {
      const o = orders.find((x) => x.id === id)
      if (o) o.status = 'failed'
    },
    order: async (user, id) => orders.find((o) => o.id === id && o.user === user) ?? null,
    paidOrders: async (user) => orders.filter((o) => o.user === user && o.status === 'paid'),
  }
  const card: CardDeps = {
    api: listoPaysApi('pub_test', fetcher, 'https://listo.test'),
    store,
    now: () => NOW,
  }
  return { card, calls, orders }
}

const cardCall = (body: unknown, card: CardDeps, headers = signedIn) =>
  handle(post(body, headers), env, null, undefined, card)

Deno.test('card checkout: a customer, our order, and ListoPays’ page for it in USD', async () => {
  const { card, calls, orders } = cardSetup()
  const res = await cardCall({ action: 'card-checkout', plan: 'year' }, card)
  assertEquals(res.status, 200)
  const { url, order } = (await res.json()) as { url: string; order: string }
  assertEquals(url, `https://pay.listopays.com/payment/${order}`)
  assertEquals(orders[0]?.amount, 60)
  assertEquals(
    calls.map((c) => c.url),
    ['https://listo.test/customers', 'https://listo.test/payments'],
  )
  assertEquals(calls[0]?.body, { name: 'ann', email: 'ann@x.io', public_key: 'pub_test' })
  assertEquals(calls[1]?.key, 'pub_test')
  assertEquals(calls[1]?.body, {
    customer: 'cus-1',
    order,
    amount: 60,
    currency: 'USD',
    public_key: 'pub_test',
  })
  // The customer is made once.
  await cardCall({ action: 'card-checkout', plan: 'month' }, card)
  assertEquals(calls.filter((c) => c.url.endsWith('/customers')).length, 1)
  assertEquals(orders[1]?.amount, 7)
})

Deno.test('order status: pending, then paid; another account’s order does not exist', async () => {
  const { card, orders } = cardSetup()
  const res = await cardCall({ action: 'card-checkout', plan: 'month' }, card)
  const { order } = (await res.json()) as { order: string }
  const status = (headers = signedIn) => cardCall({ action: 'order-status', order }, card, headers)
  assertEquals(await (await status()).json(), { status: 'pending', plan: 'month', periodEnd: null })
  Object.assign(orders[0] ?? {}, { status: 'paid', periodEnd: '2026-11-15T12:00:00.000Z' })
  assertEquals(await (await status()).json(), {
    status: 'paid',
    plan: 'month',
    periodEnd: '2026-11-15T12:00:00.000Z',
  })
  assertEquals((await status(bob)).status, 404)
})

Deno.test('an order nobody paid for hours shows as expired', async () => {
  const { card, orders } = cardSetup()
  await cardCall({ action: 'card-checkout', plan: 'month' }, card)
  const order = orders[0]
  if (!order) throw new Error('no order')
  order.createdAt = new Date(NOW - 4 * 3_600_000).toISOString()
  const res = await cardCall({ action: 'order-status', order: order.id }, card)
  assertEquals(((await res.json()) as { status: string }).status, 'expired')
})

Deno.test('no card checkout while a subscription renews, no Suby one while card time runs', async () => {
  const renewing = cardSetup({ subyRenews: true })
  const res = await cardCall({ action: 'card-checkout', plan: 'month' }, renewing.card)
  assertEquals(res.status, 409)
  assertEquals(renewing.calls, [])
  const prepaid = cardSetup({ prepaidUntil: '2026-11-01T00:00:00Z' })
  const { suby, calls } = fakeSuby()
  assertEquals(
    (await handle(post({ plan: 'month' }), env, suby, undefined, prepaid.card)).status,
    409,
  )
  assertEquals(calls, [])
  // Card time over: the subscription may start.
  const over = cardSetup({ prepaidUntil: '2026-10-01T00:00:00Z' })
  assertEquals((await handle(post({ plan: 'month' }), env, suby, undefined, over.card)).status, 200)
})

Deno.test('a ListoPays failure marks the order failed and says so', async () => {
  const { card, orders } = cardSetup()
  const broken: CardDeps = {
    ...card,
    api: listoPaysApi('pub_test', async (input) =>
      String(input).endsWith('/customers')
        ? Response.json({ success: true, data: { uuid: 'cus-1' } })
        : Response.json({ success: false, error: 'Website is disabled' }, { status: 400 }),
    ),
  }
  assertEquals((await cardCall({ action: 'card-checkout', plan: 'month' }, broken)).status, 502)
  assertEquals(orders[0]?.status, 'failed')
  const unset = { ...card, api: null }
  assertEquals((await cardCall({ action: 'card-checkout', plan: 'month' }, unset)).status, 503)
})

Deno.test('card payments are in the history, with our own receipt', async () => {
  const { card, orders } = cardSetup()
  await cardCall({ action: 'card-checkout', plan: 'month' }, card)
  Object.assign(orders[0] ?? {}, {
    status: 'paid',
    paidAt: '2026-10-15T12:05:00.000Z',
    paidAmount: 7.35,
    periodStart: '2026-10-15T12:05:00.000Z',
    periodEnd: '2026-11-15T12:05:00.000Z',
    transactionId: 'tok_1',
  })
  const id = `card_${orders[0]?.id}`
  assertEquals(await (await cardCall({ action: 'overview' }, card)).json(), {
    subscription: null,
    payments: [
      {
        id,
        at: '2026-10-15T12:05:00.000Z',
        amountCents: 735,
        currency: 'USD',
        status: 'paid',
        method: 'card',
        plan: 'month',
      },
    ],
  })
  // With Suby too: both kinds, newest first.
  const both = subyAccount()
  const mixed = await handle(post({ action: 'overview' }), env, both.suby, both.accounts, card)
  const ids = ((await mixed.json()) as { payments: { id: string }[] }).payments.map((p) => p.id)
  assertEquals(ids, [id, 'pay_1'])

  const receipt = await cardCall({ action: 'receipt', paymentId: id }, card)
  const pdf = atob(((await receipt.json()) as { pdf: string }).pdf)
  assertEquals(pdf.startsWith('%PDF-1.4'), true)
  assertEquals(pdf.includes('Amount: 7.35 USD'), true)
  assertEquals(pdf.includes('tok_1'), true)
  assertEquals((await cardCall({ action: 'receipt', paymentId: id }, card, bob)).status, 404)
})
