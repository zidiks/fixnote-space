import { AuditLog } from '../ai/audit'
import { createSqlDriver, type SqlTransport } from '../db/driver'
import { prepareDatabase } from '../db/migrate'
import { MCP_ACCESS_KEY } from '../mcp'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { MCP_REMOTE_KEY, RemoteExecutor } from './executor'

export type { SqlTransport } from '../db/driver'
export type { SqlRow, SqlValue } from '../platform'
export * from './protocol'

/**
 * A Fixnote device without a screen or a person: the relay's demo device for the accounts AI-app
 * reviewers use (apps/relay/src/demo.ts). Same database schema, `NotesRepo`, `NoteTools` and
 * `RemoteExecutor` as a real device, with Remote access on and "Read and write"; its notes are
 * demo notes only, never anyone's own (they are not encrypted and never sync).
 */
export interface HeadlessDevice {
  db: SqlDriver
  repo: NotesRepo
  executor: RemoteExecutor
}

export async function openHeadlessDevice(
  transport: SqlTransport,
  opts: { now?: () => number } = {},
): Promise<HeadlessDevice> {
  const db = createSqlDriver(transport, { persistent: true, detail: 'relay demo device' })
  await prepareDatabase(db)
  const repo = new NotesRepo(db, { now: opts.now })
  const audit = new AuditLog(db, repo, { now: opts.now })
  const settings: [string, string][] = [
    [MCP_REMOTE_KEY, '1'],
    [MCP_ACCESS_KEY, 'write'],
  ]
  for (const [key, value] of settings) {
    await db.execute(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, value],
    )
  }
  return { db, repo, executor: new RemoteExecutor(db, repo, audit, { now: opts.now }) }
}
