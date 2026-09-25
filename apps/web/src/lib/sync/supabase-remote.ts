import type {
  NoteType,
  PushResult,
  RemoteFolder,
  RemoteFolderWrite,
  RemoteNote,
  RemoteNoteWrite,
  SyncRemote,
} from '@fixnote/core'
import type { SupabaseClient } from '@supabase/supabase-js'

interface NoteRow {
  id: string
  folder_id: string | null
  type: string
  daily_date: string | null
  wrapped_key: string
  ciphertext: string
  created_at: number
  updated_at: number
  deleted_at: number | null
  version: number
  seq: number
}

interface FolderRow {
  id: string
  parent_id: string | null
  name_sealed: string
  sort: number
  created_at: number
  updated_at: number
  deleted_at: number | null
  version: number
  seq: number
}

type PushResponse<Row> = { ok: true; version: number; seq: number } | { ok: false; current: Row }

const NOTE_COLUMNS =
  'id, folder_id, type, daily_date, wrapped_key, ciphertext, created_at, updated_at, deleted_at, version, seq'
const FOLDER_COLUMNS =
  'id, parent_id, name_sealed, sort, created_at, updated_at, deleted_at, version, seq'

const n = (v: number | string | null) => (v === null ? null : Number(v))

const toNote = (r: NoteRow): RemoteNote => ({
  id: r.id,
  folderId: r.folder_id,
  type: r.type as NoteType,
  dailyDate: r.daily_date,
  wrappedKey: r.wrapped_key,
  ciphertext: r.ciphertext,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
  deletedAt: n(r.deleted_at),
  version: Number(r.version),
  seq: Number(r.seq),
})

const toFolder = (r: FolderRow): RemoteFolder => ({
  id: r.id,
  parentId: r.parent_id,
  nameSealed: r.name_sealed,
  sort: Number(r.sort),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
  deletedAt: n(r.deleted_at),
  version: Number(r.version),
  seq: Number(r.seq),
})

function unwrap<Row, T>(res: PushResponse<Row>, map: (r: Row) => T): PushResult<T> {
  return res.ok
    ? { ok: true, version: Number(res.version), seq: Number(res.seq) }
    : { ok: false, current: map(res.current) }
}

/** SyncRemote over Supabase: reads through RLS-protected tables, writes through the push RPCs. */
export function supabaseRemote(client: SupabaseClient): SyncRemote {
  return {
    async pullNotes(after, limit) {
      const { data, error } = await client
        .from('notes')
        .select(NOTE_COLUMNS)
        .gt('seq', after)
        .order('seq')
        .limit(limit)
      if (error) throw error
      return (data as NoteRow[]).map(toNote)
    },
    async pullFolders(after, limit) {
      const { data, error } = await client
        .from('folders')
        .select(FOLDER_COLUMNS)
        .gt('seq', after)
        .order('seq')
        .limit(limit)
      if (error) throw error
      return (data as FolderRow[]).map(toFolder)
    },
    async pushNote(row: RemoteNoteWrite, baseVersion) {
      const { data, error } = await client.rpc('push_note', {
        p_row: {
          id: row.id,
          folder_id: row.folderId,
          type: row.type,
          daily_date: row.dailyDate,
          wrapped_key: row.wrappedKey,
          ciphertext: row.ciphertext,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
        },
        p_base_version: baseVersion,
      })
      if (error) throw error
      return unwrap(data as PushResponse<NoteRow>, toNote)
    },
    async pushFolder(row: RemoteFolderWrite, baseVersion) {
      const { data, error } = await client.rpc('push_folder', {
        p_row: {
          id: row.id,
          parent_id: row.parentId,
          name_sealed: row.nameSealed,
          sort: row.sort,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
        },
        p_base_version: baseVersion,
      })
      if (error) throw error
      return unwrap(data as PushResponse<FolderRow>, toFolder)
    },
  }
}
