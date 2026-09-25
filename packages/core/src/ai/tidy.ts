import { deriveExcerpt, extractTags, toPlainText } from '../notes/markdown'
import type { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import type { AuditLog } from './audit'

/** One proposed change, waiting for Accept or Reject. */
export type TidySuggestion = { id: string; noteId: string; noteTitle: string } & (
  | { kind: 'move'; folderId: string | null; folderName: string; newFolder: boolean }
  | { kind: 'tag'; tags: string[] }
  | { kind: 'title'; title: string }
  | { kind: 'merge'; otherId: string; otherTitle: string }
)

/** A suggestion before it is stored (no id yet). */
export type NewTidySuggestion = TidySuggestion extends infer T
  ? T extends TidySuggestion
    ? Omit<T, 'id'>
    : never
  : never

/** What the model sees, with short numeric refs instead of ids. */
export interface TidyCandidates {
  notes: {
    ref: number
    id: string
    title: string
    excerpt: string
    tags: string[]
    needsTitle: boolean
    noFolder: boolean
  }[]
  folders: { ref: number; id: string; name: string }[]
  tags: string[]
}

/** The first line reads like a paragraph rather than a title. */
export function needsTitle(markdown: string): boolean {
  const first = markdown.trimStart().split('\n')[0] ?? ''
  if (/^#{1,6}\s/.test(first)) return false
  const plain = toPlainText(first).trim()
  return plain.length > 60 || /[.!?…]\s+\S/.test(plain)
}

interface NoteRow {
  id: string
  title: string
  content: string
  folder_id: string | null
  updated_at: number
}

const words = (text: string) =>
  new Set(
    toPlainText(text)
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  )

/** Jaccard similarity of the word sets. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let common = 0
  for (const w of a) if (b.has(w)) common++
  return common / (a.size + b.size - common)
}

/**
 * Likely duplicates: same title and mostly the same words, or nearly identical text. Returns
 * [newer, older] pairs; each note appears in at most one pair.
 */
export function findDuplicates(
  notes: { id: string; title: string; content: string; updatedAt: number }[],
): [string, string][] {
  // Newest first; on a tie the longer one, which is the one to keep.
  const sorted = [...notes].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.content.length - a.content.length,
  )
  const sets = new Map(sorted.map((n) => [n.id, words(n.content)]))
  const used = new Set<string>()
  const pairs: [string, string][] = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    if (!a || used.has(a.id) || !a.content.trim()) continue
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]
      if (!b || used.has(b.id) || !b.content.trim()) continue
      const sim = similarity(sets.get(a.id) ?? new Set(), sets.get(b.id) ?? new Set())
      const sameTitle = a.title.trim().toLocaleLowerCase() === b.title.trim().toLocaleLowerCase()
      if (sim >= 0.9 || (sameTitle && sim >= 0.6)) {
        pairs.push([a.id, b.id])
        used.add(a.id)
        used.add(b.id)
        break
      }
    }
  }
  return pairs
}

/** Lines of `other` that `keep` lacks, appended to `keep`: nothing from either is lost. */
export function mergeContents(keep: string, other: string): string {
  const have = new Set(
    keep
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  )
  const extra = other.split('\n').filter((l) => l.trim() && !have.has(l.trim()))
  return extra.length ? `${keep.trimEnd()}\n\n${extra.join('\n')}` : keep
}

const TAG_LINE = /^(\s*#[\p{L}\p{N}_][\p{L}\p{N}_\-/]*)+\s*$/u

export function addTags(content: string, tags: readonly string[]): string {
  const have = new Set(extractTags(content).map((t) => t.toLocaleLowerCase()))
  const add = tags.filter((t) => !have.has(t.toLocaleLowerCase()))
  if (!add.length) return content
  const line = add.map((t) => `#${t}`).join(' ')
  const lines = content.trimEnd().split('\n')
  const last = lines.at(-1) ?? ''
  if (TAG_LINE.test(last)) {
    lines[lines.length - 1] = `${last.trimEnd()} ${line}`
    return lines.join('\n')
  }
  return `${content.trimEnd()}\n\n${line}`
}

export interface TidyLabels {
  move: (folder: string, note: string) => string
  tag: (tags: string, note: string) => string
  title: (title: string) => string
  merge: (note: string, other: string) => string
}

/**
 * Tidy: proposals to move notes into folders, add tags, give long-lined notes a title and merge
 * duplicates. Nothing changes until a suggestion is accepted; every accepted one is recorded in
 * the audit log and can be undone there.
 */
export class Tidy {
  constructor(
    private readonly db: SqlDriver,
    private readonly repo: NotesRepo,
    private readonly audit: AuditLog,
    private readonly opts: { now?: () => number; newId?: () => string } = {},
  ) {}

  private id = () => (this.opts.newId ?? (() => crypto.randomUUID()))()
  private now = () => (this.opts.now ?? Date.now)()

  /** Notes worth a look: no folder, untagged or with a prose first line; or just `noteIds`. */
  async candidates(opts: { noteIds?: string[]; limit?: number } = {}): Promise<TidyCandidates> {
    const limit = opts.limit ?? 40
    const rows = opts.noteIds?.length
      ? await this.db.query<NoteRow & Record<string, string | number | null>>(
          `SELECT id, title, content, folder_id, updated_at FROM notes
            WHERE deleted_at IS NULL AND type = 'text'
              AND id IN (${opts.noteIds.map(() => '?').join(',')})`,
          opts.noteIds,
        )
      : await this.db.query<NoteRow & Record<string, string | number | null>>(
          `SELECT id, title, content, folder_id, updated_at FROM notes
            WHERE deleted_at IS NULL AND type = 'text' AND length(trim(content)) > 0
            ORDER BY (folder_id IS NULL) DESC, updated_at DESC LIMIT ?`,
          [limit * 3],
        )
    const decided = new Set(
      (
        await this.db.query<{ note_id: string }>(
          `SELECT note_id FROM tidy_suggestions WHERE status != 'pending'`,
        )
      ).map((r) => r.note_id),
    )
    const notes = rows
      .filter((r) => opts.noteIds || !decided.has(r.id))
      .map((r) => ({
        id: r.id,
        title: r.title,
        excerpt: deriveExcerpt(r.content, 280),
        tags: extractTags(r.content),
        needsTitle: needsTitle(r.content),
        noFolder: r.folder_id === null,
      }))
      .filter((n) => opts.noteIds || n.noFolder || !n.tags.length || n.needsTitle)
      .slice(0, limit)
      .map((n, i) => ({ ...n, ref: i + 1 }))
    const folders = (await this.repo.listFolders()).map((f, i) => ({
      ref: i + 1,
      id: f.id,
      name: f.name,
    }))
    const tags = (await this.repo.listTags()).map((t) => t.name).slice(0, 80)
    return { notes, folders, tags }
  }

  /** Duplicate pairs among all notes, as merge suggestions (no model needed). */
  async duplicateSuggestions(): Promise<NewTidySuggestion[]> {
    const rows = await this.db.query<NoteRow & Record<string, string | number | null>>(
      `SELECT id, title, content, folder_id, updated_at FROM notes
        WHERE deleted_at IS NULL AND type = 'text' ORDER BY updated_at DESC LIMIT 500`,
    )
    const byId = new Map(rows.map((r) => [r.id, r]))
    return findDuplicates(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        updatedAt: Number(r.updated_at),
      })),
    ).map(([keep, other]) => ({
      kind: 'merge' as const,
      noteId: keep,
      noteTitle: byId.get(keep)?.title ?? '',
      otherId: other,
      otherTitle: byId.get(other)?.title ?? '',
    }))
  }

  /** Stores new suggestions, replacing pending ones of the same kind for the same note. */
  async save(suggestions: NewTidySuggestion[]): Promise<TidySuggestion[]> {
    const saved: TidySuggestion[] = []
    await this.db.transaction(async (tx) => {
      for (const s of suggestions) {
        const { kind, noteId, noteTitle: _t, ...payload } = s
        await tx.execute(
          `DELETE FROM tidy_suggestions WHERE note_id = ? AND kind = ? AND status = 'pending'`,
          [noteId, kind],
        )
        const id = this.id()
        await tx.execute(
          `INSERT INTO tidy_suggestions (id, kind, note_id, payload, created_at) VALUES (?, ?, ?, ?, ?)`,
          [id, kind, noteId, JSON.stringify(payload), this.now()],
        )
        saved.push({ ...s, id })
      }
    })
    return saved
  }

  /** Pending suggestions for notes that still exist, with current titles. */
  async pending(): Promise<TidySuggestion[]> {
    const rows = await this.db.query<{
      id: string
      kind: TidySuggestion['kind']
      note_id: string
      payload: string
      title: string | null
    }>(
      `SELECT s.id, s.kind, s.note_id, s.payload, n.title FROM tidy_suggestions s
         LEFT JOIN notes n ON n.id = s.note_id AND n.deleted_at IS NULL
        WHERE s.status = 'pending' ORDER BY s.created_at, s.rowid`,
    )
    return rows
      .filter((r) => r.title !== null)
      .map(
        (r) =>
          ({
            id: r.id,
            kind: r.kind,
            noteId: r.note_id,
            noteTitle: r.title ?? '',
            ...JSON.parse(r.payload),
          }) as TidySuggestion,
      )
  }

  async pendingCount(): Promise<number> {
    return (await this.pending()).length
  }

  async reject(id: string): Promise<void> {
    await this.db.execute(`UPDATE tidy_suggestions SET status = 'rejected' WHERE id = ?`, [id])
  }

  /** Applies one suggestion; returns the audit action id (for Undo), or null if nothing changed. */
  async accept(s: TidySuggestion, provider: string, labels: TidyLabels): Promise<string | null> {
    const note = await this.repo.getNote(s.noteId)
    await this.db.execute(`UPDATE tidy_suggestions SET status = 'accepted' WHERE id = ?`, [s.id])
    if (!note) return null
    const title = note.title
    if (s.kind === 'move') {
      const { action } = await this.audit.track(
        { kind: 'tidy.move', summary: labels.move(s.folderName, title), provider },
        [s.noteId],
        async () => {
          let folderId = s.folderId
          if (s.newFolder || !folderId) {
            const existing = (await this.repo.listFolders()).find(
              (f) => f.name.toLocaleLowerCase() === s.folderName.toLocaleLowerCase(),
            )
            folderId = existing?.id ?? (await this.repo.createFolder(s.folderName)).id
          }
          await this.repo.moveNote(s.noteId, folderId)
          return {}
        },
      )
      return action.changes.length ? action.id : null
    }
    if (s.kind === 'tag') {
      const { action } = await this.audit.track(
        {
          kind: 'tidy.tag',
          summary: labels.tag(s.tags.map((t) => `#${t}`).join(' '), title),
          provider,
        },
        [s.noteId],
        async () => {
          await this.repo.updateContent(s.noteId, addTags(note.content, s.tags))
          return {}
        },
      )
      return action.changes.length ? action.id : null
    }
    if (s.kind === 'title') {
      const { action } = await this.audit.track(
        { kind: 'tidy.title', summary: labels.title(s.title), provider },
        [s.noteId],
        async () => {
          await this.repo.updateContent(s.noteId, `# ${s.title}\n\n${note.content.trimStart()}`)
          return {}
        },
      )
      return action.changes.length ? action.id : null
    }
    const other = await this.repo.getNote(s.otherId)
    if (!other) return null
    const { action } = await this.audit.track(
      { kind: 'tidy.merge', summary: labels.merge(title, other.title), provider },
      [s.noteId, s.otherId],
      async () => {
        await this.repo.updateContent(s.noteId, mergeContents(note.content, other.content))
        await this.repo.deleteNote(s.otherId)
        return {}
      },
    )
    return action.id
  }
}

/** Turns model proposals (by ref) into suggestions (by id). */
export function suggestionsFromProposals(
  c: TidyCandidates,
  proposals: (
    | { kind: 'move'; note: number; folder: number }
    | { kind: 'move'; note: number; newFolder: string }
    | { kind: 'tag'; note: number; tags: string[] }
    | { kind: 'title'; note: number; title: string }
  )[],
): NewTidySuggestion[] {
  const notes = new Map(c.notes.map((n) => [n.ref, n]))
  const folders = new Map(c.folders.map((f) => [f.ref, f]))
  const out: NewTidySuggestion[] = []
  for (const p of proposals) {
    const n = notes.get(p.note)
    if (!n) continue
    const base = { noteId: n.id, noteTitle: n.title }
    if (p.kind === 'move') {
      if ('folder' in p) {
        const f = folders.get(p.folder)
        if (f)
          out.push({
            ...base,
            kind: 'move',
            folderId: f.id,
            folderName: f.name,
            newFolder: false,
          })
      } else {
        const existing = c.folders.find(
          (f) => f.name.toLocaleLowerCase() === p.newFolder.toLocaleLowerCase(),
        )
        out.push({
          ...base,
          kind: 'move',
          folderId: existing?.id ?? null,
          folderName: existing?.name ?? p.newFolder,
          newFolder: !existing,
        })
      }
    } else if (p.kind === 'tag') out.push({ ...base, kind: 'tag', tags: p.tags })
    else out.push({ ...base, kind: 'title', title: p.title })
  }
  return out
}
