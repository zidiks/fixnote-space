import { createClient } from 'npm:@supabase/supabase-js@2'
import { type CardOrders, handle, type PaidResult } from './handler.ts'

// Service role: `card_orders` and `subscriptions` are written only by the server.
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const orders: CardOrders = {
  async paid({ order, transaction, amount, currency, event }) {
    const { data, error } = await db.rpc('card_order_paid', {
      p_order: order,
      p_transaction: transaction,
      p_amount: amount,
      p_currency: currency,
      p_event: event,
    })
    if (error) throw error
    return data as PaidResult
  },
}

const privateKey = Deno.env.get('LISTOPAYS_PRIVATE_KEY')
Deno.serve(async (req) => {
  try {
    return await handle(req, { privateKey, orders })
  } catch (err) {
    // ListoPays may deliver it again.
    console.error('listopays-webhook failed', err instanceof Error ? err.message : err)
    return new Response('Try again', { status: 500 })
  }
})
