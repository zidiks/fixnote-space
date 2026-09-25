import type { SqlRow, SqlValue } from '@fixnote/core'

export type Request =
  | { id: number; op: 'open'; name: string }
  | { id: number; op: 'execute' | 'query'; sql: string; params: SqlValue[] }
  | { id: number; op: 'close' }

export interface OpenResult {
  persistent: boolean
  /** Why storage is not persistent: OPFS missing, or the database is open in another tab. */
  detail?: 'no-opfs' | 'locked'
}

export type Response =
  | { id: number; ok: true; result: number | SqlRow[] | OpenResult | null }
  | { id: number; ok: false; error: string }
