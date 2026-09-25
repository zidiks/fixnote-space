import type { SyncRemote } from '@fixnote/core'
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
  /** The default LLM route for the signed-in user, or null when signed out. */
  chatTransport(): Promise<ChatTransport | null>
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
    async chatTransport() {
      const { data } = await client.auth.getSession()
      if (!data.session) return null
      return {
        url: `${config.url}/functions/v1/llm-proxy`,
        headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: config.anonKey },
      }
    },
    subscribe(userId, onChange) {
      const channel = client
        .channel(`sync:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'folders' }, onChange)
        .subscribe()
      return () => void client.removeChannel(channel)
    },
  }
}
