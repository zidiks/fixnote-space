import type { SqlDriver, SqlRow, SqlValue } from '../platform'
import { merge3 } from '../sync/merge'
import { deriveExcerpt, deriveTitle, extractTags, taskProgress, toPlainText } from './markdown'
import { buildFtsQuery } from './search'
import {
  type Counts,
  type Folder,
  MARK_END,
  MARK_START,
  type Note,
  type NoteCursor,
  type NoteFilter,
  type NotePage,
  type NoteSummary,
  type NoteType,
  type SearchHit,
  type TagCount,
} from './types'

type Tx = Pick<SqlDriver, 'execute' | 'query'>

/** Rebuilds a note's tag links from its content. Shared with sync, which writes notes directly. */
export async function syncNoteTags(tx: Tx, noteId: string, content: string) {
  const names = extractTags(content)
  await tx.execute('DELETE FROM note_tags WHERE note_id = ?', [noteId])
  for (const name of names) {
    await tx.execute('INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [name])
    await tx.execute(
      'INSERT OR IGNORE INTO note_tags (note_id, tag_id) SELECT ?, id FROM tags WHERE name = ?',
      [noteId, name],
    )
  }
}

export interface RepoOptions {
  now?: () => number
  newId?: () => string
  /** First line of a conflict copy (see updateContent). */
  conflictHeading?: (at: number) => string
}

interface NoteRow extends SqlRow {
  id: string
  folder_id: string | null
  type: string
  daily_date: string | null
  title: string
  body: string
  tags: string | null
  created_at: number
  updated_at: number
}

/** Enough of the note to compute excerpt, tags and task progress for cards. */
const PREVIEW_CHARS = 4000
const TAG_SEP = '\u001f'

const SUMMARY_COLUMNS = `
  n.id, n.folder_id, n.type, n.daily_date, n.title, n.created_at, n.updated_at,
  (SELECT group_concat(t.name, '${TAG_SEP}') FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
     WHERE nt.note_id = n.id) AS tags`

function toSummary(row: NoteRow): NoteSummary {
  const body = row.body ?? ''
  return {
    id: row.id,
    folderId: row.folder_id,
    type: row.type as NoteType,
    dailyDate: row.daily_date,
    title: row.title,
    excerpt: deriveExcerpt(body),
    tags: row.tags ? row.tags.split(TAG_SEP) : [],
    tasks: taskProgress(body),
    cover: body.match(/!\[[^\]]*\]\(((?:attachment:|https?:\/\/)[^)\s]+)/)?.[1] ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function filterSql(filter: NoteFilter): { where: string[]; params: SqlValue[] } {
  const where = ['n.deleted_at IS NULL']
  const params: SqlValue[] = []
  if (filter.scope === 'inbox') where.push('n.folder_id IS NULL')
  if (filter.folderId) {
    where.push('n.folder_id = ?')
    params.push(filter.folderId)
  }
  if (filter.type) {
    where.push('n.type = ?')
    params.push(filter.type)
  }
  if (filter.updatedSince !== undefined) {
    where.push('n.updated_at >= ?')
    params.push(filter.updatedSince)
  }
  if (filter.tag) {
    // A parent tag also matches its children: #work matches #work/fixnote.
    where.push(`EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = n.id AND (t.name = ? COLLATE NOCASE OR t.name LIKE ? ESCAPE '\\'))`)
    params.push(filter.tag, `${filter.tag.replace(/[\\%_]/g, '\\$&')}/%`)
  }
  return { where, params }
}

export class NotesRepo {
  private readonly now: () => number
  private readonly newId: () => string
  private readonly conflictHeading: (at: number) => string

  constructor(
    private readonly db: SqlDriver,
    opts: RepoOptions = {},
  ) {
    this.now = opts.now ?? Date.now
    this.newId = opts.newId ?? (() => crypto.randomUUID())
    this.conflictHeading =
      opts.conflictHeading ?? ((at) => `Conflict copy · ${new Date(at).toISOString().slice(0, 16)}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async createNote(input: {
    content: string
    folderId?: string | null
    type?: NoteType
    dailyDate?: string | null
    /** Keep the original dates (imports); defaults to now. */
    createdAt?: number
    updatedAt?: number
  }): Promise<Note> {
    const id = this.newId()
    const ts = this.now()
    const created = input.createdAt ?? input.updatedAt ?? ts
    const updated = Math.max(input.updatedAt ?? created, created)
    await this.db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO notes
           (id, folder_id, type, daily_date, title, content, search_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.folderId ?? null,
          input.type ?? 'text',
          input.dailyDate ?? null,
          deriveTitle(input.content),
          input.content,
          toPlainText(input.content),
          created,
          updated,
        ],
      )
      await syncNoteTags(tx, id, input.content)
    })
    return this.getNoteOrThrow(id)
  }

  async getNote(id: string): Promise<Note | null> {
    const [row] = await this.db.query<NoteRow & { content: string }>(
      `SELECT ${SUMMARY_COLUMNS}, n.content AS body, n.content
         FROM notes n WHERE n.id = ? AND n.deleted_at IS NULL`,
      [id],
    )
    return row ? { ...toSummary(row), content: row.content } : null
  }

  private async getNoteOrThrow(id: string): Promise<Note> {
    const note = await this.getNote(id)
    if (!note) throw new Error(`Note ${id} not found`)
    return note
  }

  /**
   * Saves new content. No-op (and no timestamp bump) when the content is unchanged.
   *
   * `base` is the text the edit started from. If the stored text changed since (sync applied a
   * change from another device while the user was typing), the two edits are merged three-way. If
   * they touch the same lines, the edit being typed wins and the other version is kept as a
   * separate conflict copy, so nothing is lost.
   */
  async updateContent(id: string, content: string, opts: { base?: string } = {}): Promise<Note> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.query<{ content: string; folder_id: string | null }>(
        'SELECT content, folder_id FROM notes WHERE id = ? AND deleted_at IS NULL',
        [id],
      )
      if (!row) return
      let next = content
      if (opts.base !== undefined && row.content !== opts.base && row.content !== content) {
        const merged = merge3(content, opts.base, row.content)
        if (merged !== null) next = merged
        else await this.insertConflictCopy(tx, row.content, row.folder_id)
      }
      if (next === row.content) return
      await tx.execute(
        `UPDATE notes SET content = ?, title = ?, search_text = ?, updated_at = ?, dirty = 1, local_rev = local_rev + 1
          WHERE id = ?`,
        [next, deriveTitle(next), toPlainText(next), this.now(), id],
      )
      await syncNoteTags(tx, id, next)
    })
    return this.getNoteOrThrow(id)
  }

  private async insertConflictCopy(tx: Tx, content: string, folderId: string | null) {
    const id = this.newId()
    const ts = this.now()
    const text = `${this.conflictHeading(ts)}\n\n${content}`
    await tx.execute(
      `INSERT INTO notes (id, folder_id, type, title, content, search_text, created_at, updated_at)
       VALUES (?, ?, 'text', ?, ?, ?, ?, ?)`,
      [id, folderId, deriveTitle(text), text, toPlainText(text), ts, ts],
    )
    await syncNoteTags(tx, id, text)
  }

  async moveNote(id: string, folderId: string | null): Promise<void> {
    await this.db.execute(
      `UPDATE notes SET folder_id = ?, updated_at = ?, dirty = 1, local_rev = local_rev + 1
        WHERE id = ? AND deleted_at IS NULL AND folder_id IS NOT ?`,
      [folderId, this.now(), id, folderId],
    )
  }

  /** Soft delete: the row stays for sync and undo. */
  async deleteNote(id: string): Promise<void> {
    const ts = this.now()
    await this.db.execute(
      `UPDATE notes SET deleted_at = ?, updated_at = ?, dirty = 1, local_rev = local_rev + 1 WHERE id = ? AND deleted_at IS NULL`,
      [ts, ts, id],
    )
  }

  async restoreNote(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE notes SET deleted_at = NULL, updated_at = ?, dirty = 1, local_rev = local_rev + 1
        WHERE id = ? AND deleted_at IS NOT NULL`,
      [this.now(), id],
    )
  }

  /** Newest first, keyset-paginated so infinite scroll stays stable while notes change. */
  async listNotes(
    opts: { filter?: NoteFilter; cursor?: NoteCursor | null; limit?: number } = {},
  ): Promise<NotePage> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200)
    const { where, params } = filterSql(opts.filter ?? {})
    if (opts.cursor) {
      where.push('(n.updated_at < ? OR (n.updated_at = ? AND n.id < ?))')
      params.push(opts.cursor.updatedAt, opts.cursor.updatedAt, opts.cursor.id)
    }
    const rows = await this.db.query<NoteRow>(
      `SELECT ${SUMMARY_COLUMNS}, substr(n.content, 1, ${PREVIEW_CHARS}) AS body
         FROM notes n WHERE ${where.join(' AND ')}
        ORDER BY n.updated_at DESC, n.id DESC LIMIT ?`,
      [...params, limit + 1],
    )
    const items = rows.slice(0, limit).map(toSummary)
    const last = items.at(-1)
    return {
      items,
      nextCursor: rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
    }
  }

  async search(
    input: string,
    opts: { limit?: number; filter?: NoteFilter } = {},
  ): Promise<SearchHit[]> {
    const match = buildFtsQuery(input)
    if (!match) return []
    const { where, params } = filterSql(opts.filter ?? {})
    const rows = await this.db.query<NoteRow & { snip: string }>(
      `SELECT ${SUMMARY_COLUMNS}, substr(n.content, 1, ${PREVIEW_CHARS}) AS body,
              snippet(notes_fts, 1, '${MARK_START}', '${MARK_END}', '…', 12) AS snip
         FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
        WHERE notes_fts MATCH ? AND ${where.join(' AND ')}
        ORDER BY bm25(notes_fts, 4.0, 1.0), n.updated_at DESC
        LIMIT ?`,
      [match, ...params, opts.limit ?? 20],
    )
    return rows.map((row) => ({ note: toSummary(row), snippet: row.snip ?? '' }))
  }

  /**
   * The daily note for a local date (`YYYY-MM-DD`), created from `template` on first open.
   * Safe to call concurrently: the unique index keeps one note per day.
   */
  /** Content of every live note (for duplicate checks on import). */
  async allContents(): Promise<string[]> {
    const rows = await this.db.query<{ content: string }>(
      'SELECT content FROM notes WHERE deleted_at IS NULL',
    )
    return rows.map((r) => r.content)
  }

  async hasDaily(date: string): Promise<boolean> {
    return (await this.findDaily(date)) !== null
  }

  async getOrCreateDaily(date: string, template: () => string): Promise<Note> {
    const existing = await this.findDaily(date)
    if (existing) return existing
    try {
      return await this.createNote({ content: template(), type: 'daily', dailyDate: date })
    } catch (err) {
      const raced = await this.findDaily(date)
      if (raced) return raced
      throw err
    }
  }

  /** The nearest daily note before or after `date` (YYYY-MM-DD) that exists. */
  async adjacentDaily(
    date: string,
    direction: 'before' | 'after',
  ): Promise<{ id: string; dailyDate: string } | null> {
    const [row] = await this.db.query<{ id: string; daily_date: string }>(
      direction === 'before'
        ? `SELECT id, daily_date FROM notes WHERE type = 'daily' AND daily_date < ?
             AND deleted_at IS NULL ORDER BY daily_date DESC LIMIT 1`
        : `SELECT id, daily_date FROM notes WHERE type = 'daily' AND daily_date > ?
             AND deleted_at IS NULL ORDER BY daily_date ASC LIMIT 1`,
      [date],
    )
    return row ? { id: row.id, dailyDate: row.daily_date } : null
  }

  private async findDaily(date: string): Promise<Note | null> {
    const [row] = await this.db.query<{ id: string }>(
      'SELECT id FROM notes WHERE daily_date = ? AND deleted_at IS NULL',
      [date],
    )
    return row ? this.getNote(row.id) : null
  }

  async counts(): Promise<Counts> {
    const [row] = await this.db.query<{ all: number; inbox: number; daily: number }>(
      `SELECT count(*) AS "all",
              coalesce(sum(folder_id IS NULL), 0) AS inbox,
              coalesce(sum(type = 'daily'), 0) AS daily
         FROM notes WHERE deleted_at IS NULL`,
    )
    return {
      all: Number(row?.all ?? 0),
      inbox: Number(row?.inbox ?? 0),
      daily: Number(row?.daily ?? 0),
    }
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  /** Tags on live notes, most used first. */
  async listTags(): Promise<TagCount[]> {
    const rows = await this.db.query<{ name: string; count: number }>(
      `SELECT t.name, count(*) AS count
         FROM tags t JOIN note_tags nt ON nt.tag_id = t.id
         JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
        GROUP BY t.id ORDER BY count DESC, t.name COLLATE NOCASE`,
    )
    return rows.map((r) => ({ name: r.name, count: Number(r.count) }))
  }

  // ── Folders ────────────────────────────────────────────────────────────────

  async listFolders(): Promise<Folder[]> {
    const rows = await this.db.query<{
      id: string
      parent_id: string | null
      name: string
      sort: number
      note_count: number
    }>(
      `SELECT f.id, f.parent_id, f.name, f.sort,
              (SELECT count(*) FROM notes n WHERE n.folder_id = f.id AND n.deleted_at IS NULL) AS note_count
         FROM folders f WHERE f.deleted_at IS NULL
        ORDER BY f.sort, f.name COLLATE NOCASE`,
    )
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      name: r.name,
      sort: Number(r.sort),
      noteCount: Number(r.note_count),
    }))
  }

  async createFolder(name: string, parentId: string | null = null): Promise<Folder> {
    const clean = name.trim()
    if (!clean) throw new Error('Folder name is empty')
    const id = this.newId()
    const ts = this.now()
    const [max] = await this.db.query<{ m: number | null }>(
      'SELECT max(sort) AS m FROM folders WHERE parent_id IS ? AND deleted_at IS NULL',
      [parentId],
    )
    const sort = Number(max?.m ?? 0) + 1
    await this.db.execute(
      'INSERT INTO folders (id, parent_id, name, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, parentId, clean, sort, ts, ts],
    )
    return { id, parentId, name: clean, sort, noteCount: 0 }
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const clean = name.trim()
    if (!clean) throw new Error('Folder name is empty')
    await this.db.execute(
      `UPDATE folders SET name = ?, updated_at = ?, dirty = 1, local_rev = local_rev + 1 WHERE id = ? AND name IS NOT ?`,
      [clean, this.now(), id, clean],
    )
  }

  /**
   * Removes a folder and its subfolders. Their notes are never deleted with them: they move back to
   * Inbox, so nothing the user wrote disappears as a side effect of tidying.
   */
  async deleteFolder(id: string): Promise<void> {
    const ts = this.now()
    await this.db.transaction(async (tx) => {
      const subtree = `WITH RECURSIVE sub(id) AS (
          SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id)
        SELECT id FROM sub`
      await tx.execute(
        `UPDATE notes SET folder_id = NULL, updated_at = ?, dirty = 1, local_rev = local_rev + 1
          WHERE folder_id IN (${subtree})`,
        [ts, id],
      )
      await tx.execute(
        `UPDATE folders SET deleted_at = ?, updated_at = ?, dirty = 1, local_rev = local_rev + 1
          WHERE id IN (${subtree}) AND deleted_at IS NULL`,
        [ts, ts, id],
      )
    })
  }
}
