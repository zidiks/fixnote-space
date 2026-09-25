import type { SqlDriver, SqlRow, SqlValue } from '../platform'

/**
 * Raw access to one SQLite connection, usually across an async boundary (a Web Worker, Tauri IPC).
 * Implementations do no locking; `createSqlDriver` serializes calls on top.
 */
export interface SqlTransport {
  execute(sql: string, params: readonly SqlValue[]): Promise<number>
  query(sql: string, params: readonly SqlValue[]): Promise<SqlRow[]>
  close(): Promise<void>
}

type Tx = Pick<SqlDriver, 'execute' | 'query'>

/**
 * Builds a SqlDriver over a single connection. Every call runs in order, and a transaction holds the
 * connection until it commits, so statements from elsewhere can never land inside it.
 * Inside `transaction(fn)` use only the `tx` argument: calling the driver itself would wait for the
 * transaction to finish and deadlock.
 */
export function createSqlDriver(
  transport: SqlTransport,
  storage?: SqlDriver['storage'],
): SqlDriver {
  let tail: Promise<unknown> = Promise.resolve()

  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = tail.then(fn, fn)
    tail = result.catch(() => undefined)
    return result
  }

  const direct: Tx = {
    execute: async (sql, params = []) => ({ rowsAffected: await transport.execute(sql, params) }),
    query: <T extends SqlRow = SqlRow>(sql: string, params: readonly SqlValue[] = []) =>
      transport.query(sql, params) as Promise<T[]>,
  }

  return {
    storage,
    execute: (sql, params) => exclusive(() => direct.execute(sql, params)),
    query: <T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]) =>
      exclusive(() => direct.query<T>(sql, params)),
    transaction: (fn) =>
      exclusive(async () => {
        await transport.execute('BEGIN IMMEDIATE', [])
        try {
          const value = await fn(direct)
          await transport.execute('COMMIT', [])
          return value
        } catch (err) {
          await transport.execute('ROLLBACK', []).catch(() => undefined)
          throw err
        }
      }),
    close: () => exclusive(() => transport.close()),
  }
}
