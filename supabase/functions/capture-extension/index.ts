import { createClient } from 'npm:@supabase/supabase-js@2'
import { type ExtensionStore, handle } from './handler.ts'

// Service role: requests, links and inbox items are rows no user writes directly.
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const store: ExtensionStore = {
  async createRequest({ secretHash, label, code }) {
    // Expired requests nobody polled any more go first.
    await db.from('extension_requests').delete().lt('expires_at', new Date().toISOString())
    const { data, error } = await db
      .from('extension_requests')
      .insert({ secret_hash: secretHash, label, code })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  },
  async request(id) {
    const { data } = await db
      .from('extension_requests')
      .select('secret_hash, label, status, user_id, expires_at')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return {
      secretHash: data.secret_hash,
      label: data.label ?? '',
      status: data.status,
      userId: data.user_id,
      expired: new Date(data.expires_at).getTime() < Date.now(),
    }
  },
  async deleteRequest(id) {
    await db.from('extension_requests').delete().eq('id', id)
  },
  async link(tokenHash, userId, label) {
    const { error } = await db
      .from('capture_links')
      .insert({ channel: 'extension', external_id: tokenHash, user_id: userId, label })
    if (error) throw error
  },
  async unlink(tokenHash) {
    await db.from('capture_links').delete().eq('channel', 'extension').eq('external_id', tokenHash)
  },
  async userFor(tokenHash) {
    const { data } = await db
      .from('capture_links')
      .select('user_id')
      .eq('channel', 'extension')
      .eq('external_id', tokenHash)
      .maybeSingle()
    return data?.user_id ?? null
  },
  async publicKey(userId) {
    const { data } = await db
      .from('user_keys')
      .select('public_key')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.public_key ?? null
  },
  async isPro(userId) {
    const { data, error } = await db.rpc('is_pro', { p_user: userId })
    // When the check itself fails, the table's own check still stops a Free account.
    return error ? true : data === true
  },
  async addItem(userId, sealed) {
    const { error } = await db
      .from('inbox_items')
      .insert({ user_id: userId, channel: 'extension', sealed })
    if (error) throw error
  },
}

Deno.serve((req) => handle(req, { store }))
