import type { SqlRow, SqlTransport, SqlValue } from '@fixnote/core/remote-mcp/headless'

/** The part of a Durable Object's `ctx.storage.sql` the demo device uses. */
export interface SqlExec {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] }
}

const META = '_demo_meta'

/**
 * Core's SQL over a Durable Object's SQLite. That SQLite refuses statements that manage
 * transactions (BEGIN, COMMIT, ROLLBACK, SAVEPOINT) and may refuse `PRAGMA user_version`, so: the
 * schema version lives in a table of its own, and transaction statements do nothing. Writes of one
 * request are still applied together by the object, but a failed transaction is not rolled back.
 * Good enough for demo notes, never for anyone's own.
 */
export function doSqlTransport(sql: SqlExec): SqlTransport {
  sql.exec(`CREATE TABLE IF NOT EXISTS ${META} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  const version = () =>
    Number(
      sql.exec(`SELECT value FROM ${META} WHERE key = 'user_version'`).toArray()[0]?.value ?? 0,
    )

  return {
    async execute(query, params) {
      const q = query.trim()
      if (/^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(q)) return 0
      if (/^PRAGMA\s+foreign_keys\b/i.test(q)) return 0
      const set = /^PRAGMA\s+user_version\s*=\s*(\d+)\s*;?$/i.exec(q)
      if (set) {
        sql.exec(
          `INSERT INTO ${META} (key, value) VALUES ('user_version', ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          set[1],
        )
        return 0
      }
      sql.exec(query, ...params.map(toBinding)).toArray()
      // changes(), not the cursor's rowsWritten: that also counts index, FTS and trigger rows.
      return Number(sql.exec('SELECT changes() AS n').toArray()[0]?.n ?? 0)
    },
    async query(query, params) {
      if (/^PRAGMA\s+user_version\s*;?$/i.test(query.trim())) return [{ user_version: version() }]
      return sql
        .exec(query, ...params.map(toBinding))
        .toArray()
        .map(toRow)
    },
    async close() {},
  }
}

function toBinding(v: SqlValue): unknown {
  if (typeof v === 'bigint') return Number(v)
  if (v instanceof Uint8Array) return v.slice().buffer
  return v
}

function toRow(r: Record<string, unknown>): SqlRow {
  const out: SqlRow = {}
  for (const [k, v] of Object.entries(r)) {
    out[k] =
      v instanceof ArrayBuffer
        ? new Uint8Array(v)
        : v instanceof Uint8Array || v === null || typeof v === 'string' || typeof v === 'number'
          ? v
          : typeof v === 'bigint'
            ? Number(v)
            : String(v)
  }
  return out
}
