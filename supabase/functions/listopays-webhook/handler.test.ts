import { assertEquals } from 'jsr:@std/assert@1'
import { type CardOrders, handle, type PaidResult } from './handler.ts'

const KEY = 'pk_private_test'
const ORDER = '7d5c1f9e-2b1a-4c3d-9e8f-0a1b2c3d4e5f'

/** Our orders as card_order_paid settles them: amount, currency, once per order and transaction. */
function setup() {
  const orders = new Map([[ORDER, { amount: 7, currency: 'USD', paidBy: null as string | null }]])
  const extended: string[] = []
  const events: Record<string, unknown>[] = []
  const store: CardOrders = {
    async paid({ order, transaction, amount, currency, event }): Promise<PaidResult> {
      events.push(event)
      const o = orders.get(order)
      if (!o) return 'unknown_order'
      if (o.paidBy) return 'already'
      if ([...orders.values()].some((x) => x.paidBy === transaction)) {
        return 'duplicate_transaction'
      }
      if (currency.toUpperCase() !== o.currency || amount < o.amount) return 'mismatch'
      o.paidBy = transaction
      extended.push(order)
      return 'paid'
    },
  }
  return { deps: { privateKey: KEY, orders: store }, extended, events }
}

const event = (over: Record<string, unknown> = {}) => ({
  transaction: 'tok_1',
  order_id: ORDER,
  status: 'success',
  private_key: KEY,
  metadata: {
    customer_id: 'cus-uuid',
    email: 'ann@x.io',
    amount: 7,
    currency: 'USD',
    descriptor: 'FIXNOTE',
  },
  ...over,
})

const deliver = (body: unknown, deps: Parameters<typeof handle>[1]) =>
  handle(
    new Request('http://fn/listopays-webhook', { method: 'POST', body: JSON.stringify(body) }),
    deps,
  )

Deno.test('a paid order extends Pro once, and the stored event has no private key', async () => {
  const { deps, extended, events } = setup()
  assertEquals((await deliver(event(), deps)).status, 200)
  assertEquals((await deliver(event(), deps)).status, 200)
  assertEquals(extended, [ORDER])
  assertEquals('private_key' in (events[0] ?? {}), false)
  assertEquals((events[0] as { transaction: string }).transaction, 'tok_1')
})

Deno.test('refuses a wrong or missing private key, and answers 503 without one set', async () => {
  const { deps, extended } = setup()
  assertEquals((await deliver(event({ private_key: 'nope' }), deps)).status, 401)
  assertEquals((await deliver(event({ private_key: undefined }), deps)).status, 401)
  assertEquals((await deliver(event(), { ...deps, privateKey: undefined })).status, 503)
  assertEquals(extended, [])
})

Deno.test('trusts only what matches the order: less money or another currency gives nothing', async () => {
  const { deps, extended } = setup()
  const meta = (m: Record<string, unknown>) => event({ metadata: { ...event().metadata, ...m } })
  await deliver(meta({ amount: 6.99 }), deps)
  await deliver(meta({ currency: 'EUR' }), deps)
  assertEquals(extended, [])
  // "Commission In Price": the person paid more than the order, which still counts.
  await deliver(meta({ amount: '7.35' }), deps)
  assertEquals(extended, [ORDER])
})

Deno.test('ignores events that are not ours to settle', async () => {
  const { deps, extended } = setup()
  assertEquals((await deliver(event({ status: 'failed' }), deps)).status, 200)
  assertEquals((await deliver(event({ order_id: 'order456' }), deps)).status, 200)
  assertEquals((await deliver(event({ order_id: crypto.randomUUID() }), deps)).status, 200)
  assertEquals((await deliver(event({ transaction: undefined }), deps)).status, 200)
  assertEquals(extended, [])
  assertEquals(
    (
      await handle(
        new Request('http://fn/listopays-webhook', { method: 'POST', body: 'not json' }),
        deps,
      )
    ).status,
    400,
  )
})

Deno.test('the order id may come back as `order`', async () => {
  const { deps, extended } = setup()
  await deliver(event({ order_id: undefined, order: ORDER }), deps)
  assertEquals(extended, [ORDER])
})
