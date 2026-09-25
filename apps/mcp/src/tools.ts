import { AuditLog, type Note, NotesRepo, retrieve, type SqlDriver } from '@fixnote/core'

/** What the user allowed in FixNote → Settings → AI (kv `mcp.access`). */
export type McpAccess = 'off' | 'read' | 'write'

export const ACCESS_KEY = 'mcp.access'

export class AccessError extends Error {}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The notes tools behind the MCP server, over the same repository the app uses: writes are marked
 * for sync and logged in the AI activity log, where the user can undo them.
 */
export class NotesTools {
  readonly repo: NotesRepo
  readonly audit: AuditLog

  constructor(
    private readonly db: SqlDriver,
    private readonly client: () => string,
  ) {
    this.repo = new NotesRepo(db)
    this.audit = new AuditLog(db, this.repo)
  }

  async access(): Promise<McpAccess> {
    const [row] = await this.db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
      ACCESS_KEY,
    ])
    const v = row?.value
    // Not chosen yet: reading is fine, writing needs a yes in the app.
    return v === 'off' || v === 'write' ? v : 'read'
  }

  private async need(level: 'read' | 'write') {
    const access = await this.access()
    if (access === 'off') {
      throw new AccessError('Access to notes is turned off in FixNote → Settings → AI.')
    }
    if (level === 'write' && access !== 'write') {
      throw new AccessError(
        'FixNote allows reading only. To let this app add notes, open FixNote → Settings → AI → Connected apps and allow writing.',
      )
    }
  }

  private provider = () => `${this.client()} (MCP)`

  private async folderPath(folderId: string | null): Promise<string> {
    if (!folderId) return '(no folder)'
    const folders = await this.repo.listFolders()
    const byId = new Map(folders.map((f) => [f.id, f]))
    const parts: string[] = []
    for (
      let f = byId.get(folderId);
      f && parts.length < 16;
      f = f.parentId ? byId.get(f.parentId) : undefined
    ) {
      parts.unshift(f.name)
    }
    return parts.join(' / ') || '(no folder)'
  }

  private async describe(n: Note): Promise<string> {
    return [
      `# ${n.title || 'Untitled'}`,
      `id: ${n.id}`,
      `folder: ${await this.folderPath(n.folderId)}`,
      n.tags.length ? `tags: ${n.tags.map((t) => `#${t}`).join(' ')}` : '',
      `created: ${iso(n.createdAt)}, edited: ${iso(n.updatedAt)}`,
      '',
      n.content,
    ]
      .filter((l, i) => l !== '' || i === 5)
      .join('\n')
  }

  async search(query: string, limit = 8): Promise<string> {
    await this.need('read')
    const hits = await retrieve(this.db, null, query, { kind: 'all' }, { limit })
    if (!hits.length) return `No notes match "${query}".`
    return hits
      .map(
        (h, i) =>
          `${i + 1}. ${h.title || 'Untitled'} (id: ${h.noteId}, edited ${iso(h.updatedAt)})\n${h.text
            .split('\n')
            .map((l) => `   ${l}`)
            .join('\n')}`,
      )
      .join('\n\n')
  }

  async get(id: string): Promise<string> {
    await this.need('read')
    const note = await this.repo.getNote(id)
    if (!note) throw new Error(`No note with id ${id}.`)
    return this.describe(note)
  }

  async recent(limit = 10): Promise<string> {
    await this.need('read')
    const page = await this.repo.listNotes({ limit: Math.min(Math.max(limit, 1), 50) })
    if (!page.items.length) return 'No notes yet.'
    return page.items
      .map(
        (n) =>
          `- ${n.title || 'Untitled'} (id: ${n.id}, edited ${iso(n.updatedAt)})${n.excerpt ? `\n  ${n.excerpt}` : ''}`,
      )
      .join('\n')
  }

  async folders(): Promise<string> {
    await this.need('read')
    const folders = await this.repo.listFolders()
    const counts = await this.repo.counts()
    const lines = [`(no folder): ${counts.inbox} notes`]
    for (const f of folders) lines.push(`${await this.folderPath(f.id)}: ${f.noteCount} notes`)
    return lines.join('\n')
  }

  async create(content: string, folder?: string): Promise<string> {
    await this.need('write')
    if (!content.trim()) throw new Error('The note is empty.')
    let folderId: string | null = null
    if (folder?.trim()) {
      const match = (await this.repo.listFolders()).find(
        (f) => f.name.toLocaleLowerCase() === folder.trim().toLocaleLowerCase(),
      )
      if (!match)
        throw new Error(`No folder named "${folder}". Omit the folder to save without one.`)
      folderId = match.id
    }
    const { result } = await this.audit.track(
      {
        kind: 'mcp.create',
        summary: `Created a note: ${firstLine(content)}`,
        provider: this.provider(),
      },
      [],
      async () => {
        const note = await this.repo.createNote({ content, folderId })
        return { note, created: [note.id] }
      },
    )
    return `Saved "${result.note.title || 'Untitled'}" (id: ${result.note.id}).`
  }

  async append(id: string, content: string): Promise<string> {
    await this.need('write')
    const note = await this.repo.getNote(id)
    if (!note) throw new Error(`No note with id ${id}.`)
    if (!content.trim()) throw new Error('Nothing to append.')
    await this.audit.track(
      {
        kind: 'mcp.append',
        summary: `Added to "${note.title || 'Untitled'}"`,
        provider: this.provider(),
      },
      [id],
      async () => {
        await this.repo.updateContent(id, `${note.content.trimEnd()}\n\n${content.trim()}`, {
          base: note.content,
        })
        return {}
      },
    )
    return `Added to "${note.title || 'Untitled'}".`
  }

  /** The daily note of `date` (YYYY-MM-DD, default today); with `append`, adds to it first. */
  async daily(date?: string, append?: string): Promise<string> {
    const day = date ?? localDate()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Use a date like 2026-09-25.')
    if (append?.trim()) {
      await this.need('write')
      const existing = await this.dailyNote(day)
      const { result } = await this.audit.track(
        {
          kind: 'mcp.append',
          summary: `Added to the daily note ${day}`,
          provider: this.provider(),
        },
        existing ? [existing.id] : [],
        async () => {
          const note = existing ?? (await this.repo.getOrCreateDaily(day, () => `# ${day}`))
          await this.repo.updateContent(note.id, `${note.content.trimEnd()}\n\n${append.trim()}`, {
            base: note.content,
          })
          return { id: note.id, created: existing ? [] : [note.id] }
        },
      )
      return this.describe((await this.repo.getNote(result.id)) as Note)
    }
    await this.need('read')
    const note = await this.dailyNote(day)
    return note ? this.describe(note) : `There is no daily note for ${day}.`
  }

  private async dailyNote(day: string): Promise<Note | null> {
    const [row] = await this.db.query<{ id: string }>(
      `SELECT id FROM notes WHERE type = 'daily' AND daily_date = ? AND deleted_at IS NULL`,
      [day],
    )
    return row ? this.repo.getNote(row.id) : null
  }
}

const firstLine = (s: string) => {
  const line =
    s
      .trim()
      .split('\n')[0]
      ?.replace(/^#+\s*/, '') ?? ''
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}
