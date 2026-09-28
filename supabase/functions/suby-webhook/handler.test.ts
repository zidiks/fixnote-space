import { assertEquals } from 'jsr:@std/assert@1'
import type { Suby, SubySubscription } from '../_shared/suby.ts'
import { type BillingStore, handle, type SubscriptionRow } from './handler.ts'

const SECRET = 'whsec_test'
const NOW = Date.parse('2026-10-01T12:00:00Z')

async function sign(body: string, ts: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`))
  return `v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function deliver(
  event: object,
  deps: Parameters<typeof handle>[1],
  opts: { ts?: number; sig?: string } = {},
) {
  const body = JSON.stringify(event)
  const ts = opts.ts ?? NOW / 1000
  return handle(
    new Request('http://fn/suby-webhook', {
      method: 'POST',
      headers: {
        'x-webhook-timestamp': String(ts),
        'x-webhook-signature': opts.sig ?? (await sign(body, ts)),
      },
      body,
    }),
    deps,
  )
}

function setup(sub: Partial<SubySubscription> = {}) {
  const subscription: SubySubscription = {
    id: 'sub_1',
    customerId: 'cus_1',
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
    currentCycleDueAt: '2026-11-01T12:00:00Z',
    endedAt: null,
    customer: { id: 'cus_1', email: 'ann@x.io' },
    ...sub,
  }
  const seen = new Set<string>()
  const rows = new Map<string, SubscriptionRow>()
  const store: BillingStore = {
    seen: async (id) => seen.has(id),
    markSeen: async (id) => void seen.add(id),
    userBySubscription: async (id) =>
      [...rows].find(([, r]) => r.subscriptionId === id)?.[0] ?? null,
    userByCustomer: async (id) => [...rows].find(([, r]) => r.customerId === id)?.[0] ?? null,
    userByEmail: async (email) => (email === 'ann@x.io' ? 'user-ann' : null),
    save: async (user, row) => void rows.set(user, row),
  }
  const suby: Suby = {
    checkout: async () => 'https://checkout',
    subscription: async (id) => (id === subscription.id ? subscription : null),
    paymentSubscription: async (id) => (id === 'pay_1' ? 'sub_1' : null),
  }
  return { deps: { secret: SECRET, suby, store, now: () => NOW }, rows, seen, subscription }
}

const paid = {
  id: 'evt_1',
  type: 'payment.succeeded',
  data: {
    object: 'payment',
    id: 'pay_1',
    subscription_id: 'sub_1',
    customer_id: 'cus_1',
    metadata: { user_id: 'user-ann' },
  },
}

Deno.test('a paid subscription gives the account in its metadata Pro until the period ends', async () => {
  const { deps, rows } = setup()
  assertEquals((await deliver(paid, deps)).status, 200)
  assertEquals(rows.get('user-ann'), {
    status: 'active',
    currentPeriodEnd: '2026-11-01T12:00:00Z',
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
  })
})

Deno.test('a subscription in its free trial gives Pro until the trial ends', async () => {
  const { deps, rows } = setup({
    status: 'TRIALING',
    trialEndAt: '2026-10-08T12:00:00Z',
    currentCycleDueAt: '2026-10-08T12:00:00Z',
  })
  const created = {
    id: 'evt_t',
    type: 'subscription.created',
    data: { object: 'subscription', id: 'sub_1' },
  }
  assertEquals((await deliver(created, deps)).status, 200)
  assertEquals(rows.get('user-ann'), {
    status: 'trialing',
    currentPeriodEnd: '2026-10-08T12:00:00Z',
    trialEndsAt: '2026-10-08T12:00:00Z',
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
  })
})

Deno.test('refuses unsigned, wrongly signed and stale deliveries', async () => {
  const { deps, rows } = setup()
  assertEquals((await deliver(paid, deps, { sig: 'v1=00' })).status, 401)
  assertEquals((await deliver(paid, deps, { ts: NOW / 1000 - 3600 })).status, 401)
  assertEquals(rows.size, 0)
})

Deno.test('a subscription event without metadata finds the account by its email', async () => {
  const { deps, rows } = setup()
  const created = {
    id: 'evt_2',
    type: 'subscription.created',
    data: { object: 'subscription', id: 'sub_1', customer_id: 'cus_1' },
  }
  assertEquals((await deliver(created, deps)).status, 200)
  assertEquals(rows.get('user-ann')?.status, 'active')
})

Deno.test('a scheduled cancellation keeps Pro until the period end; the end removes it', async () => {
  const { deps, rows, subscription } = setup()
  await deliver(paid, deps)
  subscription.cancelAtPeriodEnd = true
  await deliver(
    { id: 'evt_3', type: 'subscription.updated', data: { object: 'subscription', id: 'sub_1' } },
    deps,
  )
  assertEquals(rows.get('user-ann'), {
    status: 'canceled',
    currentPeriodEnd: '2026-11-01T12:00:00Z',
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
  })
  Object.assign(subscription, { status: 'EXPIRED', endedAt: '2026-11-01T12:00:00Z' })
  await deliver(
    { id: 'evt_4', type: 'subscription.expired', data: { object: 'subscription', id: 'sub_1' } },
    deps,
  )
  assertEquals(rows.get('user-ann')?.currentPeriodEnd, '2026-11-01T12:00:00Z')
})

Deno.test('a chargeback takes Pro away at once; the same event twice is handled once', async () => {
  const { deps, rows, seen } = setup()
  await deliver(paid, deps)
  const dispute = {
    id: 'evt_5',
    type: 'dispute.opened',
    data: { object: 'dispute', payment_id: 'pay_1' },
  }
  assertEquals((await deliver(dispute, deps)).status, 200)
  assertEquals(rows.get('user-ann')?.status, 'canceled')
  assertEquals(rows.get('user-ann')?.currentPeriodEnd, new Date(NOW).toISOString())
  assertEquals(seen.has('evt_5'), true)
  rows.clear()
  assertEquals((await deliver(dispute, deps)).status, 200)
  assertEquals(rows.size, 0)
})

Deno.test('an unknown account is retried later, other events are ignored', async () => {
  const { deps, rows } = setup({ customer: { email: 'stranger@x.io' } })
  const created = {
    id: 'evt_6',
    type: 'subscription.created',
    data: { object: 'subscription', id: 'sub_1' },
  }
  assertEquals((await deliver(created, deps)).status, 409)
  assertEquals(
    (await deliver({ id: 'evt_7', type: 'payout.completed', data: {} }, deps)).status,
    200,
  )
  assertEquals(rows.size, 0)
})
