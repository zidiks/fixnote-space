/// <reference lib="webworker" />
import type { SqlRow } from '@fixnote/core'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { OpenResult, Request, Response } from './protocol'

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type Db = InstanceType<Sqlite3['oo1']['DB']>

declare const self: DedicatedWorkerGlobalScope

let db: Db | null = null

async function open(name: string): Promise<OpenResult> {
  const sqlite3 = await sqlite3InitModule()
  const hasOpfs =
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  if (hasOpfs) {
    try {
      // opfs-sahpool needs no COOP/COEP headers. It holds exclusive handles, so a second tab fails here.
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'fixnote' })
      db = new pool.OpfsSAHPoolDb(`/${name}`)
      return { persistent: true }
    } catch {
      db = new sqlite3.oo1.DB(':memory:')
      return { persistent: false, detail: 'locked' }
    }
  }
  db = new sqlite3.oo1.DB(':memory:')
  return { persistent: false, detail: 'no-opfs' }
}

function need(): Db {
  if (!db) throw new Error('Database is not open')
  return db
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const req = event.data
  let res: Response
  try {
    switch (req.op) {
      case 'open':
        res = { id: req.id, ok: true, result: await open(req.name) }
        break
      case 'execute': {
        const d = need()
        d.exec({ sql: req.sql, bind: req.params.length ? req.params : undefined })
        res = { id: req.id, ok: true, result: d.changes() }
        break
      }
      case 'query':
        res = {
          id: req.id,
          ok: true,
          result: need().selectObjects(
            req.sql,
            req.params.length ? req.params : undefined,
          ) as SqlRow[],
        }
        break
      case 'close':
        db?.close()
        db = null
        res = { id: req.id, ok: true, result: null }
        break
    }
  } catch (err) {
    res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(res)
}
