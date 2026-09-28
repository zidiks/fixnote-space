import type {
  FolderNote,
  SaveResult,
  SharedFolderMembership,
  SharedMember,
  SharedRemote,
  SharedRole,
} from '@fixnote/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toError } from '../errors'

type MemberRow = {
  user_id: string
  email: string
  role: SharedRole
  accepted: boolean
  invited_at: string
}

const toMember = (r: MemberRow): SharedMember => ({
  userId: r.user_id,
  email: r.email,
  role: r.role,
  accepted: r.accepted,
  invitedAt: Date.parse(r.invited_at),
})

/**
 * Shared notes and folders on Supabase (supabase/migrations/*_shared_notes.sql,
 * *_shared_invites.sql, *_shared_folders.sql): tables read, RPCs write.
 */
export function supabaseSharedRemote(client: SupabaseClient, userId: string): SharedRemote {
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(name, args)
    if (error) throw toError(error)
    return data as T
  }
  const members = async (table: string, key: string, id: string) => {
    const { data, error } = await client
      .from(table)
      .select('user_id, email, role, accepted, invited_at')
      .eq(key, id)
      .order('created_at')
    if (error) throw toError(error)
    return ((data ?? []) as MemberRow[]).map(toMember)
  }
  return {
    async memberships() {
      const { data, error } = await client
        .from('shared_note_members')
        .select(
          'note_id, role, wrapped_key, accepted, invited_at, shared_notes!inner(origin_note_id, owner_id, deleted_at)',
        )
        .eq('user_id', userId)
        .is('shared_notes.deleted_at', null)
      if (error) throw toError(error)
      type Row = {
        note_id: string
        role: SharedRole
        wrapped_key: string
        accepted: boolean
        invited_at: string
        shared_notes: { origin_note_id: string; owner_id: string }
      }
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        sharedId: r.note_id,
        role: r.role,
        wrappedKey: r.wrapped_key,
        originNoteId: r.shared_notes.origin_note_id,
        ownerId: r.shared_notes.owner_id,
        accepted: r.accepted,
        invitedAt: Date.parse(r.invited_at),
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
    members: (id) => members('shared_note_members', 'note_id', id),

    async folderMemberships() {
      const { data, error } = await client
        .from('shared_folder_members')
        .select(
          'folder_id, role, wrapped_key, accepted, invited_at, shared_folders!inner(origin_folder_id, owner_id, name, layout, layout_version)',
        )
        .eq('user_id', userId)
      if (error) throw toError(error)
      type Row = {
        folder_id: string
        role: SharedRole
        wrapped_key: string
        accepted: boolean
        invited_at: string
        shared_folders: {
          origin_folder_id: string
          owner_id: string
          name: string
          layout: string | null
          layout_version: number
        }
      }
      return ((data ?? []) as unknown as Row[]).map(
        (r): SharedFolderMembership => ({
          folderId: r.folder_id,
          role: r.role,
          wrappedKey: r.wrapped_key,
          originFolderId: r.shared_folders.origin_folder_id,
          ownerId: r.shared_folders.owner_id,
          accepted: r.accepted,
          invitedAt: Date.parse(r.invited_at),
          name: r.shared_folders.name,
          layout: r.shared_folders.layout,
          layoutVersion: Number(r.shared_folders.layout_version),
        }),
      )
    },
    async folderNotes(folderIds) {
      if (!folderIds.length) return []
      const { data, error } = await client
        .from('shared_notes')
        .select('id, folder_id, folder_key, origin_note_id, created_by, deleted_at')
        .in('folder_id', folderIds)
      if (error) throw toError(error)
      type Row = {
        id: string
        folder_id: string
        folder_key: string | null
        origin_note_id: string
        created_by: string | null
        deleted_at: string | null
      }
      return ((data ?? []) as Row[]).map(
        (r): FolderNote => ({
          sharedId: r.id,
          folderId: r.folder_id,
          folderKey: r.folder_key ?? '',
          originNoteId: r.origin_note_id,
          createdBy: r.created_by,
          deleted: r.deleted_at !== null,
        }),
      )
    },
    shareFolder: (origin, wrappedKey, name) =>
      rpc<string>('share_folder', { p_origin: origin, p_wrapped_key: wrappedKey, p_name: name }),
    renameFolder: (id, name) => rpc('rename_shared_folder', { p_folder: id, p_name: name }),
    saveFolderLayout: (id, layout, base) =>
      rpc<SaveResult>('save_folder_layout', {
        p_folder: id,
        p_layout: layout,
        p_base_version: base,
      }),
    acceptFolder: (id) => rpc('accept_shared_folder', { p_folder: id }),
    addFolderMember: (id, user, role, wrappedKey) =>
      rpc('add_folder_member', {
        p_folder: id,
        p_user: user,
        p_role: role,
        p_wrapped_key: wrappedKey,
      }),
    setFolderRole: (id, user, role) =>
      rpc('set_folder_role', { p_folder: id, p_user: user, p_role: role }),
    removeFolderMember: (id, user) => rpc('remove_folder_member', { p_folder: id, p_user: user }),
    unshareFolder: (id) => rpc('unshare_folder', { p_folder: id }),
    folderMembers: (id) => members('shared_folder_members', 'folder_id', id),
    shareInFolder: (folderId, origin, folderKey) =>
      rpc<string>('share_note_in_folder', {
        p_folder: folderId,
        p_origin: origin,
        p_folder_key: folderKey,
      }),
    attachToFolder: (id, folderId, folderKey) =>
      rpc('attach_note_to_folder', { p_note: id, p_folder: folderId, p_folder_key: folderKey }),
    removeFromFolder: (id) => rpc('remove_note_from_folder', { p_note: id }),
    deleteFolderNote: (id) => rpc('delete_folder_note', { p_note: id }),
  }
}
