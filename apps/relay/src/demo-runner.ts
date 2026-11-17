import {
  type HeadlessDevice,
  openHeadlessDevice,
  type RelayCall,
} from '@fixnote/core/remote-mcp/headless'
import { DEMO_NOTES, DEMO_VERSION } from './demo-notes'
import { doSqlTransport, type SqlExec } from './demo-sql'
import type { ToolAnswer } from './hub'

const DAY_MS = 86_400_000
/** The demo notes start over once they are a day old… */
export const RESET_AFTER_MS = DAY_MS
/** …and nobody has used them for an hour (a reviewer's session is never cut in the middle). */
export const QUIET_MS = 60 * 60_000

const STATE = 'demo_state'

/**
 * The demo device's work, apart from the Durable Object (demo.ts) so it runs in tests: opens the
 * device on the object's SQLite, puts the demo notes there (again when `DEMO_VERSION` changes or
 * they are stale) and answers calls with core's `RemoteExecutor`, as a real device would.
 */
export class DemoRunner {
  private device: HeadlessDevice | null = null
  /** One call at a time gets the device ready: a second must not start the notes over again. */
  private lock: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly sql: SqlExec,
    private readonly opts: {
      /** Removes everything the object stores (`ctx.storage.deleteAll()`). */
      wipe: () => Promise<void>
      now?: () => number
    },
  ) {}

  private now = () => (this.opts.now ?? Date.now)()

  async run(call: RelayCall): Promise<ToolAnswer> {
    const ready = this.lock.then(() => this.ready())
    this.lock = ready.catch(() => undefined)
    const device = await ready
    const result = await device.executor.run(call)
    this.setState('used_at', this.now())
    return { content: result.content, ...(result.isError ? { isError: true } : {}) }
  }

  private async ready(): Promise<HeadlessDevice> {
    const now = this.now()
    const version = this.state('version')
    const stale =
      version !== DEMO_VERSION ||
      (now - this.state('seeded_at') > RESET_AFTER_MS && now - this.state('used_at') > QUIET_MS)
    if (!stale && this.device) return this.device
    if (!stale) {
      this.device = await openHeadlessDevice(doSqlTransport(this.sql), { now: this.now })
      return this.device
    }
    this.device = null
    await this.opts.wipe()
    const device = await openHeadlessDevice(doSqlTransport(this.sql), { now: this.now })
    await seed(device, now)
    this.setState('version', DEMO_VERSION)
    this.setState('seeded_at', now)
    this.setState('used_at', 0)
    this.device = device
    return device
  }

  private state(key: string): number {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${STATE} (key TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
    )
    const row = this.sql.exec(`SELECT value FROM ${STATE} WHERE key = ?`, key).toArray()[0]
    return Number(row?.value ?? 0)
  }

  private setState(key: string, value: number) {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${STATE} (key TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
    )
    this.sql.exec(
      `INSERT INTO ${STATE} (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    )
  }
}

async function seed({ repo }: HeadlessDevice, now: number) {
  const folders = new Map<string, string>()
  const folderId = async (path: string): Promise<string> => {
    const known = folders.get(path)
    if (known) return known
    const cut = path.lastIndexOf('/')
    const parent = cut < 0 ? null : await folderId(path.slice(0, cut))
    const folder = await repo.createFolder(path.slice(cut + 1), parent)
    folders.set(path, folder.id)
    return folder.id
  }
  for (const note of DEMO_NOTES) {
    const at = Math.round(now - note.ago * DAY_MS)
    const date = new Date(at).toISOString().slice(0, 10)
    await repo.createNote({
      content: note.daily ? `# ${date}\n\n${note.content}` : note.content,
      folderId: note.folder ? await folderId(note.folder) : null,
      type: note.daily ? 'daily' : 'text',
      dailyDate: note.daily ? date : null,
      createdAt: at,
      updatedAt: at,
    })
  }
}
