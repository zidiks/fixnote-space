import type { SaveResult, SharedMember, SharedRemote, SharedRole } from '@fixnote/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toError } from '../errors'

/**
 * Shared notes on Supabase (supabase/migrations/*_shared_notes.sql, *_shared_invites.sql): tables
 * read, RPCs write.
 */
export function supabaseSharedRemote(client: SupabaseClient, userId: string): SharedRemote {
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(name, args)
    if (error) throw toError(error)
    return data as T
  }
  return {
    async memberships() {
      const { data, error } = await client
        .from('shared_note_members')
        .select(
          'note_id, role, wrapped_key, accepted, shared_notes!inner(origin_note_id, owner_id)',
        )
        .eq('user_id', userId)
      if (error) throw toError(error)
      type Row = {
        note_id: string
        role: SharedRole
        wrapped_key: string
        accepted: boolean
        shared_notes: { origin_note_id: string; owner_id: string }
      }
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        sharedId: r.note_id,
        role: r.role,
        wrappedKey: r.wrapped_key,
        originNoteId: r.shared_notes.origin_note_id,
        ownerId: r.shared_notes.owner_id,
        accepted: r.accepted,
      }))
    },
    async state(id) {
      const { data, error } = await client
        .from('shared_notes')
        .select('state, version')
        .eq('id', id)
        .maybeSingle()
      if (error) throw toError(error)
      return data ? { state: data.state as string | null, version: Number(data.version) } : null
    },
    share: (origin, wrappedKey) =>
      rpc<string>('share_note', { p_origin: origin, p_wrapped_key: wrappedKey, p_state: null }),
    accept: (id) => rpc('accept_shared_note', { p_note: id }),
    saveState: (id, state, base) =>
      rpc<SaveResult>('save_shared_state', { p_note: id, p_state: state, p_base_version: base }),
    async findUser(email) {
      const rows = await rpc<{ user_id: string; public_key: string }[]>('find_user_key', {
        p_email: email,
      })
      const row = rows?.[0]
      return row ? { userId: row.user_id, publicKey: row.public_key } : null
    },
    addMember: (id, user, role, wrappedKey) =>
      rpc('add_shared_member', {
        p_note: id,
        p_user: user,
        p_role: role,
        p_wrapped_key: wrappedKey,
      }),
    setRole: (id, user, role) => rpc('set_shared_role', { p_note: id, p_user: user, p_role: role }),
    removeMember: (id, user) => rpc('remove_shared_member', { p_note: id, p_user: user }),
    unshare: (id) => rpc('unshare_note', { p_note: id }),
    async members(id) {
      const { data, error } = await client
        .from('shared_note_members')
        .select('user_id, email, role, accepted')
        .eq('note_id', id)
        .order('created_at')
      if (error) throw toError(error)
      type Row = { user_id: string; email: string; role: SharedRole; accepted: boolean }
      return ((data ?? []) as Row[]).map(
        (r): SharedMember => ({
          userId: r.user_id,
          email: r.email,
          role: r.role,
          accepted: r.accepted,
        }),
      )
    },
  }
}
