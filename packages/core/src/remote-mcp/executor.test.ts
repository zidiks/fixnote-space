import { beforeEach, describe, expect, it } from 'vitest'
import { AuditLog } from '../ai/audit'
import { prepareDatabase } from '../db/migrate'
import { MCP_ACCESS_KEY, MCP_SCOPE_KEY } from '../mcp'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { MCP_REMOTE_KEY, RemoteExecutor, remoteLog } from './executor'
import type { RelayCall } from './protocol'

let db: SqlDriver
let repo: NotesRepo
let audit: AuditLog
let exec: RemoteExecutor

const setKv = (key: string, value: string) =>
  db.execute(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  )

const call = (tool: string, args: Record<string, unknown> = {}): RelayCall => ({
  type: 'call',
  id: crypto.randomUUID(),
  client: { id: 'client-1', name: 'Claude' },
  tool,
  args,
})

const text = (r: { content: { text: string }[] }) => r.content.map((c) => c.text).join('\n')

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  repo = new NotesRepo(db)
  audit = new AuditLog(db, repo)
  exec = new RemoteExecutor(db, repo, audit, { now: () => 1000 })
  await setKv(MCP_REMOTE_KEY, '1')
})

describe('RemoteExecutor', () => {
  it('reads notes when Remote access is on', async () => {
    const n = await repo.createNote({ content: '# Trip\n\nTickets to Lisbon' })
    const found = await exec.run(call('search_notes', { query: 'Lisbon' }))
    expect(found.isError).toBeUndefined()
    expect(text(found)).toContain('Trip')
    const got = await exec.run(call('get_note', { id: n.id }))
    expect(text(got)).toContain('Tickets to Lisbon')
  })

  it('refuses everything while Remote access is off', async () => {
    await setKv(MCP_REMOTE_KEY, '0')
    const r = await exec.run(call('list_recent'))
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('Remote access is turned off')
  })

  it('follows the local MCP access level', async () => {
    await setKv(MCP_ACCESS_KEY, 'off')
    const r = await exec.run(call('list_folders'))
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('turned off')
  })

  it('stays read-only even when local apps may write and delete', async () => {
    await setKv(MCP_ACCESS_KEY, 'full')
    const n = await repo.createNote({ content: '# Keep\n\nme' })
    for (const [tool, args] of [
      ['create_note', { content: '# New' }],
      ['append_to_note', { id: n.id, content: 'more' }],
      ['update_note', { id: n.id, content: '# Gone' }],
      ['delete_note', { id: n.id }],
      ['daily_note', { append: 'hello' }],
    ] as const) {
      const r = await exec.run(call(tool, args))
      expect(r.isError, tool).toBe(true)
      expect(text(r)).toContain('can only read')
    }
    expect((await repo.getNote(n.id))?.content).toBe('# Keep\n\nme')
    expect((await repo.listNotes({ limit: 10 })).items).toHaveLength(1)
    expect(await audit.list()).toEqual([])
  })

  it('answers unknown tools with an error, not a crash', async () => {
    const r = await exec.run(call('drop_database'))
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('no tool named drop_database')
  })

  it('keeps notes outside the scope invisible', async () => {
    const work = await repo.createFolder('Work', null)
    const home = await repo.createFolder('Home', null)
    const visible = await repo.createNote({
      content: '# Plan\n\nquarterly plan',
      folderId: work.id,
    })
    const hidden = await repo.createNote({
      content: '# Diary\n\nquarterly secret',
      folderId: home.id,
    })
    await setKv(MCP_SCOPE_KEY, JSON.stringify({ folders: [work.id], notes: [] }))

    const found = text(await exec.run(call('search_notes', { query: 'quarterly' })))
    expect(found).toContain('Plan')
    expect(found).not.toContain('Diary')
    const denied = await exec.run(call('get_note', { id: hidden.id }))
    expect(denied.isError).toBe(true)
    // Same answer as a note that does not exist.
    expect(text(denied)).toBe(`No note with id ${hidden.id}.`)
    expect(text(await exec.run(call('get_note', { id: visible.id })))).toContain('quarterly plan')
    const folders = text(await exec.run(call('list_folders')))
    expect(folders).toContain('Work')
    expect(folders).not.toContain('Home')
    const daily = await exec.run(call('daily_note'))
    expect(daily.isError).toBe(true)
  })

  it('logs each call without its arguments or answer', async () => {
    await repo.createNote({ content: '# Secret\n\nbank pin' })
    await exec.run(call('search_notes', { query: 'bank' }))
    await exec.run(call('create_note', { content: 'x' }))
    const log = await remoteLog(db)
    expect(log).toEqual([
      { at: 1000, client: 'Claude', tool: 'create_note', ok: false },
      { at: 1000, client: 'Claude', tool: 'search_notes', ok: true },
    ])
    expect(JSON.stringify(log)).not.toContain('bank')
  })
})
