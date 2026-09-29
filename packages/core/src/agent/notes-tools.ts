import type { AiAction, AiActionKind, AuditLog } from '../ai/audit'
import { retrieve } from '../ai/retrieve'
import { type AttachmentInfo, type Attachments, attachmentIds, attachmentUrl } from '../attachments'
import { ImageTexts } from '../attachments/image-text'
import { type McpScope, scopeFolderIds } from '../mcp'
import type { NotesRepo } from '../notes/repo'
import type { Folder, Note } from '../notes/types'
import type { SqlDriver } from '../platform'

/** What a tool needs: reading, adding and changing, or deleting. */
export type ToolLevel = 'read' | 'write' | 'full'

/** A tool was refused by the user's settings; the message says where to change them. */
export class AccessError extends Error {}

/**
 * Who may do what: the MCP server reads the user's settings on every call; the assistant chat
 * works for the user and sees everything.
 */
export interface ToolGate {
  /** Resolves when `level` is allowed; throws an AccessError with the reason otherwise. */
  need(level: ToolLevel): Promise<void>
  /** Which folders and notes the tools may see. */
  scope(): Promise<McpScope>
  /** Why daily notes are out of reach when the scope is not everything. */
  readonly dailyHidden: string
}

/** Everything, always: the assistant chat, which the user drives. */
export const OPEN_GATE: ToolGate = {
  need: async () => {},
  scope: async () => ({ kind: 'all' }),
  dailyHidden: '',
}

export interface NoteToolsOptions {
  gate: ToolGate
  /** Who changes the notes, for the AI activity log: "Claude (MCP)", "DeepSeek via FixNote". */
  provider: () => string
  /** The activity log kinds: `mcp.*` or `chat.*`. */
  kinds: 'mcp' | 'chat'
  attachments?: Attachments | null
  /** Each change as it is logged (the assistant lists them under its answer, with Undo all). */
  onChange?: (action: AiAction) => void
}

/** "340 KB", "1.2 MB": the size a file link carries as its title, as the app writes it. */
export function fileSize(bytes: number): string {
  const [value, unit] =
    bytes >= 1024 * 1024
      ? [bytes / 1024 / 1024, 'MB']
      : bytes >= 1024
        ? [bytes / 1024, 'KB']
        : [bytes, 'B']
  return `${value.toFixed(value < 10 && unit !== 'B' ? 1 : 0)} ${unit}`
}

/** How a note names an attachment: the file link's text, or the image's alt text. */
function attachmentName(markdown: string, id: string): { name: string; image: boolean } | null {
  // `id` is checked to be [\w-] before it gets here.
  const re = new RegExp(String.raw`(!?)\[((?:\\.|[^\]\\])*)\]\(attachment:${id}(?:\s+"[^"]*")?\)`)
  const m = markdown.match(re)
  if (!m) return null
  return { name: (m[2] ?? '').replace(/\\(.)/g, '$1'), image: m[1] === '!' }
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const firstLine = (s: string) => {
  const line =
    s
      .trim()
      .split('\n')[0]
      ?.replace(/^#+\s*/, '') ?? ''
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}

const title = (n: { title: string }) => n.title || 'Untitled'

/** What the tools may see now: all notes, or some folders and notes. */
interface Reach {
  scope: McpScope
  folders: Folder[]
  /** null = every folder and notes without one. */
  folderIds: Set<string> | null
  noteIds: Set<string>
}

/** An attachment with its bytes, for a client to look at. */
export interface AttachmentData {
  note: Note
  name: string
  image: boolean
  info: AttachmentInfo
  bytes: Uint8Array
}

/**
 * The notes tools shared by the MCP server and the assistant chat, over the same repository the
 * app uses: writes are marked for sync and logged in the AI activity log, where the user can undo
 * them. Every call asks the gate again, so a change in the settings applies right away. Results
 * are plain text for a model to read.
 */
export class NoteTools {
  constructor(
    protected readonly db: SqlDriver,
    readonly repo: NotesRepo,
    readonly audit: AuditLog,
    protected readonly opts: NoteToolsOptions,
  ) {}

  get attachments(): Attachments | null {
    return this.opts.attachments ?? null
  }

  protected need(level: ToolLevel) {
    return this.opts.gate.need(level)
  }

  protected kind(action: 'create' | 'append' | 'update' | 'move' | 'delete' | 'folder') {
    return `${this.opts.kinds}.${action}` as AiActionKind
  }

  protected meta(action: Parameters<NoteTools['kind']>[0], summary: string) {
    return { kind: this.kind(action), summary, provider: this.opts.provider() }
  }

  /** AuditLog.track, telling `onChange` about what changed. */
  protected async track<T>(
    meta: { kind: AiActionKind; summary: string; provider: string },
    noteIds: readonly string[],
    change: () => Promise<T & { created?: string[]; createdFolders?: string[] }>,
    folderIds: readonly string[] = [],
  ) {
    const out = await this.audit.track(meta, noteIds, change, folderIds)
    if (out.action.changes.length || out.action.folderChanges.length)
      this.opts.onChange?.(out.action)
    return out
  }

  protected async reach(): Promise<Reach> {
    const scope = await this.opts.gate.scope()
    const folders = await this.repo.listFolders()
    return {
      scope,
      folders,
      folderIds: scopeFolderIds(scope, folders),
      noteIds: new Set(scope.kind === 'some' ? scope.notes : []),
    }
  }

  protected sees(reach: Reach, note: { id: string; folderId: string | null }) {
    if (!reach.folderIds) return true
    return (
      reach.noteIds.has(note.id) || (note.folderId !== null && reach.folderIds.has(note.folderId))
    )
  }

  private seesFolder(reach: Reach, id: string) {
    return !reach.folderIds || reach.folderIds.has(id)
  }

  /** A note the tools may see, or an error that does not reveal whether it exists. */
  protected async visibleNote(reach: Reach, id: string): Promise<Note> {
    const note = await this.repo.getNote(id)
    if (!note || !this.sees(reach, note)) throw new Error(`No note with id ${id}.`)
    return note
  }

  private folderPath(reach: Reach, folderId: string | null): string {
    if (!folderId) return '(no folder)'
    const byId = new Map(reach.folders.map((f) => [f.id, f]))
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

  /**
   * A folder the tools may use, by id, name or path ("Work / Projects"), case-insensitive. A name
   * shared by several folders must be given as a path.
   */
  private folderRef(reach: Reach, ref: string): Folder {
    const want = ref.trim().toLocaleLowerCase()
    const usable = reach.folders.filter((f) => this.seesFolder(reach, f.id))
    const byId = usable.find((f) => f.id === ref.trim())
    if (byId) return byId
    const path = (f: Folder) => this.folderPath(reach, f.id).toLocaleLowerCase()
    const byPath = usable.filter((f) => path(f) === want.replace(/\s*\/\s*/g, ' / '))
    if (byPath.length === 1) return byPath[0] as Folder
    const byName = usable.filter((f) => f.name.toLocaleLowerCase() === want)
    if (byName.length === 1) return byName[0] as Folder
    if (byName.length > 1) {
      throw new Error(
        `Several folders are named "${ref}": ${byName.map((f) => this.folderPath(reach, f.id)).join('; ')}. Give the path or the id.`,
      )
    }
    throw new Error(`No folder "${ref}". list_folders shows the folders you can use.`)
  }

  private async describe(reach: Reach, n: Note): Promise<string> {
    return [
      `# ${title(n)}`,
      `id: ${n.id}`,
      `folder: ${this.folderPath(reach, n.folderId)}`,
      n.pinnedAt ? 'pinned: yes' : '',
      `created: ${iso(n.createdAt)}, edited: ${iso(n.updatedAt)}`,
      await this.attachmentList(n),
      `\n${n.content}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  /** The note's images and files, for get_attachment. */
  private async attachmentList(n: Note): Promise<string> {
    const ids = attachmentIds(n.content)
    if (!ids.length) return ''
    const lines = ['attachments (read with get_attachment):']
    for (const id of ids) {
      const info = await this.attachments?.info(id)
      const named = attachmentName(n.content, id)
      const kind = named?.image ? 'image' : named?.name || 'file'
      lines.push(
        info
          ? `- ${kind}, ${info.mime}, ${fileSize(info.size)} (id: ${id})`
          : `- ${kind} (id: ${id}), not on this computer yet`,
      )
      // Text read from the image on this device (OCR), when there is some.
      const read = named?.image ? await new ImageTexts(this.db).get(id) : null
      if (read) lines.push(`  text in it: ${read.replace(/\s*\n\s*/g, ' / ').slice(0, 600)}`)
    }
    return lines.join('\n')
  }

  /** An attachment of a note the tools may see; the error does not reveal whether it exists. */
  private async visibleAttachment(
    reach: Reach,
    id: string,
  ): Promise<{ note: Note; name: string; image: boolean }> {
    if (!/^[\w-]{1,64}$/.test(id)) throw new Error(`No attachment with id ${id}.`)
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM notes WHERE deleted_at IS NULL AND instr(content, ?) > 0`,
      [attachmentUrl(id)],
    )
    for (const row of rows) {
      const note = await this.repo.getNote(row.id)
      if (!note || !this.sees(reach, note)) continue
      const named = attachmentName(note.content, id)
      if (named) return { note, ...named }
    }
    throw new Error(`No attachment with id ${id}.`)
  }

  /** The bytes of an attachment in a visible note. */
  async attachmentData(id: string): Promise<AttachmentData> {
    await this.need('read')
    const { note, name, image } = await this.visibleAttachment(await this.reach(), id)
    const info = await this.attachments?.info(id)
    const blob = info ? await this.attachments?.load(id) : null
    if (!info || !blob) {
      throw new Error(
        `This file is not on this computer yet. Open "${title(note)}" in FixNote once and it downloads.`,
      )
    }
    return { note, name, image, info, bytes: new Uint8Array(await blob.arrayBuffer()) }
  }

  /** Adds a file to the end of a note: an image shows in it, any other file becomes a link. */
  async attachBytes(id: string, bytes: Uint8Array, name: string, mime: string): Promise<string> {
    await this.need('write')
    const attachments = this.attachments
    if (!attachments) throw new Error('Files are not available: FixNote was not found here.')
    const note = await this.visibleNote(await this.reach(), id)
    const image = mime.startsWith('image/') && mime !== 'image/svg+xml'
    await this.track(
      this.meta('append', `Attached ${name} to "${title(note)}"`),
      [id],
      async () => {
        const info = await attachments.add(new Blob([bytes as BlobPart], { type: mime }), mime)
        const safe = name.replace(/[[\]\\]/g, '\\$&')
        const md = image
          ? `![${safe}](${attachmentUrl(info.id)})`
          : `[${safe}](${attachmentUrl(info.id)} "${fileSize(bytes.length)}")`
        await this.repo.updateContent(id, `${note.content.trimEnd()}\n\n${md}`, {
          base: note.content,
        })
        return {}
      },
    )
    return `Attached ${name} (${fileSize(bytes.length)}) to "${title(note)}".`
  }

  /** Full-text search, in one folder (and its subfolders) when `folder` is given. */
  async search(query: string, limit = 8, folder?: string): Promise<string> {
    await this.need('read')
    const reach = await this.reach()
    const within = folder?.trim() ? this.folderRef(reach, folder) : null
    // Ask for more when only part of the notes is visible, then keep the visible ones.
    let hits = await retrieve(
      this.db,
      null,
      query,
      within ? { kind: 'folder', id: within.id, name: within.name } : { kind: 'all' },
      { limit: reach.folderIds ? 60 : limit },
    )
    const ids = [...new Set(hits.map((h) => h.noteId))]
    const rows = ids.length
      ? await this.db.query<{ id: string; folder_id: string | null }>(
          `SELECT id, folder_id FROM notes WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids,
        )
      : []
    const folderOf = new Map(rows.map((r) => [r.id, r.folder_id]))
    if (reach.folderIds) {
      hits = hits.filter((h) =>
        this.sees(reach, { id: h.noteId, folderId: folderOf.get(h.noteId) ?? null }),
      )
    }
    hits = hits.slice(0, limit)
    if (!hits.length) {
      return within
        ? `No notes in "${this.folderPath(reach, within.id)}" match "${query}".`
        : `No notes match "${query}".`
    }
    return hits
      .map(
        (h, i) =>
          `${i + 1}. ${title(h)} (id: ${h.noteId}, in ${this.folderPath(reach, folderOf.get(h.noteId) ?? null)}, edited ${iso(h.updatedAt)})\n${h.text
            .split('\n')
            .map((l) => `   ${l}`)
            .join('\n')}`,
      )
      .join('\n\n')
  }

  async get(id: string): Promise<string> {
    await this.need('read')
    const reach = await this.reach()
    return this.describe(reach, await this.visibleNote(reach, id))
  }

  /** Notes, last edited first: all of them, or those of one folder (and its subfolders). */
  async recent(limit = 10, folder?: string): Promise<string> {
    await this.need('read')
    const reach = await this.reach()
    const within = folder?.trim() ? this.folderRef(reach, folder) : null
    const want = Math.min(Math.max(limit, 1), 50)
    const page = await this.repo.listNotes({
      limit: reach.folderIds ? 200 : want,
      ...(within ? { filter: { folderId: within.id } } : {}),
    })
    const items = page.items.filter((n) => this.sees(reach, n)).slice(0, want)
    if (!items.length) {
      return within ? `No notes in "${this.folderPath(reach, within.id)}".` : 'No notes yet.'
    }
    return items
      .map(
        (n) =>
          `- ${title(n)} (id: ${n.id}, in ${this.folderPath(reach, n.folderId)}, edited ${iso(n.updatedAt)})${n.excerpt ? `\n  ${n.excerpt}` : ''}`,
      )
      .join('\n')
  }

  async folders(): Promise<string> {
    await this.need('read')
    const reach = await this.reach()
    const lines: string[] = []
    if (!reach.folderIds) lines.push(`(no folder): ${(await this.repo.counts()).inbox} notes`)
    for (const f of reach.folders) {
      if (!this.seesFolder(reach, f.id)) continue
      lines.push(`${this.folderPath(reach, f.id)} (id: ${f.id}): ${f.noteCount} notes`)
    }
    if (reach.noteIds.size) lines.push(`+ ${reach.noteIds.size} single notes shared with this app`)
    return lines.join('\n') || 'No folders.'
  }

  /** Where a new note or a moved one may go: a visible folder, or none only with full reach. */
  private target(reach: Reach, folder: string | null | undefined): string | null {
    if (folder?.trim()) return this.folderRef(reach, folder).id
    if (reach.folderIds) {
      throw new Error(
        'This app can only use some folders. Pass one of them as `folder` (see list_folders).',
      )
    }
    return null
  }

  async create(content: string, folder?: string): Promise<string> {
    await this.need('write')
    if (!content.trim()) throw new Error('The note is empty.')
    const folderId = this.target(await this.reach(), folder)
    const { result } = await this.track(
      this.meta('create', `Created a note: ${firstLine(content)}`),
      [],
      async () => {
        const note = await this.repo.createNote({ content, folderId })
        return { note, created: [note.id] }
      },
    )
    return `Saved "${title(result.note)}" (id: ${result.note.id}).`
  }

  async append(id: string, content: string): Promise<string> {
    await this.need('write')
    const note = await this.visibleNote(await this.reach(), id)
    if (!content.trim()) throw new Error('Nothing to append.')
    await this.track(this.meta('append', `Added to "${title(note)}"`), [id], async () => {
      await this.repo.updateContent(id, `${note.content.trimEnd()}\n\n${content.trim()}`, {
        base: note.content,
      })
      return {}
    })
    return `Added to "${title(note)}".`
  }

  /** Replaces the whole text of a note. */
  async update(id: string, content: string): Promise<string> {
    await this.need('write')
    const note = await this.visibleNote(await this.reach(), id)
    if (!content.trim()) throw new Error('The new text is empty. To remove the note, delete it.')
    await this.track(this.meta('update', `Rewrote "${title(note)}"`), [id], async () => {
      await this.repo.updateContent(id, content, { base: note.content })
      return {}
    })
    return `Updated "${title(note)}".`
  }

  /** Replaces one exact passage of a note (it must occur once), leaving the rest as it is. */
  async edit(id: string, find: string, replace: string): Promise<string> {
    await this.need('write')
    const note = await this.visibleNote(await this.reach(), id)
    if (!find) throw new Error('Give the exact text to replace (`find`).')
    const at = note.content.indexOf(find)
    if (at < 0) {
      throw new Error(
        `The text to replace was not found in "${title(note)}". Read the note with get_note and copy the passage exactly.`,
      )
    }
    if (note.content.indexOf(find, at + 1) >= 0) {
      throw new Error('The text to replace occurs more than once. Include more of it.')
    }
    const next = note.content.slice(0, at) + replace + note.content.slice(at + find.length)
    if (!next.trim()) throw new Error('The note would be empty. To remove the note, delete it.')
    await this.track(this.meta('update', `Edited "${title(note)}"`), [id], async () => {
      await this.repo.updateContent(id, next, { base: note.content })
      return {}
    })
    return `Edited "${title(note)}".`
  }

  async move(id: string, folder: string | null): Promise<string> {
    await this.need('write')
    const reach = await this.reach()
    const note = await this.visibleNote(reach, id)
    const folderId = this.target(reach, folder)
    const where = this.folderPath(reach, folderId)
    await this.track(this.meta('move', `Moved "${title(note)}" to ${where}`), [id], async () => {
      await this.repo.moveNote(id, folderId)
      return {}
    })
    return `Moved "${title(note)}" to ${where}.`
  }

  async remove(id: string): Promise<string> {
    await this.need('full')
    const note = await this.visibleNote(await this.reach(), id)
    await this.track(this.meta('delete', `Deleted "${title(note)}"`), [id], async () => {
      await this.repo.deleteNote(id)
      return {}
    })
    return `Deleted "${title(note)}". The user can bring it back from the AI activity log.`
  }

  async createFolder(name: string, parent?: string): Promise<string> {
    await this.need('write')
    const reach = await this.reach()
    if (!name.trim()) throw new Error('The folder name is empty.')
    const parentId = parent?.trim() ? this.folderRef(reach, parent).id : null
    if (!parentId && reach.folderIds) {
      throw new Error(
        'This app can only use some folders: create the new folder inside one of them.',
      )
    }
    const { result } = await this.track(
      this.meta('folder', `Created the folder "${name.trim()}"`),
      [],
      async () => {
        const folder = await this.repo.createFolder(name, parentId)
        // A folder made inside a shared one is shared too (the scope covers subfolders).
        return { folder, createdFolders: [folder.id] }
      },
    )
    return `Created the folder "${result.folder.name}" (id: ${result.folder.id}).`
  }

  async renameFolder(folder: string, name: string): Promise<string> {
    await this.need('write')
    const f = this.folderRef(await this.reach(), folder)
    if (!name.trim()) throw new Error('The folder name is empty.')
    await this.track(
      this.meta('folder', `Renamed the folder "${f.name}" to "${name.trim()}"`),
      [],
      async () => {
        await this.repo.renameFolder(f.id, name)
        return {}
      },
      [f.id],
    )
    return `Renamed "${f.name}" to "${name.trim()}".`
  }

  /** Deletes a folder and its subfolders; their notes stay, without a folder. */
  async deleteFolder(folder: string): Promise<string> {
    await this.need('full')
    const f = this.folderRef(await this.reach(), folder)
    const subtree = await this.repo.folderSubtree(f.id)
    const notes = await this.db.query<{ id: string }>(
      `SELECT id FROM notes WHERE deleted_at IS NULL AND folder_id IN (${subtree.map(() => '?').join(',')})`,
      subtree,
    )
    await this.track(
      this.meta('folder', `Deleted the folder "${f.name}"`),
      notes.map((n) => n.id),
      async () => {
        await this.repo.deleteFolder(f.id)
        return {}
      },
      subtree,
    )
    return `Deleted the folder "${f.name}"${subtree.length > 1 ? ` and ${subtree.length - 1} folders inside it` : ''}. Its ${notes.length} notes were kept, now without a folder.`
  }

  /** The daily note of `date` (YYYY-MM-DD, default today); with `append`, adds to it first. */
  async daily(date?: string, append?: string): Promise<string> {
    const day = date ?? localDate()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Use a date like 2026-09-25.')
    const reach = await this.reach()
    // Daily notes have no folder: only a client with the whole library sees them.
    if (reach.folderIds) throw new AccessError(this.opts.gate.dailyHidden)
    if (append?.trim()) {
      await this.need('write')
      const existing = await this.dailyNote(day)
      const { result } = await this.track(
        this.meta('append', `Added to the daily note ${day}`),
        existing ? [existing.id] : [],
        async () => {
          const note = existing ?? (await this.repo.getOrCreateDaily(day, () => `# ${day}`))
          await this.repo.updateContent(note.id, `${note.content.trimEnd()}\n\n${append.trim()}`, {
            base: note.content,
          })
          return { id: note.id, created: existing ? [] : [note.id] }
        },
      )
      return this.describe(reach, (await this.repo.getNote(result.id)) as Note)
    }
    await this.need('read')
    const note = await this.dailyNote(day)
    return note ? this.describe(reach, note) : `There is no daily note for ${day}.`
  }

  private async dailyNote(day: string): Promise<Note | null> {
    const [row] = await this.db.query<{ id: string }>(
      `SELECT id FROM notes WHERE type = 'daily' AND daily_date = ? AND deleted_at IS NULL`,
      [day],
    )
    return row ? this.repo.getNote(row.id) : null
  }
}
