import { DatabaseSync } from 'node:sqlite'
import type { RelayCall } from '@fixnote/core/remote-mcp/headless'
import { describe, expect, it } from 'vitest'
import { DEMO_NOTES } from './demo-notes'
import { DemoRunner, QUIET_MS, RESET_AFTER_MS } from './demo-runner'
import type { SqlExec } from './demo-sql'

/** A Durable Object's SQLite as far as the demo device sees it, with its refusals. */
function objectSql() {
  let db = new DatabaseSync(':memory:')
  const sql: SqlExec = {
    exec(query, ...bindings) {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i.test(query)) {
        throw new Error('not allowed: transaction statements')
      }
      if (/^\s*PRAGMA\s+user_version/i.test(query)) throw new Error('not allowed: pragma')
      const args = bindings.map((b) =>
        b instanceof ArrayBuffer ? new Uint8Array(b) : b,
      ) as never[]
      const statements = query.split(/;\s*$/m)
      if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(query) || /\bRETURNING\b/i.test(query)) {
        const rows = db.prepare(query).all(...args) as Record<string, unknown>[]
        return { toArray: () => rows }
      }
      if (statements.length > 1 && !args.length) db.exec(query)
      else db.prepare(query).run(...args)
      return { toArray: () => [] }
    },
  }
  return {
    sql,
    wipe: async () => {
      db.close()
      db = new DatabaseSync(':memory:')
    },
  }
}

const call = (tool: string, args: Record<string, unknown> = {}): RelayCall => ({
  type: 'call',
  id: crypto.randomUUID(),
  client: { id: 'c1', name: 'ChatGPT' },
  tool,
  args,
  scope: null,
})

describe('demo device', () => {
  it('answers from the demo notes, changes them, never deletes', async () => {
    const { sql, wipe } = objectSql()
    const runner = new DemoRunner(sql, { wipe })

    const found = await runner.run(call('search_notes', { query: 'Lisbon' }))
    expect(found.isError).toBeUndefined()
    expect(found.content[0]?.text).toContain('Lisbon in March')

    const folders = await runner.run(call('list_folders'))
    expect(folders.content[0]?.text).toContain('Meetings')

    const made = await runner.run(call('create_note', { content: '# Reviewer note\n\nHello' }))
    expect(made.isError).toBeUndefined()
    const again = await runner.run(call('search_notes', { query: 'Reviewer' }))
    expect(again.content[0]?.text).toContain('Reviewer note')

    const removed = await runner.run(call('delete_note', { id: 'x' }))
    expect(removed.isError).toBe(true)
  })

  it('starts over with the demo notes after a quiet day', async () => {
    const { sql, wipe } = objectSql()
    let now = 1_800_000_000_000
    const runner = new DemoRunner(sql, { wipe, now: () => now })
    await runner.run(call('create_note', { content: '# Left behind' }))

    now += RESET_AFTER_MS / 2
    expect((await runner.run(call('search_notes', { query: 'Left' }))).content[0]?.text).toContain(
      'Left behind',
    )

    now += RESET_AFTER_MS + QUIET_MS
    const later = await runner.run(call('search_notes', { query: 'Left' }))
    expect(later.content[0]?.text).not.toContain('Left behind')
    const recent = await runner.run(call('list_recent', { limit: 50 }))
    expect(recent.content[0]?.text).toContain('Q1 planning')
    expect(DEMO_NOTES.length).toBeGreaterThan(10)
  })

  it('gets ready once when calls arrive together', async () => {
    const { sql, wipe } = objectSql()
    const runner = new DemoRunner(sql, { wipe })
    const answers = await Promise.all([
      runner.run(call('list_folders')),
      runner.run(call('search_notes', { query: 'running' })),
    ])
    expect(answers.every((a) => !a.isError)).toBe(true)
    const all = await runner.run(call('list_recent', { limit: 100 }))
    expect(all.content[0]?.text.match(/Q1 planning/g)?.length).toBe(1)
  })
})
