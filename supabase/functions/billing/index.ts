import { createClient } from 'npm:@supabase/supabase-js@2'
import { subyApi } from '../_shared/suby.ts'
import { type BillingAccounts, envFromDeno, handle } from './handler.ts'

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

Deno.serve((req) => handle(req, envFromDeno(), suby, accounts))
