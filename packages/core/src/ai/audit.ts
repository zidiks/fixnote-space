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

export type AiActionKind =
  | 'edit'
  | 'tidy.move'
  | 'tidy.tag'
  | 'tidy.title'
  | 'tidy.merge'
  | 'mcp.create'
  | 'mcp.append'

export interface AiAction {
  id: string
  kind: AiActionKind
  /** Human-readable, in the UI language at the time. */
  summary: string
  /** Who made the change: "DeepSeek via FixNote", "Ollama llama3.1", "Claude Desktop (MCP)". */
  provider: string
  changes: NoteChange[]
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
  created_at: number
  undone_at: number | null
}

const sameState = (a: NoteState | null, b: NoteState | null) =>
  a === b || (a !== null && b !== null && a.content === b.content && a.folderId === b.folderId)

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

  /**
   * Runs `change`, recording how the listed notes (plus any it reports creating) looked before
   * and after. Returns what `change` returned and the logged action.
   */
  async track<T>(
    meta: { kind: AiActionKind; summary: string; provider: string },
    noteIds: readonly string[],
    change: () => Promise<T & { created?: string[] }>,
  ): Promise<{ result: T & { created?: string[] }; action: AiAction }> {
    const before = await this.states(noteIds)
    const result = await change()
    const ids = [...new Set([...noteIds, ...(result.created ?? [])])]
    const after = await this.states(ids)
    const changes: NoteChange[] = ids
      .map((noteId) => ({
        noteId,
        before: before.get(noteId) ?? null,
        after: after.get(noteId) ?? null,
      }))
      .filter((c) => !sameState(c.before, c.after))
    const action: AiAction = {
      id: (this.opts.newId ?? (() => crypto.randomUUID()))(),
      ...meta,
      changes,
      createdAt: this.now(),
      undoneAt: null,
    }
    if (changes.length) {
      await this.db.execute(
        `INSERT INTO ai_actions (id, kind, summary, provider, changes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          action.id,
          action.kind,
          action.summary,
          action.provider,
          JSON.stringify(changes),
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
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as AiActionKind,
      summary: r.summary,
      provider: r.provider,
      changes: JSON.parse(r.changes) as NoteChange[],
      createdAt: Number(r.created_at),
      undoneAt: r.undone_at === null ? null : Number(r.undone_at),
    }))
  }

  async undo(id: string): Promise<UndoResult> {
    const [row] = await this.db.query<Row & Record<string, string | number | null>>(
      'SELECT * FROM ai_actions WHERE id = ?',
      [id],
    )
    if (!row) return { ok: false, reason: 'missing' }
    if (row.undone_at !== null) return { ok: false, reason: 'already' }
    const changes = JSON.parse(row.changes) as NoteChange[]
    const now = await this.states(changes.map((c) => c.noteId))
    if (changes.some((c) => !sameState(now.get(c.noteId) ?? null, c.after))) {
      return { ok: false, reason: 'changed' }
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
    await this.db.execute('UPDATE ai_actions SET undone_at = ? WHERE id = ?', [this.now(), id])
    return { ok: true }
  }
}
