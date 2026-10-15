import { createClient } from 'npm:@supabase/supabase-js@2'
import { listoPaysApi } from '../_shared/listopays.ts'
import { subyApi } from '../_shared/suby.ts'
import {
  type BillingAccounts,
  type CardDeps,
  type CardOrder,
  type CardStore,
  envFromDeno,
  handle,
} from './handler.ts'

const key = Deno.env.get('SUBY_API_KEY')
const suby = key ? subyApi(key) : null

// Service role: `subscriptions` is written only by the server (the account id comes from the
// JWT the platform verified).
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const accounts: BillingAccounts = {
  async of(userId) {
    const { data, error } = await db
      .from('subscriptions')
      .select('provider_subscription_id, provider_customer_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
      ? {
          subscriptionId: (data.provider_subscription_id as string | null) ?? null,
          customerId: (data.provider_customer_id as string | null) ?? null,
        }
      : null
  },
  async canceled(userId, periodEnd) {
    const { error } = await db
      .from('subscriptions')
      .update({
        status: 'canceled',
        ...(periodEnd ? { current_period_end: periodEnd } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('status', 'active')
    if (error) throw error
  },
}

const ORDER_COLUMNS =
  'id, plan, amount, currency, status, created_at, paid_at, paid_amount, period_start, period_end, transaction_id'

const toOrder = (row: Record<string, unknown>): CardOrder => ({
  id: row.id as string,
  plan: row.plan === 'year' ? 'year' : 'month',
  amount: Number(row.amount),
  currency: row.currency as string,
  status: row.status as CardOrder['status'],
  createdAt: row.created_at as string,
  paidAt: (row.paid_at as string | null) ?? null,
  paidAmount: row.paid_amount === null ? null : Number(row.paid_amount),
  periodStart: (row.period_start as string | null) ?? null,
  periodEnd: (row.period_end as string | null) ?? null,
  transactionId: (row.transaction_id as string | null) ?? null,
})

const cardStore: CardStore = {
  async state(userId) {
    const [renews, row] = await Promise.all([
      db.rpc('suby_renews', { p_user: userId }),
      db.from('subscriptions').select('prepaid_until').eq('user_id', userId).maybeSingle(),
    ])
    if (renews.error) throw renews.error
    if (row.error) throw row.error
    return {
      subyRenews: renews.data === true,
      prepaidUntil: (row.data?.prepaid_until as string | null | undefined) ?? null,
    }
  },
  async customer(userId) {
    const { data, error } = await db
      .from('card_orders')
      .select('provider_customer_id')
      .eq('user_id', userId)
      .not('provider_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return (data?.provider_customer_id as string | undefined) ?? null
  },
  async createOrder(userId, { plan, amount, currency, customerId }) {
    const { data, error } = await db
      .from('card_orders')
      .insert({ user_id: userId, plan, amount, currency, provider_customer_id: customerId })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  },
  async failOrder(id) {
    const { error } = await db
      .from('card_orders')
      .update({ status: 'failed' })
      .eq('id', id)
      .eq('status', 'pending')
    if (error) throw error
  },
  async order(userId, id) {
    // Not a uuid: no such order (and no query error).
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null
    const { data, error } = await db
      .from('card_orders')
      .select(ORDER_COLUMNS)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data ? toOrder(data) : null
  },
  async paidOrders(userId, limit) {
    const { data, error } = await db
      .from('card_orders')
      .select(ORDER_COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(toOrder)
  },
}

const listoKey = Deno.env.get('LISTOPAYS_PUBLIC_KEY')
const card: CardDeps = { api: listoKey ? listoPaysApi(listoKey) : null, store: cardStore }

Deno.serve((req) => handle(req, envFromDeno(), suby, accounts, card))
