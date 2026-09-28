import { createClient } from 'npm:@supabase/supabase-js@2'
import { subyApi } from '../_shared/suby.ts'
import { type BillingStore, handle } from './handler.ts'

// Service role: `subscriptions` and `billing_events` are written only by the server.
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const userWhere = async (column: string, value: string) => {
  const { data, error } = await db
    .from('subscriptions')
    .select('user_id')
    .eq(column, value)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.user_id as string | undefined) ?? null
}

const store: BillingStore = {
  async seen(id) {
    const { data, error } = await db.from('billing_events').select('id').eq('id', id).maybeSingle()
    if (error) throw error
    return Boolean(data)
  },
  async markSeen(id, type) {
    const { error } = await db
      .from('billing_events')
      .upsert({ id, type }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
  },
  userBySubscription: (id) => userWhere('provider_subscription_id', id),
  userByCustomer: (id) => userWhere('provider_customer_id', id),
  async userByEmail(email) {
    const { data, error } = await db.rpc('user_id_by_email', { p_email: email })
    if (error) throw error
    return (data as string | null) ?? null
  },
  async save(userId, row) {
    const { error } = await db.from('subscriptions').upsert(
      {
        user_id: userId,
        status: row.status,
        current_period_end: row.currentPeriodEnd,
        provider: 'suby',
        provider_customer_id: row.customerId,
        provider_subscription_id: row.subscriptionId,
        ...(row.trialEndsAt ? { trial_ends_at: row.trialEndsAt } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (error) throw error
  },
}

const key = Deno.env.get('SUBY_API_KEY')
const secret = Deno.env.get('SUBY_WEBHOOK_SECRET')
Deno.serve((req) => handle(req, { secret, suby: key ? subyApi(key) : null, store }))
