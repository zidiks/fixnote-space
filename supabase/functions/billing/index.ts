import { createClient } from 'npm:@supabase/supabase-js@2'
import { subyApi } from '../_shared/suby.ts'
import { envFromDeno, handle } from './handler.ts'

const key = Deno.env.get('SUBY_API_KEY')
const suby = key ? subyApi(key) : null
// Service role: reads whether the account had a subscription, which the client cannot ask for others.
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const hadSubscription = async (userId: string) => {
  const { data, error } = await db.rpc('had_subscription', { p_user: userId })
  if (error) throw error
  return data === true
}

Deno.serve((req) => handle(req, envFromDeno(), suby, hadSubscription))
