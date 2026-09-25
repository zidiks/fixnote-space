import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { createSqlDriver, type SqlDriver, type SqlRow, type SqlValue } from '@fixnote/core'

/**
 * The notes database through Node's built-in SQLite, next to the running desktop app. The app
 * keeps the file in WAL mode, so both can read and write; a short busy timeout covers the moments
 * the other side holds the write lock.
 */
export function openNodeSqlite(path: string): SqlDriver {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA busy_timeout = 5000')
  const bind = (params: readonly SqlValue[]) => params as SQLInputValue[]
  return createSqlDriver({
    execute: async (sql, params) => Number(db.prepare(sql).run(...bind(params)).changes),
    query: async (sql, params) => db.prepare(sql).all(...bind(params)) as SqlRow[],
    close: async () => db.close(),
  })
}
