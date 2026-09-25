import { createSqlDriver, type SqlDriver, type SqlRow, type SqlValue } from '@fixnote/core'
import { invoke } from '@tauri-apps/api/core'

type Wire = string | number | null | { $blob: number[] }

const toWire = (v: SqlValue): Wire => {
  if (v instanceof Uint8Array) return { $blob: Array.from(v) }
  if (typeof v === 'bigint') {
    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RangeError('bigint parameter exceeds the safe integer range')
    }
    return Number(v)
  }
  return v
}

const fromWire = (v: unknown): SqlValue =>
  v !== null && typeof v === 'object' && '$blob' in v
    ? Uint8Array.from((v as { $blob: number[] }).$blob)
    : (v as SqlValue)

/** SQLite in the Rust process (rusqlite, one connection) via Tauri commands. */
export function openTauriSqlDriver(): SqlDriver {
  return createSqlDriver(
    {
      execute: (sql, params) => invoke<number>('db_execute', { sql, params: params.map(toWire) }),
      query: async (sql, params) => {
        const rows = await invoke<Record<string, unknown>[]>('db_query', {
          sql,
          params: params.map(toWire),
        })
        return rows.map((row) => {
          const out: SqlRow = {}
          for (const key in row) out[key] = fromWire(row[key])
          return out
        })
      },
      // The connection belongs to the app process and closes with it.
      close: async () => undefined,
    },
    { persistent: true },
  )
}
