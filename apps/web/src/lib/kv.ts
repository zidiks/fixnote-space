import type { SqlDriver } from '@fixnote/core'

/** Small local settings in the `kv` table (per device, not synced). */
export function kvStore(db: SqlDriver) {
  return {
    async get(key: string): Promise<string | null> {
      const [row] = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])
      return row?.value ?? null
    },
    async set(key: string, value: string): Promise<void> {
      await db.execute(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, value],
      )
    },
  }
}
