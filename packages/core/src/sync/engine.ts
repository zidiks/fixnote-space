import {
  type AccountKeys,
  decryptFolderName,
  decryptNote,
  encryptFolderName,
  encryptNote,
} from '../crypto'
import { mergeDailyNotes } from '../notes/daily'
import { deriveTitle, toPlainText } from '../notes/markdown'
import type { NoteType } from '../notes/types'
import type { SqlDriver, SqlRow } from '../platform'
import { merge3 } from './merge'
import type { RemoteFolder, RemoteNote, SyncRemote, SyncReport } from './types'

type Tx = Pick<SqlDriver, 'execute' | 'query'>

const PAGE = 200
const MAX_PUSH_ATTEMPTS = 3
const CURSOR_NOTES = 'sync.notes.seq'
const CURSOR_FOLDERS = 'sync.folders.seq'

interface LocalNote extends SqlRow {
  id: string
  folder_id: string | null
  type: string
  daily_date: string | null
  content: string
  base_content: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
  pinned_at: number | null
  pin_updated_at: number | null
  sync_version: number
  dirty: number
  local_rev: number
  /** Set when the note is shared with other people: it syncs as a shared note instead. */
  shared_id: string | null
}

interface LocalFolder extends SqlRow {
  id: string
  parent_id: string | null
  name: string
  sort: number
  created_at: number
  updated_at: number
  deleted_at: number | null
  sync_version: number
  dirty: number
  local_rev: number
}

export interface SyncEngineOptions {
  now?: () => number
  newId?: () => string
  /** First line of a conflict copy, e.g. "Conflict copy · 25 Sep 2026, 10:15". */
  conflictHeading?: (at: number) => string
}

async function getCursor(tx: Tx, key: string): Promise<number> {
  const [row] = await tx.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])
  return row ? Number(row.value) : 0
}

async function setCursor(tx: Tx, key: string, seq: number) {
  await tx.execute(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, String(seq)],
  )
}

/**
 * Two-way sync of notes and folders with an end-to-end encrypted remote.
 *
 * Order: pull folders, pull notes, push folders, push notes. Content merges three-way against the
 * last synced text; if both sides touched the same lines, the remote version wins in place and the
 * local one is kept as a separate conflict copy, so nothing anyone wrote is lost. Metadata (folder,
 * deletion) is last-writer-wins by `updated_at`.
 */
export class SyncEngine {
  private running: Promise<SyncReport> | null = null
  private readonly now: () => number
  private readonly newId: () => string
  private readonly conflictHeading: (at: number) => string

  constructor(
    private readonly db: SqlDriver,
    private readonly remote: SyncRemote,
    private readonly keys: AccountKeys,
    opts: SyncEngineOptions = {},
  ) {
    this.now = opts.now ?? Date.now
    this.newId = opts.newId ?? (() => crypto.randomUUID())
    this.conflictHeading =
      opts.conflictHeading ?? ((at) => `Conflict copy · ${new Date(at).toISOString().slice(0, 16)}`)
  }

  /** Runs one full sync. Calls made while one is running join it and then run once more. */
  sync(): Promise<SyncReport> {
    const previous = this.running
    const next = (async () => {
      if (previous) await previous.catch(() => undefined)
      return this.syncOnce()
    })()
    this.running = next
    void next.finally(() => {
      if (this.running === next) this.running = null
    })
    return next
  }

  private async syncOnce(): Promise<SyncReport> {
    const report: SyncReport = {
      pulled: 0,
      pushed: 0,
      merged: 0,
      conflictCopies: 0,
      dailiesMerged: 0,
    }
    await this.pullFolders(report)
    await this.pullNotes(report)
    await this.pushFolders(report)
    await this.pushNotes(report)
    return report
  }

  // ── Pull ─────────────────────────────────────────────────────────────────

  private async pullFolders(report: SyncReport) {
    // Folders are few; take them all and apply in one transaction so parents and children can
    // arrive in any order (foreign keys are checked at commit).
    let cursor = await getCursor(this.db, CURSOR_FOLDERS)
    const rows: RemoteFolder[] = []
    for (;;) {
      const page = await this.remote.pullFolders(cursor, PAGE)
      if (!page.length) break
      rows.push(...page)
      cursor = Math.max(cursor, ...page.map((r) => r.seq))
      if (page.length < PAGE) break
    }
    if (!rows.length) return
    await this.db.transaction(async (tx) => {
      await tx.execute('PRAGMA defer_foreign_keys = ON')
      for (const row of rows) if (await this.applyFolder(tx, row)) report.pulled++
      await setCursor(tx, CURSOR_FOLDERS, cursor)
    })
  }

  private async applyFolder(tx: Tx, r: RemoteFolder): Promise<boolean> {
    const [local] = await tx.query<LocalFolder>('SELECT * FROM folders WHERE id = ?', [r.id])
    if (local && r.version <= local.sync_version) return false
    const name = decryptFolderName(this.keys, r.id, r.nameSealed)
    if (local?.dirty && local.updated_at >= r.updatedAt) {
      // Local change is newer: keep it, but rebase onto the server version so the push goes through.
      await tx.execute('UPDATE folders SET sync_version = ? WHERE id = ?', [r.version, r.id])
      return true
    }
    await tx.execute(
      `INSERT INTO folders (id, parent_id, name, sort, created_at, updated_at, deleted_at,
                            sync_version, dirty, local_rev)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
       ON CONFLICT (id) DO UPDATE SET parent_id = excluded.parent_id, name = excluded.name,
         sort = excluded.sort, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
         sync_version = excluded.sync_version, dirty = 0`,
      [r.id, r.parentId, name, r.sort, r.createdAt, r.updatedAt, r.deletedAt, r.version],
    )
    return true
  }

  private async pullNotes(report: SyncReport) {
    let cursor = await getCursor(this.db, CURSOR_NOTES)
    for (;;) {
      const page = await this.remote.pullNotes(cursor, PAGE)
      if (!page.length) break
      cursor = Math.max(cursor, ...page.map((r) => r.seq))
      await this.db.transaction(async (tx) => {
        for (const row of page) await this.applyNote(tx, row, report)
        await setCursor(tx, CURSOR_NOTES, cursor)
      })
      if (page.length < PAGE) break
    }
  }

  /** Brings one remote note into the local database, merging with unpushed local edits. */
  private async applyNote(tx: Tx, r: RemoteNote, report: SyncReport) {
    const [local] = await tx.query<LocalNote>('SELECT * FROM notes WHERE id = ?', [r.id])
    if (local && r.version <= local.sync_version) return
    // A note shared since: its text now lives in the shared note; the personal copy is left as is.
    if (local?.shared_id) return
    const theirs = decryptNote(this.keys, r.id, {
      wrappedKey: r.wrappedKey,
      ciphertext: r.ciphertext,
    })
    report.pulled++

    const folderId = await this.existingFolder(tx, r.folderId)

    if (!local) {
      const daily = await this.claimDailyDate(
        tx,
        r.id,
        r.deletedAt ? null : r.dailyDate,
        theirs,
        report,
      )
      const content = daily.content
      const deletedAt = daily.lost ? this.now() : r.deletedAt
      await tx.execute(
        `INSERT INTO notes (id, folder_id, type, daily_date, title, content, search_text,
                            created_at, updated_at, deleted_at, pinned_at, pin_updated_at,
                            sync_version, dirty, local_rev, base_content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          r.id,
          folderId,
          r.type,
          daily.date,
          deriveTitle(content),
          content,
          toPlainText(content),
          r.createdAt,
          daily.lost ? (deletedAt as number) : r.updatedAt,
          deletedAt,
          r.pinnedAt ?? null,
          r.pinUpdatedAt ?? null,
          r.version,
          // Changed here (merged with, or into, another daily note): push it back.
          content !== theirs || daily.lost ? 1 : 0,
          theirs,
        ],
      )
      return
    }

    const localMetaWins = local.dirty === 1 && local.updated_at > r.updatedAt
    const meta = localMetaWins
      ? { folderId: local.folder_id, deletedAt: local.deleted_at, updatedAt: local.updated_at }
      : { folderId, deletedAt: r.deletedAt, updatedAt: Math.max(r.updatedAt, local.updated_at) }

    let content = theirs
    let dirty = localMetaWins ? 1 : 0
    // The pin is merged on its own: the latest pin change wins, whoever edited the text.
    const localPinWins =
      local.dirty === 1 && Number(local.pin_updated_at ?? 0) > Number(r.pinUpdatedAt ?? 0)
    const pin = localPinWins
      ? { pinnedAt: local.pinned_at, pinUpdatedAt: local.pin_updated_at }
      : { pinnedAt: r.pinnedAt ?? null, pinUpdatedAt: r.pinUpdatedAt ?? null }
    if (localPinWins) dirty = 1
    if (local.dirty === 1 && local.content !== theirs) {
      const merged = merge3(local.content, local.base_content ?? '', theirs)
      if (merged !== null) {
        content = merged
        if (merged !== theirs) {
          dirty = 1
          report.merged++
        }
      } else {
        await this.writeConflictCopy(tx, local)
        report.conflictCopies++
      }
    }

    const daily = await this.claimDailyDate(
      tx,
      r.id,
      meta.deletedAt ? null : r.dailyDate,
      content,
      report,
    )
    const dailyDate = daily.date
    if (daily.content !== content) {
      content = daily.content
      dirty = 1
    }
    if (daily.lost) {
      meta.deletedAt = this.now()
      meta.updatedAt = meta.deletedAt
      dirty = 1
    }

    await tx.execute(
      `UPDATE notes SET folder_id = ?, type = ?, daily_date = ?, title = ?, content = ?, search_text = ?,
              updated_at = ?, deleted_at = ?, pinned_at = ?, pin_updated_at = ?, sync_version = ?,
              base_content = ?, dirty = ?
        WHERE id = ?`,
      [
        meta.folderId,
        r.type,
        dailyDate,
        deriveTitle(content),
        content,
        toPlainText(content),
        meta.updatedAt,
        meta.deletedAt,
        pin.pinnedAt,
        pin.pinUpdatedAt,
        r.version,
        theirs,
        dirty,
        r.id,
      ],
    )
  }

  /** A folder id if it exists locally; otherwise null (the note shows in Inbox until it arrives). */
  private async existingFolder(tx: Tx, id: string | null): Promise<string | null> {
    if (!id) return null
    const [row] = await tx.query('SELECT 1 AS ok FROM folders WHERE id = ?', [id])
    return row ? id : null
  }

  /**
   * One daily note per date. Two devices can each create one offline: the note with the smaller id
   * keeps the date and gets the other's text (each task once), the other one is deleted.
   * Deterministic (the same two texts give the same result), so devices converge without talking.
   * For the incoming note `id` with `content`: the date it keeps, its text, and whether it lost.
   */
  private async claimDailyDate(
    tx: Tx,
    id: string,
    date: string | null,
    content: string,
    report: SyncReport,
  ): Promise<{ date: string | null; content: string; lost: boolean }> {
    if (!date) return { date: null, content, lost: false }
    const [holder] = await tx.query<{ id: string; content: string }>(
      'SELECT id, content FROM notes WHERE daily_date = ? AND deleted_at IS NULL AND id != ?',
      [date, id],
    )
    if (!holder) return { date, content, lost: false }
    report.dailiesMerged++
    const ts = this.now()
    if (holder.id < id) {
      // The note already here keeps the date and takes in the incoming one.
      const merged = mergeDailyNotes(holder.content, content)
      await tx.execute(
        `UPDATE notes SET content = ?, title = ?, search_text = ?, updated_at = ?, dirty = 1,
                local_rev = local_rev + 1
          WHERE id = ?`,
        [merged, deriveTitle(merged), toPlainText(merged), ts, holder.id],
      )
      return { date: null, content, lost: true }
    }
    await tx.execute(
      `UPDATE notes SET daily_date = NULL, deleted_at = ?, updated_at = ?, dirty = 1,
              local_rev = local_rev + 1
        WHERE id = ?`,
      [ts, ts, holder.id],
    )
    return { date, content: mergeDailyNotes(content, holder.content), lost: false }
  }

  private async writeConflictCopy(tx: Tx, local: LocalNote) {
    const id = this.newId()
    const ts = this.now()
    const content = `${this.conflictHeading(ts)}\n\n${local.content}`
    // Remembered here, so the app can offer to compare the two versions.
    await tx.execute(
      'INSERT OR REPLACE INTO sync_conflicts (copy_id, note_id, created_at) VALUES (?, ?, ?)',
      [id, local.id, ts],
    )
    await tx.execute(
      `INSERT INTO notes (id, folder_id, type, daily_date, title, content, search_text,
                          created_at, updated_at, deleted_at, sync_version, dirty, local_rev)
       VALUES (?, ?, 'text', NULL, ?, ?, ?, ?, ?, NULL, 0, 1, 1)`,
      [id, local.folder_id, deriveTitle(content), content, toPlainText(content), ts, ts],
    )
  }

  // ── Push ─────────────────────────────────────────────────────────────────

  private async pushFolders(report: SyncReport) {
    // Someone else's shared folder (its copy here) is theirs, not part of this account's folders.
    const rows = await this.db.query<LocalFolder>(
      'SELECT * FROM folders WHERE dirty = 1 AND shared_id IS NULL',
    )
    for (const row of rows) {
      let local: LocalFolder | undefined = row
      for (let attempt = 0; local && attempt < MAX_PUSH_ATTEMPTS; attempt++) {
        const res = await this.remote.pushFolder(
          {
            id: local.id,
            parentId: local.parent_id,
            nameSealed: encryptFolderName(this.keys, local.id, local.name),
            sort: Number(local.sort),
            createdAt: Number(local.created_at),
            updatedAt: Number(local.updated_at),
            deletedAt: local.deleted_at === null ? null : Number(local.deleted_at),
          },
          Number(local.sync_version),
        )
        if (res.ok) {
          await this.db.execute(
            `UPDATE folders SET sync_version = ?, dirty = CASE WHEN local_rev = ? THEN 0 ELSE 1 END
              WHERE id = ?`,
            [res.version, local.local_rev, local.id],
          )
          report.pushed++
          break
        }
        await this.db.transaction(async (tx) => {
          await tx.execute('PRAGMA defer_foreign_keys = ON')
          await this.applyFolder(tx, res.current)
        })
        ;[local] = await this.db.query<LocalFolder>(
          'SELECT * FROM folders WHERE id = ? AND dirty = 1',
          [row.id],
        )
      }
    }
  }

  private async pushNotes(report: SyncReport) {
    // Shared notes sync as shared notes (SharedNotes), not as this account's personal ones.
    const rows = await this.db.query<LocalNote>(
      'SELECT * FROM notes WHERE dirty = 1 AND shared_id IS NULL',
    )
    for (const row of rows) {
      let local: LocalNote | undefined = row
      for (let attempt = 0; local && attempt < MAX_PUSH_ATTEMPTS; attempt++) {
        const sealed = encryptNote(this.keys, local.id, local.content)
        const res = await this.remote.pushNote(
          {
            id: local.id,
            folderId: local.folder_id,
            type: local.type as NoteType,
            dailyDate: local.daily_date,
            wrappedKey: sealed.wrappedKey,
            ciphertext: sealed.ciphertext,
            createdAt: Number(local.created_at),
            updatedAt: Number(local.updated_at),
            deletedAt: local.deleted_at === null ? null : Number(local.deleted_at),
            pinnedAt: local.pinned_at === null ? null : Number(local.pinned_at),
            pinUpdatedAt: local.pin_updated_at === null ? null : Number(local.pin_updated_at),
          },
          Number(local.sync_version),
        )
        if (res.ok) {
          // Clear `dirty` only if nothing was edited while the push was in flight.
          await this.db.execute(
            `UPDATE notes SET sync_version = ?, base_content = ?,
                    dirty = CASE WHEN local_rev = ? THEN 0 ELSE 1 END
              WHERE id = ?`,
            [res.version, local.content, local.local_rev, local.id],
          )
          report.pushed++
          break
        }
        await this.db.transaction((tx) => this.applyNote(tx, res.current, report))
        ;[local] = await this.db.query<LocalNote>(
          'SELECT * FROM notes WHERE id = ? AND dirty = 1',
          [row.id],
        )
      }
    }
  }

  /** Rows waiting to be pushed, for the sync status indicator. */
  async pendingCount(): Promise<number> {
    const [row] = await this.db.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM notes WHERE dirty = 1 AND shared_id IS NULL)
            + (SELECT count(*) FROM folders WHERE dirty = 1 AND shared_id IS NULL) AS n`,
    )
    return Number(row?.n ?? 0)
  }
}
