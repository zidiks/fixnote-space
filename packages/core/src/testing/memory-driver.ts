import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { createSqlDriver } from '../db/driver'
import type { SqlDriver, SqlRow, SqlValue } from '../platform'

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
let sqlite3: Promise<Sqlite3> | null = null

/** In-memory SQLite (same wasm build the web app uses) for tests in Node. */
export async function createMemoryDriver(): Promise<SqlDriver> {
  sqlite3 ??= sqlite3InitModule()
  const { oo1 } = await sqlite3
  const db = new oo1.DB(':memory:')
  return createSqlDriver({
    execute: async (sql, params) => {
      db.exec({ sql, bind: params.length ? (params as SqlValue[]) : undefined })
      return db.changes()
    },
    query: async (sql, params) =>
      db.selectObjects(sql, params.length ? (params as SqlValue[]) : undefined) as SqlRow[],
    close: async () => db.close(),
  })
}
