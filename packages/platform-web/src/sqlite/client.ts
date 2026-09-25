import { createSqlDriver, type SqlDriver, type SqlRow, type SqlValue } from '@fixnote/core'
import type { OpenResult, Request, Response } from './protocol'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }
type Body = Request extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never

/** SQLite (wasm) in a dedicated worker, persisted in OPFS. */
export async function openWebSqlDriver(name = 'fixnote.db'): Promise<SqlDriver> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'fixnote-sqlite',
  })
  const pending = new Map<number, Pending>()
  let nextId = 1

  worker.onmessage = (e: MessageEvent<Response>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if (e.data.ok) p.resolve(e.data.result)
    else p.reject(new Error(e.data.error))
  }
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'SQLite worker failed'))
    pending.clear()
  }

  const call = <T>(body: Body): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      worker.postMessage({ ...body, id })
    })

  const opened = await call<OpenResult>({ op: 'open', name })
  return createSqlDriver(
    {
      execute: (sql, params) => call<number>({ op: 'execute', sql, params: params as SqlValue[] }),
      query: (sql, params) => call<SqlRow[]>({ op: 'query', sql, params: params as SqlValue[] }),
      close: async () => {
        await call({ op: 'close' })
        worker.terminate()
      },
    },
    { persistent: opened.persistent, detail: opened.detail },
  )
}
