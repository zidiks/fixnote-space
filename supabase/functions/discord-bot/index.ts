import { createClient } from 'npm:@supabase/supabase-js@2'
import sodium from 'npm:libsodium-wrappers@0.8.4'
import { type CaptureStore, type DiscordApi, handle } from './handler.ts'

const appId = Deno.env.get('DISCORD_APP_ID') ?? ''
const clientSecret = Deno.env.get('DISCORD_CLIENT_SECRET') ?? ''
const api = 'https://discord.com/api/v10'
// The redirect registered in the Discord developer portal (OAuth2 → Redirects).
const redirectUri = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/discord-bot/oauth`

const discord: DiscordApi = {
  async editReply(token, content) {
    await fetch(`${api}/webhooks/${appId}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  },
  async download(url, maxBytes) {
    // Attachments live on Discord's CDN only.
    if (!/^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(url)) return null
    const res = await fetch(url)
    if (!res.ok) return null
    if (Number(res.headers.get('content-length') ?? 0) > maxBytes) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytes.length > maxBytes ? null : bytes
  },
  async userFromCode(code) {
    const token = (await (
      await fetch(`${api}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: appId,
          client_secret: clientSecret,
        }),
      })
    ).json()) as { access_token?: string }
    if (!token.access_token) return null
    const me = (await (
      await fetch(`${api}/users/@me`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      })
    ).json()) as { id?: string; username?: string; global_name?: string | null }
    // Only the id is kept; the token is not needed again.
    return me.id ? { id: me.id, label: me.global_name || me.username || '' } : null
  },
}

// Service role: the bot writes rows no user can write (links, inbox items).
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const store: CaptureStore = {
  async consumeCode(code) {
    const { data } = await db
      .from('capture_codes')
      .delete()
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .select('user_id')
      .maybeSingle()
    return data?.user_id ?? null
  },
  async link(discordUser, userId, label) {
    const { error } = await db
      .from('capture_links')
      .upsert({ channel: 'discord', external_id: discordUser, user_id: userId, label })
    if (error) throw error
  },
  async unlink(discordUser) {
    const { data } = await db
      .from('capture_links')
      .delete()
      .eq('channel', 'discord')
      .eq('external_id', discordUser)
      .select('user_id')
    return Boolean(data?.length)
  },
  async userFor(discordUser) {
    const { data } = await db
      .from('capture_links')
      .select('user_id')
      .eq('channel', 'discord')
      .eq('external_id', discordUser)
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
      .insert({ user_id: userId, channel: 'discord', sealed })
    if (error) throw error
  },
}

async function seal(publicKey: string, message: string) {
  await sodium.ready
  const v = sodium.base64_variants.URLSAFE_NO_PADDING
  return sodium.to_base64(
    sodium.crypto_box_seal(sodium.from_string(message), sodium.from_base64(publicKey, v)),
    v,
  )
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

Deno.serve((req) =>
  handle(req, {
    publicKey: Deno.env.get('DISCORD_PUBLIC_KEY'),
    discord,
    store,
    seal,
    defer: (task) => EdgeRuntime.waitUntil(task),
    doneUrl: 'https://discord.com/channels/@me',
  }),
)
