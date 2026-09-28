import { readFileSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute } from 'node:path'
import {
  Attachments,
  AuditLog,
  attachmentIds,
  attachmentUrl,
  type BlobStore,
  type Folder,
  MAX_ATTACHMENT_BYTES,
  MCP_ACCESS_KEY,
  MCP_SCOPE_KEY,
  type McpAccess,
  type McpScope,
  mcpAllows,
  type Note,
  NotesRepo,
  parseMcpAccess,
  parseMcpScope,
  retrieve,
  type SqlDriver,
  scopeFolderIds,
} from '@fixnote/core'

export type { McpAccess }
export const ACCESS_KEY = MCP_ACCESS_KEY
export const SCOPE_KEY = MCP_SCOPE_KEY

export class AccessError extends Error {}

/** What a tool returns to the client: text, an image it can look at, or a file. */
export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType: string; blob: string } }

/** Images the client can look at (MCP image content); others come back as files. */
const VIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
/** Bigger images than this come back as a file: clients refuse larger ones. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** Text files up to this size come back as text. */
const MAX_TEXT_BYTES = 512 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.html': 'text/html',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
}

const isText = (mime: string) =>
  mime.startsWith('text/') || /^application\/(json|xml|x-yaml|yaml)$/.test(mime)

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

const SETTINGS = 'FixNote → Settings → AI → Connected apps'

/** What the current settings let a client see: all notes, or some folders and notes. */
interface Reach {
  scope: McpScope
  folders: Folder[]
  /** null = every folder and notes without one. */
  folderIds: Set<string> | null
  noteIds: Set<string>
}

/**
 * The notes tools behind the MCP server, over the same repository the app uses: writes are marked
 * for sync and logged in the AI activity log, where the user can undo them. Every call re-reads the
 * access level and the scope, so a change in the app applies right away.
 */
export class NotesTools {
  readonly repo: NotesRepo
  readonly audit: AuditLog
  /** Files and images in notes; null when the app's attachment folder is not known. */
  readonly attachments: Attachments | null

  constructor(
    private readonly db: SqlDriver,
    private readonly client: () => string,
    blobs?: BlobStore,
  ) {
    this.repo = new NotesRepo(db)
    this.audit = new AuditLog(db, this.repo)
    this.attachments = blobs ? new Attachments(db, blobs) : null
  }

  private async kv(key: string): Promise<string | null> {
    const [row] = await this.db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
      key,
    ])
    return row?.value ?? null
  }

  async access(): Promise<McpAccess> {
    return parseMcpAccess(await this.kv(ACCESS_KEY))
  }

  private async need(level: 'read' | 'write' | 'full') {
    const access = await this.access()
    if (mcpAllows(access, level)) return
    if (access === 'off') throw new AccessError(`Access to notes is turned off in ${SETTINGS}.`)
    throw new AccessError(
      level === 'write'
        ? `FixNote allows reading only. To let this app add and change notes, open ${SETTINGS} and allow writing.`
        : `FixNote does not let connected apps delete. To allow it, open ${SETTINGS} and choose full access.`,
    )
  }

  private async reach(): Promise<Reach> {
    const scope = parseMcpScope(await this.kv(SCOPE_KEY))
    const folders = await this.repo.listFolders()
    return {
      scope,
      folders,
      folderIds: scopeFolderIds(scope, folders),
      noteIds: new Set(scope.kind === 'some' ? scope.notes : []),
    }
  }

  private sees(reach: Reach, note: { id: string; folderId: string | null }) {
    if (!reach.folderIds) return true
    return (
      reach.noteIds.has(note.id) || (note.folderId !== null && reach.folderIds.has(note.folderId))
    )
  }

  private seesFolder(reach: Reach, id: string) {
    return !reach.folderIds || reach.folderIds.has(id)
  }

  /** A note the client may see, or an error that does not reveal whether it exists. */
  private async visibleNote(reach: Reach, id: string): Promise<Note> {
    const note = await this.repo.getNote(id)
    if (!note || !this.sees(reach, note)) throw new Error(`No note with id ${id}.`)
    return note
  }

  private provider = () => `${this.client()} (MCP)`

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
   * A folder the client may use, by id, name or path ("Work / Projects"), case-insensitive. A name
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
    throw new Error(`No folder "${ref}". list_folders shows the folders this app can use.`)
  }

  private async describe(reach: Reach, n: Note): Promise<string> {
    return [
      `# ${n.title || 'Untitled'}`,
      `id: ${n.id}`,
      `folder: ${this.folderPath(reach, n.folderId)}`,
      n.pinnedAt ? 'pinned: yes' : '',
      `created: ${iso(n.createdAt)}, edited: ${iso(n.updatedAt)}`,
      await this.attachmentList(n),
      '\n' + n.content,
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
    }
    return lines.join('\n')
  }

  /** An attachment of a note the client may see; the error does not reveal whether it exists. */
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

  /** An image to look at, a text file as text, anything else as a file. */
  async getAttachment(id: string): Promise<ToolContent[]> {
    await this.need('read')
    const { note, name, image } = await this.visibleAttachment(await this.reach(), id)
    const info = await this.attachments?.info(id)
    const blob = info ? await this.attachments?.load(id) : null
    if (!info || !blob) {
      throw new Error(
        `This file is not on this computer yet. Open "${note.title || 'Untitled'}" in FixNote once and it downloads.`,
      )
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const label = `${image ? 'Image' : name || 'File'} from "${note.title || 'Untitled'}" (${info.mime}, ${fileSize(info.size)})`
    const text = { type: 'text' as const, text: label }
    if (VIEWABLE.has(info.mime) && bytes.length <= MAX_IMAGE_BYTES) {
      return [
        text,
        { type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType: info.mime },
      ]
    }
    if (isText(info.mime) && bytes.length <= MAX_TEXT_BYTES) {
      return [text, { type: 'text', text: new TextDecoder().decode(bytes) }]
    }
    return [
      text,
      {
        type: 'resource',
        resource: {
          uri: `fixnote://attachment/${id}`,
          mimeType: info.mime,
          blob: Buffer.from(bytes).toString('base64'),
        },
      },
    ]
  }

  /**
   * Attaches a file to the end of a note: an image shows in it, any other file becomes a link. The
   * file comes from a path on this computer or as base64 `data` with a `name`.
   */
  async attach(
    id: string,
    file: { path?: string; data?: string; name?: string; mime?: string },
  ): Promise<string> {
    await this.need('write')
    if (!this.attachments) throw new Error('Files are not available: FixNote was not found here.')
    const note = await this.visibleNote(await this.reach(), id)
    let bytes: Uint8Array
    let name = file.name?.trim() ?? ''
    if (file.path) {
      if (!isAbsolute(file.path)) throw new Error('Give the full path to the file.')
      const stat = statSync(file.path, { throwIfNoEntry: false })
      if (!stat?.isFile()) throw new Error(`No file at ${file.path}.`)
      if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error(tooBig(stat.size))
      bytes = new Uint8Array(readFileSync(file.path))
      name ||= basename(file.path)
    } else if (file.data) {
      bytes = new Uint8Array(Buffer.from(file.data, 'base64'))
      if (!name) throw new Error('Give the file a `name` (like "plan.pdf").')
    } else {
      throw new Error('Pass `path` (a file on this computer) or `data` (base64) with a `name`.')
    }
    if (!bytes.length) throw new Error('The file is empty.')
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error(tooBig(bytes.length))
    const mime =
      file.mime?.trim() || MIME_BY_EXT[extname(name).toLowerCase()] || 'application/octet-stream'
    const attachments = this.attachments
    const image = mime.startsWith('image/') && mime !== 'image/svg+xml'
    await this.audit.track(
      {
        kind: 'mcp.append',
        summary: `Attached ${name} to "${note.title || 'Untitled'}"`,
        provider: this.provider(),
      },
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
    return `Attached ${name} (${fileSize(bytes.length)}) to "${note.title || 'Untitled'}".`
  }

  async search(query: string, limit = 8): Promise<string> {
    await this.need('read')
    const reach = await this.reach()
    // Ask for more when only part of the notes is visible, then keep the visible ones.
    let hits = await retrieve(
      this.db,
      null,
      query,
      { kind: 'all' },
      {
        limit: reach.folderIds ? 60 : limit,
      },
    )
    if (reach.folderIds && hits.length) {
      const ids = [...new Set(hits.map((h) => h.noteId))]
      const rows = await this.db.query<{ id: string; folder_id: string | null }>(
        `SELECT id, folder_id FROM notes WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
      )
      const folderOf = new Map(rows.map((r) => [r.id, r.folder_id]))
      hits = hits.filter((h) =>
        this.sees(reach, { id: h.noteId, folderId: folderOf.get(h.noteId) ?? null }),
      )
    }
    hits = hits.slice(0, limit)
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
    const reach = await this.reach()
    return this.describe(reach, await this.visibleNote(reach, id))
  }

  async recent(limit = 10): Promise<string> {
    await this.need('read')
    const reach = await this.reach()
    const want = Math.min(Math.max(limit, 1), 50)
    const page = await this.repo.listNotes({ limit: reach.folderIds ? 200 : want })
    const items = page.items.filter((n) => this.sees(reach, n)).slice(0, want)
    if (!items.length) return 'No notes yet.'
    return items
      .map(
        (n) =>
          `- ${n.title || 'Untitled'} (id: ${n.id}, edited ${iso(n.updatedAt)})${n.excerpt ? `\n  ${n.excerpt}` : ''}`,
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
    const note = await this.visibleNote(await this.reach(), id)
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

  /** Replaces the whole text of a note. */
  async update(id: string, content: string): Promise<string> {
    await this.need('write')
    const note = await this.visibleNote(await this.reach(), id)
    if (!content.trim()) throw new Error('The new text is empty. To remove the note, delete it.')
    await this.audit.track(
      {
        kind: 'mcp.update',
        summary: `Rewrote "${note.title || 'Untitled'}"`,
        provider: this.provider(),
      },
      [id],
      async () => {
        await this.repo.updateContent(id, content, { base: note.content })
        return {}
      },
    )
    return `Updated "${note.title || 'Untitled'}".`
  }

  async move(id: string, folder: string | null): Promise<string> {
    await this.need('write')
    const reach = await this.reach()
    const note = await this.visibleNote(reach, id)
    const folderId = this.target(reach, folder)
    await this.audit.track(
      {
        kind: 'mcp.move',
        summary: `Moved "${note.title || 'Untitled'}" to ${this.folderPath(reach, folderId)}`,
        provider: this.provider(),
      },
      [id],
      async () => {
        await this.repo.moveNote(id, folderId)
        return {}
      },
    )
    return `Moved "${note.title || 'Untitled'}" to ${this.folderPath(reach, folderId)}.`
  }

  async remove(id: string): Promise<string> {
    await this.need('full')
    const note = await this.visibleNote(await this.reach(), id)
    await this.audit.track(
      {
        kind: 'mcp.delete',
        summary: `Deleted "${note.title || 'Untitled'}"`,
        provider: this.provider(),
      },
      [id],
      async () => {
        await this.repo.deleteNote(id)
        return {}
      },
    )
    return `Deleted "${note.title || 'Untitled'}". The user can bring it back from the AI activity log.`
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
    const { result } = await this.audit.track(
      {
        kind: 'mcp.folder',
        summary: `Created the folder "${name.trim()}"`,
        provider: this.provider(),
      },
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
    await this.audit.track(
      {
        kind: 'mcp.folder',
        summary: `Renamed the folder "${f.name}" to "${name.trim()}"`,
        provider: this.provider(),
      },
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
    await this.audit.track(
      { kind: 'mcp.folder', summary: `Deleted the folder "${f.name}"`, provider: this.provider() },
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
    if (reach.folderIds) {
      throw new AccessError(`Daily notes are not shared with this app (see ${SETTINGS}).`)
    }
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

const tooBig = (size: number) =>
  `The file is ${fileSize(size)}; FixNote takes files up to ${fileSize(MAX_ATTACHMENT_BYTES)}.`

const firstLine = (s: string) => {
  const line =
    s
      .trim()
      .split('\n')[0]
      ?.replace(/^#+\s*/, '') ?? ''
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}
