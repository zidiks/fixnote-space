import { AccessError, NoteTools, type ToolGate } from '../agent/notes-tools'
import { NOTE_TOOL_SPECS, runNoteTool } from '../agent/specs'
import { changesNotes } from '../agent/tool-specs'
import type { AiAction, AuditLog } from '../ai/audit'
import type { Attachments } from '../attachments'
import {
  MCP_ACCESS_KEY,
  MCP_SCOPE_KEY,
  type McpScope,
  mcpAllows,
  parseMcpAccess,
  parseMcpScope,
  scopeFolderIds,
} from '../mcp'
import type { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import {
  isRemoteTool,
  MAX_RESULT_CHARS,
  type RelayCall,
  type RelayResult,
  type RemoteScope,
} from './protocol'

/** '1' when the user turned on Remote access on this device (Settings → Integrations). */
export const MCP_REMOTE_KEY = 'mcp.remote'
/** The last remote calls on this device, for Settings (JSON of RemoteCallEntry[]). */
export const MCP_REMOTE_LOG_KEY = 'mcp.remote.log'
const LOG_SIZE = 50
/** When remote apps last changed notes here (JSON of ms), for `CHANGE_LIMIT`. */
export const MCP_REMOTE_CHANGES_KEY = 'mcp.remote.changes'
/**
 * At most this many changes from remote apps per `CHANGE_WINDOW_MS` on a device. Nobody confirms
 * a remote change on the device, so a note that talks an AI app into rewriting everything gets
 * only this far before the person looks (each change can be undone in AI activity).
 */
export const CHANGE_LIMIT = 20
export const CHANGE_WINDOW_MS = 10 * 60_000

/** One call from a remote app, as this device answered it. No arguments, no answers. */
export interface RemoteCallEntry {
  at: number
  client: string
  tool: string
  ok: boolean
}

const SETTINGS = 'FixNote → Settings → AI → Connected apps'
const READ_ONLY = `FixNote allows AI apps to read only. To let them add and change notes, open ${SETTINGS} and choose "Read and write".`
const NO_DELETE =
  'AI apps connected through remote access cannot delete. Delete notes in FixNote itself.'
const NOT_REMOTE =
  'AI apps connected through remote access cannot do this. Do it in FixNote itself.'
const TOO_MANY = `Too many changes in a short time: FixNote takes no more changes from AI apps for a few minutes. Reading still works. Each change can be undone in FixNote → Settings → AI → AI activity.`

async function kv(db: SqlDriver, key: string): Promise<string | null> {
  const [row] = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])
  return row?.value ?? null
}

async function setKv(db: SqlDriver, key: string, value: string) {
  await db.execute(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  )
}

/** Both scopes at once: what this device allows and what the account allows remote apps. */
export async function intersectScopes(
  db: SqlDriver,
  folders: readonly { id: string; parentId: string | null }[],
  a: McpScope,
  b: McpScope,
): Promise<McpScope> {
  if (a.kind === 'all') return b
  if (b.kind === 'all') return a
  const fa = scopeFolderIds(a, folders) ?? new Set<string>()
  const fb = scopeFolderIds(b, folders) ?? new Set<string>()
  const candidates = [...new Set([...a.notes, ...b.notes])]
  const rows = candidates.length
    ? await db.query<{ id: string; folder_id: string | null }>(
        `SELECT id, folder_id FROM notes WHERE id IN (${candidates.map(() => '?').join(',')})`,
        candidates,
      )
    : []
  const allows = (s: McpScope, f: Set<string>, id: string, folder: string | null) =>
    s.kind === 'all' || s.notes.includes(id) || (folder !== null && f.has(folder))
  return {
    kind: 'some',
    folders: [...fa].filter((id) => fb.has(id)),
    notes: rows
      .filter((r) => allows(a, fa, r.id, r.folder_id) && allows(b, fb, r.id, r.folder_id))
      .map((r) => r.id),
  }
}

/**
 * What a remote app may do, read again on every call: Remote access on, the same access level and
 * scope as local MCP apps (narrowed further by the account's remote scope from the relay), and
 * never deleting.
 */
export function remoteGate(db: SqlDriver, repo: NotesRepo, remote: RemoteScope = null): ToolGate {
  return {
    async need(level) {
      if ((await kv(db, MCP_REMOTE_KEY)) !== '1') {
        throw new AccessError('Remote access is turned off in FixNote → Settings → Integrations.')
      }
      const access = parseMcpAccess(await kv(db, MCP_ACCESS_KEY))
      if (access === 'off') throw new AccessError(`Access to notes is turned off in ${SETTINGS}.`)
      if (level === 'full') throw new AccessError(NO_DELETE)
      if (!mcpAllows(access, level)) throw new AccessError(READ_ONLY)
    },
    async scope() {
      const local = parseMcpScope(await kv(db, MCP_SCOPE_KEY))
      if (!remote) return local
      return intersectScopes(db, await repo.listFolders(), local, { kind: 'some', ...remote })
    },
    dailyHidden: `Daily notes are not shared with this app (see ${SETTINGS}).`,
  }
}

/** This device's choice of visible notes, as the relay keeps it for the account (ids only). */
export async function localRemoteScope(db: SqlDriver): Promise<RemoteScope> {
  const scope = parseMcpScope(await kv(db, MCP_SCOPE_KEY))
  return scope.kind === 'all' ? null : { folders: scope.folders, notes: scope.notes }
}

export async function remoteLog(db: SqlDriver): Promise<RemoteCallEntry[]> {
  try {
    const parsed: unknown = JSON.parse((await kv(db, MCP_REMOTE_LOG_KEY)) ?? '[]')
    return Array.isArray(parsed) ? (parsed as RemoteCallEntry[]) : []
  } catch {
    return []
  }
}

/** A call running on this device right now, for the quiet "in use" indicator. */
export interface RemoteActivity {
  id: string
  client: string
  tool: string
}

/**
 * Runs what a remote app asked for, on this device: the notes are decrypted here and only the
 * answer goes back through the relay. Same `NoteTools` and settings as the local MCP server, minus
 * deleting and renaming folders; a change goes through `NotesRepo` and the `AuditLog` like any other, so
 * it syncs and can be undone.
 */
export class RemoteExecutor {
  constructor(
    private readonly db: SqlDriver,
    private readonly repo: NotesRepo,
    private readonly audit: AuditLog,
    private readonly opts: {
      attachments?: Attachments | null
      now?: () => number
      /** A call starts running here. */
      onStart?: (activity: RemoteActivity) => void
      /** Each answered call (Settings refreshes its list; the indicator fades). */
      onCall?: (entry: RemoteCallEntry, activity: RemoteActivity) => void
      /** Each change as it is logged (a note open on screen shows it; lists refresh; sync). */
      onChange?: (action: AiAction) => void
    } = {},
  ) {}

  async run(call: RelayCall): Promise<RelayResult> {
    const client = call.client.name || 'Remote app'
    const activity = { id: call.id, client, tool: call.tool }
    const gate = remoteGate(this.db, this.repo, call.scope)
    let text: string
    let ok = true
    let changed = false
    try {
      if (!isRemoteTool(call.tool)) {
        const spec = NOTE_TOOL_SPECS.find((t) => t.name === call.tool)
        if (!spec) throw new Error(`There is no tool named ${call.tool}.`)
        throw new AccessError(spec.level === 'full' ? NO_DELETE : NOT_REMOTE)
      }
      const change = changesNotes(call.tool, call.args)
      await gate.need(change ? 'write' : 'read')
      if (change && !(await this.mayChange())) throw new AccessError(TOO_MANY)
      this.opts.onStart?.(activity)
      const tools = new NoteTools(this.db, this.repo, this.audit, {
        gate,
        provider: () => `${client} (remote MCP)`,
        kinds: 'mcp',
        attachments: this.opts.attachments ?? null,
        onChange: (action) => {
          changed = true
          this.opts.onChange?.(action)
        },
      })
      text = await runNoteTool(tools, call.tool, call.args)
    } catch (err) {
      ok = false
      text = err instanceof Error ? err.message : String(err)
    }
    if (text.length > MAX_RESULT_CHARS) {
      text = `${text.slice(0, MAX_RESULT_CHARS - 80)}\n\n[Cut: the answer was too long. Ask for less.]`
    }
    const entry = { at: this.now(), client, tool: call.tool, ok }
    if (changed) await this.counted(entry.at).catch(() => undefined)
    await this.log(entry).catch(() => undefined)
    this.opts.onCall?.(entry, activity)
    return {
      type: 'result',
      id: call.id,
      content: [{ type: 'text', text }],
      ...(ok ? {} : { isError: true }),
    }
  }

  private now() {
    return (this.opts.now ?? Date.now)()
  }

  /** When remote apps changed notes within the last `CHANGE_WINDOW_MS`. */
  private async recentChanges(): Promise<number[]> {
    const since = this.now() - CHANGE_WINDOW_MS
    try {
      const parsed: unknown = JSON.parse((await kv(this.db, MCP_REMOTE_CHANGES_KEY)) ?? '[]')
      return Array.isArray(parsed)
        ? parsed.filter((t): t is number => typeof t === 'number' && t > since)
        : []
    } catch {
      return []
    }
  }

  private async mayChange() {
    return (await this.recentChanges()).length < CHANGE_LIMIT
  }

  private async counted(at: number) {
    const list = [...(await this.recentChanges()), at].slice(-CHANGE_LIMIT)
    await setKv(this.db, MCP_REMOTE_CHANGES_KEY, JSON.stringify(list))
  }

  private async log(entry: RemoteCallEntry) {
    const list = [entry, ...(await remoteLog(this.db))].slice(0, LOG_SIZE)
    await setKv(this.db, MCP_REMOTE_LOG_KEY, JSON.stringify(list))
  }
}
