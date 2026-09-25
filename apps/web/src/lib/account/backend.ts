import type { AttachmentRemote, FetchedPage, InboxRemote, SyncRemote } from '@fixnote/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseRemote } from '../sync/supabase-remote'

export interface Session {
  userId: string
  email: string
}

/** Where the assistant's chat requests go (an OpenAI-compatible endpoint). */
export interface ChatTransport {
  url: string
  headers: Record<string, string>
  fetch?: typeof fetch
}

/** A chat linked to the account (Telegram today). */
export interface CaptureLink {
  channel: string
  externalId: string
  label: string
  createdAt: string
}

export interface UserKeysRow {
  publicKey: string
  keyCheck: string
}

/** Everything account and sync need from the server. Supabase in production. */
export interface AccountBackend {
  getSession(): Promise<Session | null>
  sendCode(email: string, lang: string): Promise<void>
  verifyCode(email: string, code: string): Promise<Session>
  signOut(): Promise<void>
  getUserKeys(): Promise<UserKeysRow | null>
  createUserKeys(row: UserKeysRow): Promise<void>
  remote: SyncRemote
  /** Encrypted attachment files of this user. */
  attachments(userId: string): AttachmentRemote
  /** Sealed messages from capture channels, waiting for a device. */
  inbox: InboxRemote
  /** One-time code for t.me/<bot>?start=<code>. */
  createCaptureCode(): Promise<string>
  captureLinks(): Promise<CaptureLink[]>
  unlinkCapture(link: CaptureLink): Promise<void>
  /** The default LLM route for the signed-in user, or null when signed out. */
  chatTransport(): Promise<ChatTransport | null>
  /** Reads a public page's <head> through the `unfurl` function; null when signed out. */
  fetchPage(url: string): Promise<FetchedPage | null>
  /** Calls back when another device changed something. Returns an unsubscribe. */
  subscribe(userId: string, onChange: () => void): () => void
}

export function supabaseBackend(
  client: SupabaseClient,
  config: { url: string; anonKey: string },
): AccountBackend {
  const session = (s: { user: { id: string; email?: string } } | null): Session | null =>
    s ? { userId: s.user.id, email: s.user.email ?? '' } : null

  return {
    async getSession() {
      const { data } = await client.auth.getSession()
      return session(data.session)
    },
    async sendCode(email, lang) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, data: { lang } },
      })
      if (error) throw error
    },
    async verifyCode(email, code) {
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error || !data.session) throw error ?? new Error('No session')
      return session(data.session) as Session
    },
    async signOut() {
      await client.auth.signOut()
    },
    async getUserKeys() {
      const { data, error } = await client
        .from('user_keys')
        .select('public_key, key_check')
        .maybeSingle()
      if (error) throw error
      return data ? { publicKey: data.public_key, keyCheck: data.key_check } : null
    },
    async createUserKeys(row) {
      const { error } = await client
        .from('user_keys')
        .insert({ public_key: row.publicKey, key_check: row.keyCheck })
      if (error) throw error
    },
    remote: supabaseRemote(client),
    attachments(userId) {
      const bucket = () => client.storage.from('attachments')
      return {
        async upload(id, blob) {
          const { error } = await bucket().upload(`${userId}/${id}`, blob, {
            contentType: 'application/octet-stream',
            upsert: true,
          })
          if (error) throw error
        },
        async download(id) {
          const { data, error } = await bucket().download(`${userId}/${id}`)
          if (error) {
            if (
              /not found|404|400/i.test(
                `${error.message} ${(error as { status?: number }).status ?? ''}`,
              )
            )
              return null
            throw error
          }
          return new Uint8Array(await data.arrayBuffer())
        },
      }
    },
    async chatTransport() {
      const { data } = await client.auth.getSession()
      if (!data.session) return null
      return {
        url: `${config.url}/functions/v1/llm-proxy`,
        headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: config.anonKey },
      }
    },
    inbox: {
      async list() {
        const { data, error } = await client
          .from('inbox_items')
          .select('id, channel, sealed')
          .order('created_at')
          .limit(50)
        if (error) throw error
        return data ?? []
      },
      async remove(id) {
        const { error } = await client.from('inbox_items').delete().eq('id', id)
        if (error) throw error
      },
    },
    async createCaptureCode() {
      const { data, error } = await client.rpc('create_capture_code')
      if (error) throw error
      return data as string
    },
    async captureLinks() {
      const { data, error } = await client
        .from('capture_links')
        .select('channel, external_id, label, created_at')
        .order('created_at')
      if (error) throw error
      return (data ?? []).map((r) => ({
        channel: r.channel,
        externalId: r.external_id,
        label: r.label ?? '',
        createdAt: r.created_at,
      }))
    },
    async unlinkCapture(link) {
      const { error } = await client
        .from('capture_links')
        .delete()
        .eq('channel', link.channel)
        .eq('external_id', link.externalId)
      if (error) throw error
    },
    async fetchPage(url) {
      const { data } = await client.auth.getSession()
      if (!data.session) return null
      const res = await fetch(`${config.url}/functions/v1/unfurl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
          apikey: config.anonKey,
        },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error(`unfurl: HTTP ${res.status}`)
      return (await res.json()) as FetchedPage
    },
    subscribe(userId, onChange) {
      const channel = client
        .channel(`sync:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'folders' }, onChange)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'inbox_items' },
          onChange,
        )
        .subscribe()
      return () => void client.removeChannel(channel)
    },
  }
}
