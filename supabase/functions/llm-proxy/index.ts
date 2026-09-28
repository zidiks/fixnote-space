import { createClient } from 'npm:@supabase/supabase-js@2'
import { type Allowance, envFromDeno, handle, type Meter } from './handler.ts'

// Service role: the allowance and the usage table are not the user's to write.
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const meter: Meter = {
  async allowance(user) {
    const { data, error } = await db.rpc('ai_allowance', { p_user: user })
    // Without the database the assistant stays on rather than failing everyone.
    if (error) {
      console.error('ai_allowance failed', error.message)
      return { ok: true }
    }
    return data as Allowance
  },
  async record(user, tokens) {
    const { error } = await db.rpc('ai_record', { p_user: user, p_tokens: tokens })
    if (error) console.error('ai_record failed', error.message)
  },
}

Deno.serve((req) => handle(req, envFromDeno(), Date.now(), meter))
