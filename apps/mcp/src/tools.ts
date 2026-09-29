import { readFileSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute } from 'node:path'
import {
  AccessError,
  Attachments,
  AuditLog,
  type BlobStore,
  fileSize,
  MAX_ATTACHMENT_BYTES,
  MCP_ACCESS_KEY,
  MCP_SCOPE_KEY,
  type McpAccess,
  mcpAllows,
  NotesRepo,
  NoteTools,
  parseMcpAccess,
  parseMcpScope,
  type SqlDriver,
  type ToolGate,
} from '@fixnote/core'

export type { McpAccess }
export { AccessError, fileSize }
export const ACCESS_KEY = MCP_ACCESS_KEY
export const SCOPE_KEY = MCP_SCOPE_KEY

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

const SETTINGS = 'FixNote → Settings → AI → Connected apps'

const kv = async (db: SqlDriver, key: string): Promise<string | null> => {
  const [row] = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])
  return row?.value ?? null
}

/** What the user allowed connected apps in FixNote, read again on every call. */
function settingsGate(db: SqlDriver): ToolGate {
  return {
    async need(level) {
      const access = parseMcpAccess(await kv(db, ACCESS_KEY))
      if (mcpAllows(access, level)) return
      if (access === 'off') throw new AccessError(`Access to notes is turned off in ${SETTINGS}.`)
      throw new AccessError(
        level === 'write'
          ? `FixNote allows reading only. To let this app add and change notes, open ${SETTINGS} and allow writing.`
          : `FixNote does not let connected apps delete. To allow it, open ${SETTINGS} and choose full access.`,
      )
    },
    scope: async () => parseMcpScope(await kv(db, SCOPE_KEY)),
    dailyHidden: `Daily notes are not shared with this app (see ${SETTINGS}).`,
  }
}

/**
 * The notes tools behind the MCP server (`NoteTools` in core, shared with the assistant) plus what
 * only a program on this computer does: reading files from disk and handing files back as base64.
 * Every call re-reads the access level and the scope, so a change in the app applies right away.
 */
export class NotesTools extends NoteTools {
  constructor(db: SqlDriver, client: () => string, blobs?: BlobStore) {
    const repo = new NotesRepo(db)
    super(db, repo, new AuditLog(db, repo), {
      gate: settingsGate(db),
      provider: () => `${client()} (MCP)`,
      kinds: 'mcp',
      attachments: blobs ? new Attachments(db, blobs) : null,
    })
  }

  async access(): Promise<McpAccess> {
    return parseMcpAccess(await kv(this.db, ACCESS_KEY))
  }

  /** An image to look at, a text file as text, anything else as a file. */
  async getAttachment(id: string): Promise<ToolContent[]> {
    const { note, name, image, info, bytes } = await this.attachmentData(id)
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
    await this.visibleNote(await this.reach(), id)
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
    return this.attachBytes(id, bytes, name, mime)
  }
}

const tooBig = (size: number) =>
  `The file is ${fileSize(size)}; FixNote takes files up to ${fileSize(MAX_ATTACHMENT_BYTES)}.`
