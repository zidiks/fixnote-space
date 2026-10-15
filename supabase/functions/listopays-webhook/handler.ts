/**
 * listopays-webhook: ListoPays reports a successful card payment (supabase/functions/_shared/
 * listopays.ts). Its body carries the Website Private Key instead of a signature, so that is
 * compared in constant time with our secret; after that only what matches OUR order counts (the
 * order id, its currency, at least its amount, the account it was opened for): the prepaid time is
 * settled by `card_order_paid` (supabase/migrations/*_card_payments.sql), once per order and per
 * transaction, so a delivery that comes twice changes nothing. The body is kept with the order,
 * without the private key.
 */

import { sameSecret } from '../_shared/listopays.ts'

export type PaidResult =
  | 'paid'
  | 'already'
  | 'unknown_order'
  | 'duplicate_transaction'
  | 'mismatch'
  | 'no_account'

export interface CardOrders {
  paid(req: {
    order: string
    transaction: string
    amount: number
    currency: string
    event: Record<string, unknown>
  }): Promise<PaidResult>
}

export interface WebhookDeps {
  privateKey: string | undefined
  orders: CardOrders
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

export async function handle(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!deps.privateKey) return new Response('Not configured', { status: 503 })
  let body: Record<string, unknown>
  try {
    const parsed = JSON.parse(await req.text()) as unknown
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  if (!sameSecret(str(body.private_key) ?? '', deps.privateKey)) {
    return new Response('Bad key', { status: 401 })
  }
  const { private_key: _key, ...event } = body
  const metadata = (body.metadata ?? {}) as Record<string, unknown>
  if (body.status !== 'success') return new Response('ok')

  // Our order id, as `order_id` (documented) or `order` (what we sent).
  const order = str(body.order_id) ?? str(body.order)
  const transaction = str(body.transaction)
  const amount = Number(metadata.amount)
  // Always sent as USD; an event without a currency is taken as the one we asked for.
  const currency = str(metadata.currency) ?? 'USD'
  if (!order || !UUID.test(order) || !transaction || !Number.isFinite(amount)) {
    console.error('listopays: an event FixNote cannot match', { order, transaction })
    return new Response('ok')
  }

  const result = await deps.orders.paid({ order, transaction, amount, currency, event })
  if (result === 'paid') {
    console.log(`listopays: order ${order} paid, ${amount} ${currency}`)
  } else if (result !== 'already') {
    // Not retried: ListoPays sending it again would not change it. Needs a look by hand.
    console.error(`listopays: order ${order} not settled: ${result}`, { amount, currency })
  }
  return new Response('ok')
}
