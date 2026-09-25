import type { SqlDriver } from '../platform'
import { MIGRATIONS, splitStatements } from './schema'

/** Per-connection settings plus pending migrations. Call once after opening a connection. */
export async function prepareDatabase(db: SqlDriver): Promise<{ from: number; to: number }> {
  await db.execute('PRAGMA foreign_keys = ON')
  const [row] = await db.query<{ user_version: number }>('PRAGMA user_version')
  const from = Number(row?.user_version ?? 0)
  if (from > MIGRATIONS.length) {
    throw new Error(
      `Database schema v${from} is newer than this app (v${MIGRATIONS.length}). Update the app.`,
    )
  }
  for (let v = from; v < MIGRATIONS.length; v++) {
    await db.transaction(async (tx) => {
      for (const stmt of splitStatements(MIGRATIONS[v] as string)) await tx.execute(stmt)
      await tx.execute(`PRAGMA user_version = ${v + 1}`)
    })
  }
  return { from, to: MIGRATIONS.length }
}
