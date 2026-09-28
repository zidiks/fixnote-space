import type { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'

/** A note as far as undo is concerned; null = the note did not exist (or was deleted). */
export interface NoteState {
  content: string
  folderId: string | null
}

export interface NoteChange {
  noteId: string
  before: NoteState | null
  after: NoteState | null
}

/** A folder as far as undo is concerned; null = the folder did not exist (or was deleted). */
export interface FolderState {
  name: string
  parentId: string | null
}

export interface FolderChange {
  folderId: string
  before: FolderState | null
  after: FolderState | null
}

export type AiActionKind =
  | 'edit'
  | 'tidy.move'
  /** Tags are gone; kept so older entries still read. */
  | 'tidy.tag'
  | 'tidy.title'
  | 'tidy.merge'
  | 'mcp.create'
  | 'mcp.append'
  | 'mcp.update'
  | 'mcp.move'
  | 'mcp.delete'
  | 'mcp.folder'

export interface AiAction {
  id: string
  kind: AiActionKind
  /** Human-readable, in the UI language at the time. */
  summary: string
  /** Who made the change: "DeepSeek via FixNote", "Ollama llama3.1", "Claude Desktop (MCP)". */
  provider: string
  changes: NoteChange[]
  folderChanges: FolderChange[]
  createdAt: number
  undoneAt: number | null
}

export type UndoResult = { ok: true } | { ok: false; reason: 'changed' | 'already' | 'missing' }

interface Row {
  id: string
  kind: string
  summary: string
  provider: string
  changes: string
  folder_changes: string | null
  created_at: number
  undone_at: number | null
}

const sameState = (a: NoteState | null, b: NoteState | null) =>
  a === b || (a !== null && b !== null && a.content === b.content && a.folderId === b.folderId)
const sameFolder = (a: FolderState | null, b: FolderState | null) =>
  a === b || (a !== null && b !== null && a.name === b.name && a.parentId === b.parentId)

const toAction = (r: Row): AiAction => ({
  id: r.id,
  kind: r.kind as AiActionKind,
  summary: r.summary,
  provider: r.provider,
  changes: JSON.parse(r.changes) as NoteChange[],
  folderChanges: r.folder_changes ? (JSON.parse(r.folder_changes) as FolderChange[]) : [],
  createdAt: Number(r.created_at),
  undoneAt: r.undone_at === null ? null : Number(r.undone_at),
})

/**
 * The AI audit log: every change made by the AI or an MCP client, with before/after states of the
 * notes it touched. Undo restores "before" only if the notes still look like "after", so it never
 * throws away edits made since.
 */
export class AuditLog {
  constructor(
    private readonly db: SqlDriver,
    private readonly repo: NotesRepo,
    private readonly opts: { now?: () => number; newId?: () => string } = {},
  ) {}

  private now = () => (this.opts.now ?? Date.now)()

  async states(ids: readonly string[]): Promise<Map<string, NoteState | null>> {
    const out = new Map<string, NoteState | null>(ids.map((id) => [id, null]))
    if (!ids.length) return out
    const rows = await this.db.query<{ id: string; content: string; folder_id: string | null }>(
      `SELECT id, content, folder_id FROM notes
        WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
      [...ids],
    )
    for (const r of rows) out.set(r.id, { content: r.content, folderId: r.folder_id })
    return out
  }

  async folderStates(ids: readonly string[]): Promise<Map<string, FolderState | null>> {
    const out = new Map<string, FolderState | null>(ids.map((id) => [id, null]))
    if (!ids.length) return out
    const rows = await this.db.query<{ id: string; name: string; parent_id: string | null }>(
      `SELECT id, name, parent_id FROM folders
        WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
      [...ids],
    )
    for (const r of rows) out.set(r.id, { name: r.name, parentId: r.parent_id })
    return out
  }

  /**
   * Runs `change`, recording how the listed notes and folders (plus any it reports creating)
   * looked before and after. Returns what `change` returned and the logged action.
   */
  async track<T>(
    meta: { kind: AiActionKind; summary: string; provider: string },
    noteIds: readonly string[],
    change: () => Promise<T & { created?: string[]; createdFolders?: string[] }>,
    folderIds: readonly string[] = [],
  ): Promise<{ result: T & { created?: string[]; createdFolders?: string[] }; action: AiAction }> {
    const before = await this.states(noteIds)
    const foldersBefore = await this.folderStates(folderIds)
    const result = await change()
    const ids = [...new Set([...noteIds, ...(result.created ?? [])])]
    const fids = [...new Set([...folderIds, ...(result.createdFolders ?? [])])]
    const after = await this.states(ids)
    const foldersAfter = await this.folderStates(fids)
    const changes: NoteChange[] = ids
      .map((noteId) => ({
        noteId,
        before: before.get(noteId) ?? null,
        after: after.get(noteId) ?? null,
      }))
      .filter((c) => !sameState(c.before, c.after))
    const folderChanges: FolderChange[] = fids
      .map((folderId) => ({
        folderId,
        before: foldersBefore.get(folderId) ?? null,
        after: foldersAfter.get(folderId) ?? null,
      }))
      .filter((c) => !sameFolder(c.before, c.after))
    const action: AiAction = {
      id: (this.opts.newId ?? (() => crypto.randomUUID()))(),
      ...meta,
      changes,
      folderChanges,
      createdAt: this.now(),
      undoneAt: null,
    }
    if (changes.length || folderChanges.length) {
      await this.db.execute(
        `INSERT INTO ai_actions (id, kind, summary, provider, changes, folder_changes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          action.id,
          action.kind,
          action.summary,
          action.provider,
          JSON.stringify(changes),
          folderChanges.length ? JSON.stringify(folderChanges) : null,
          action.createdAt,
        ],
      )
    }
    return { result, action }
  }

  /** Records a change that already happened (e.g. an accepted edit saved by the editor). */
  async record(
    meta: { kind: AiActionKind; summary: string; provider: string },
    changes: NoteChange[],
  ) {
    const real = changes.filter((c) => !sameState(c.before, c.after))
    if (!real.length) return null
    const id = (this.opts.newId ?? (() => crypto.randomUUID()))()
    await this.db.execute(
      `INSERT INTO ai_actions (id, kind, summary, provider, changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, meta.kind, meta.summary, meta.provider, JSON.stringify(real), this.now()],
    )
    return id
  }

  async list(limit = 100): Promise<AiAction[]> {
    const rows = await this.db.query<Row & Record<string, string | number | null>>(
      'SELECT * FROM ai_actions ORDER BY created_at DESC LIMIT ?',
      [limit],
    )
    return rows.map(toAction)
  }

  async undo(id: string): Promise<UndoResult> {
    const [row] = await this.db.query<Row & Record<string, string | number | null>>(
      'SELECT * FROM ai_actions WHERE id = ?',
      [id],
    )
    if (!row) return { ok: false, reason: 'missing' }
    if (row.undone_at !== null) return { ok: false, reason: 'already' }
    const { changes, folderChanges } = toAction(row)
    const now = await this.states(changes.map((c) => c.noteId))
    const foldersNow = await this.folderStates(folderChanges.map((c) => c.folderId))
    if (
      changes.some((c) => !sameState(now.get(c.noteId) ?? null, c.after)) ||
      folderChanges.some((c) => !sameFolder(foldersNow.get(c.folderId) ?? null, c.after))
    ) {
      return { ok: false, reason: 'changed' }
    }
    // Folders first (a note may move back into a restored folder), created ones removed last.
    for (const c of folderChanges) {
      if (!c.before) continue
      if (!c.after) await this.repo.restoreFolder(c.folderId)
      else if (c.after.name !== c.before.name)
        await this.repo.renameFolder(c.folderId, c.before.name)
    }
    for (const c of changes) {
      if (c.before === null) {
        await this.repo.deleteNote(c.noteId)
        continue
      }
      if (c.after === null) await this.repo.restoreNote(c.noteId)
      const current = (await this.states([c.noteId])).get(c.noteId)
      if (current?.content !== c.before.content)
        await this.repo.updateContent(c.noteId, c.before.content)
      if (current?.folderId !== c.before.folderId)
        await this.repo.moveNote(c.noteId, c.before.folderId)
    }
    for (const c of folderChanges) if (!c.before) await this.repo.deleteFolder(c.folderId)
    await this.db.execute('UPDATE ai_actions SET undone_at = ? WHERE id = ?', [this.now(), id])
    return { ok: true }
  }
}
