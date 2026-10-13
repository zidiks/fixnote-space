import { AccessError, NoteTools, type ToolGate } from '../agent/notes-tools'
import { NOTE_TOOL_SPECS, runNoteTool } from '../agent/specs'
import type { AuditLog } from '../ai/audit'
import type { Attachments } from '../attachments'
import { MCP_ACCESS_KEY, MCP_SCOPE_KEY, parseMcpAccess, parseMcpScope } from '../mcp'
import type { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { isRemoteTool, MAX_RESULT_CHARS, type RelayCall, type RelayResult } from './protocol'

/** '1' when the user turned on Remote access on this device (Settings → Integrations). */
export const MCP_REMOTE_KEY = 'mcp.remote'
/** The last remote calls on this device, for Settings (JSON of RemoteCallEntry[]). */
export const MCP_REMOTE_LOG_KEY = 'mcp.remote.log'
const LOG_SIZE = 50

/** One call from a remote app, as this device answered it. No arguments, no answers. */
export interface RemoteCallEntry {
  at: number
  client: string
  tool: string
  ok: boolean
}

const SETTINGS = 'FixNote → Settings → AI → Connected apps'
const READ_ONLY =
  'This connection can only read notes. To add or change notes, ask in FixNote itself.'

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

/**
 * What a remote app may do, read again on every call: Remote access on, the same access level and
 * scope as local MCP apps, and in phase 1 never more than reading.
 */
export function remoteGate(db: SqlDriver): ToolGate {
  return {
    async need(level) {
      if ((await kv(db, MCP_REMOTE_KEY)) !== '1') {
        throw new AccessError('Remote access is turned off in FixNote → Settings → Integrations.')
      }
      if (parseMcpAccess(await kv(db, MCP_ACCESS_KEY)) === 'off') {
        throw new AccessError(`Access to notes is turned off in ${SETTINGS}.`)
      }
      if (level !== 'read') throw new AccessError(READ_ONLY)
    },
    scope: async () => parseMcpScope(await kv(db, MCP_SCOPE_KEY)),
    dailyHidden: `Daily notes are not shared with this app (see ${SETTINGS}).`,
  }
}

export async function remoteLog(db: SqlDriver): Promise<RemoteCallEntry[]> {
  try {
    const parsed: unknown = JSON.parse((await kv(db, MCP_REMOTE_LOG_KEY)) ?? '[]')
    return Array.isArray(parsed) ? (parsed as RemoteCallEntry[]) : []
  } catch {
    return []
  }
}

/**
 * Runs what a remote app asked for, on this device: the notes are decrypted here and only the
 * answer goes back through the relay. Same `NoteTools` and settings as the local MCP server, but
 * read-only (phase 1); a change would go through `NotesRepo` and the `AuditLog` like any other.
 */
export class RemoteExecutor {
  private readonly gate: ToolGate

  constructor(
    private readonly db: SqlDriver,
    private readonly repo: NotesRepo,
    private readonly audit: AuditLog,
    private readonly opts: {
      attachments?: Attachments | null
      now?: () => number
      /** Each answered call (Settings refreshes its list). */
      onCall?: (entry: RemoteCallEntry) => void
    } = {},
  ) {
    this.gate = remoteGate(db)
  }

  async run(call: RelayCall): Promise<RelayResult> {
    const client = call.client.name || 'Remote app'
    let text: string
    let ok = true
    try {
      if (!isRemoteTool(call.tool)) {
        throw NOTE_TOOL_SPECS.some((t) => t.name === call.tool)
          ? new AccessError(READ_ONLY)
          : new Error(`There is no tool named ${call.tool}.`)
      }
      if (call.tool === 'daily_note' && typeof call.args.append === 'string') {
        throw new AccessError(READ_ONLY)
      }
      await this.gate.need('read')
      const tools = new NoteTools(this.db, this.repo, this.audit, {
        gate: this.gate,
        provider: () => `${client} (remote MCP)`,
        kinds: 'mcp',
        attachments: this.opts.attachments ?? null,
      })
      text = await runNoteTool(tools, call.tool, call.args)
    } catch (err) {
      ok = false
      text = err instanceof Error ? err.message : String(err)
    }
    if (text.length > MAX_RESULT_CHARS) {
      text = `${text.slice(0, MAX_RESULT_CHARS - 80)}\n\n[Cut: the answer was too long. Ask for less.]`
    }
    const entry = { at: (this.opts.now ?? Date.now)(), client, tool: call.tool, ok }
    await this.log(entry).catch(() => undefined)
    this.opts.onCall?.(entry)
    return {
      type: 'result',
      id: call.id,
      content: [{ type: 'text', text }],
      ...(ok ? {} : { isError: true }),
    }
  }

  private async log(entry: RemoteCallEntry) {
    const list = [entry, ...(await remoteLog(this.db))].slice(0, LOG_SIZE)
    await setKv(this.db, MCP_REMOTE_LOG_KEY, JSON.stringify(list))
  }
}
