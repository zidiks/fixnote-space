import { createClient } from 'npm:@supabase/supabase-js@2'
import sodium from 'npm:libsodium-wrappers@0.8.4'
import { type CaptureStore, handle, type TelegramApi } from './handler.ts'

const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const api = (method: string) => `https://api.telegram.org/bot${token}/${method}`

const telegram: TelegramApi = {
  async sendMessage(chatId, text) {
    await fetch(api('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  },
  async react(chatId, messageId, emoji) {
    await fetch(api('setMessageReaction'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji }],
      }),
    })
  },
  async download(fileId, maxBytes) {
    const info = (await (
      await fetch(api('getFile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId }),
      })
    ).json()) as { ok: boolean; result?: { file_path?: string; file_size?: number } }
    const path = info.result?.file_path
    if (!info.ok || !path || (info.result?.file_size ?? 0) > maxBytes) return null
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytes.length > maxBytes ? null : bytes
  },
}

// Service role: the bot writes rows no user can write (links, inbox items).
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: { persistSession: false },
  },
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
  async link(chatId, userId, label) {
    const { error } = await db
      .from('capture_links')
      .upsert({ channel: 'telegram', external_id: chatId, user_id: userId, label })
    if (error) throw error
  },
  async unlink(chatId) {
    const { data } = await db
      .from('capture_links')
      .delete()
      .eq('channel', 'telegram')
      .eq('external_id', chatId)
      .select('user_id')
    return Boolean(data?.length)
  },
  async userForChat(chatId) {
    const { data } = await db
      .from('capture_links')
      .select('user_id')
      .eq('channel', 'telegram')
      .eq('external_id', chatId)
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
  async addItem(userId, sealed) {
    const { error } = await db
      .from('inbox_items')
      .insert({ user_id: userId, channel: 'telegram', sealed })
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

const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
Deno.serve((req) => handle(req, { secret, telegram, store, seal }))
