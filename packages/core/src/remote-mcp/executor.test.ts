import { beforeEach, describe, expect, it } from 'vitest'
import { AuditLog } from '../ai/audit'
import { prepareDatabase } from '../db/migrate'
import { MCP_ACCESS_KEY, MCP_SCOPE_KEY } from '../mcp'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import {
  CHANGE_LIMIT,
  CHANGE_WINDOW_MS,
  MCP_REMOTE_KEY,
  RemoteExecutor,
  remoteLog,
} from './executor'
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

const call = (
  tool: string,
  args: Record<string, unknown> = {},
  scope: RelayCall['scope'] = null,
): RelayCall => ({
  type: 'call',
  id: crypto.randomUUID(),
  client: { id: 'client-1', name: 'Claude' },
  tool,
  args,
  scope,
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

  it('only reads while the local access level is reading', async () => {
    const n = await repo.createNote({ content: '# Keep\n\nme' })
    for (const [tool, args] of [
      ['create_note', { content: '# New' }],
      ['create_folder', { name: 'New' }],
      ['append_to_note', { id: n.id, content: 'more' }],
      ['edit_note', { id: n.id, find: 'me', replace: 'you' }],
      ['update_note', { id: n.id, content: '# Gone' }],
      ['move_note', { id: n.id }],
      ['daily_note', { append: 'hello' }],
    ] as const) {
      const r = await exec.run(call(tool, args))
      expect(r.isError, tool).toBe(true)
      expect(text(r)).toContain('Read and write')
    }
    expect((await repo.getNote(n.id))?.content).toBe('# Keep\n\nme')
    expect((await repo.listNotes({ limit: 10 })).items).toHaveLength(1)
    expect(await audit.list()).toEqual([])
  })

  it('creates and changes notes when local apps may write, logged for undo', async () => {
    await setKv(MCP_ACCESS_KEY, 'write')
    const changed: string[] = []
    const watched = new RemoteExecutor(db, repo, audit, {
      onChange: (a) => changed.push(a.kind),
    })
    const created = await watched.run(call('create_note', { content: '# Groceries\n\nmilk' }))
    expect(created.isError).toBeUndefined()
    const id = /id: ([\w-]+)/.exec(text(created))?.[1] ?? ''
    await watched.run(call('append_to_note', { id, content: 'bread' }))
    await watched.run(call('edit_note', { id, find: 'milk', replace: 'oat milk' }))
    expect((await repo.getNote(id))?.content).toBe('# Groceries\n\noat milk\n\nbread')
    const folder = await repo.createFolder('Home', null)
    await watched.run(call('move_note', { id, folder: 'Home' }))
    expect((await repo.getNote(id))?.folderId).toBe(folder.id)
    await watched.run(call('update_note', { id, content: '# Groceries\n\neggs' }))
    const made = await watched.run(call('create_folder', { name: 'Shopping', parent: 'Home' }))
    expect(made.isError).toBeUndefined()
    const shopping = (await repo.listFolders()).find((f) => f.name === 'Shopping')
    expect(shopping?.parentId).toBe(folder.id)
    expect((await repo.getNote(id))?.content).toBe('# Groceries\n\neggs')
    expect(changed).toEqual([
      'mcp.create',
      'mcp.append',
      'mcp.update',
      'mcp.move',
      'mcp.update',
      'mcp.folder',
    ])
    const log = await audit.list()
    expect(log).toHaveLength(6)
    expect(log.every((a) => a.provider === 'Claude (remote MCP)')).toBe(true)
    // Through NotesRepo: marked for sync like any other change.
    const [row] = await db.query<{ dirty: number }>('SELECT dirty FROM notes WHERE id = ?', [id])
    expect(row?.dirty).toBe(1)
  })

  it('never deletes or renames, even with full access', async () => {
    await setKv(MCP_ACCESS_KEY, 'full')
    const n = await repo.createNote({ content: '# Keep\n\nme' })
    const f = await repo.createFolder('Work', null)
    for (const [tool, args, message] of [
      ['delete_note', { id: n.id }, 'cannot delete'],
      ['delete_folder', { folder: f.id }, 'cannot delete'],
      ['rename_folder', { folder: f.id, name: 'Play' }, 'cannot do this'],
    ] as const) {
      const r = await exec.run(call(tool, args))
      expect(r.isError, tool).toBe(true)
      expect(text(r)).toContain(message)
    }
    expect(await repo.getNote(n.id)).not.toBeNull()
    expect((await repo.listFolders()).map((x) => x.name)).toEqual(['Work'])
    expect(await audit.list()).toEqual([])
  })

  it('writes only inside the scope', async () => {
    await setKv(MCP_ACCESS_KEY, 'write')
    const work = await repo.createFolder('Work', null)
    const home = await repo.createFolder('Home', null)
    const diary = await repo.createNote({ content: '# Diary\n\nsecret', folderId: home.id })
    const scope = { folders: [work.id], notes: [] }
    const hidden = await exec.run(call('append_to_note', { id: diary.id, content: 'x' }, scope))
    expect(text(hidden)).toBe(`No note with id ${diary.id}.`)
    expect((await exec.run(call('create_note', { content: '# Loose' }, scope))).isError).toBe(true)
    const made = await exec.run(call('create_note', { content: '# Plan', folder: 'Work' }, scope))
    expect(made.isError).toBeUndefined()
    const id = /id: ([\w-]+)/.exec(text(made))?.[1] ?? ''
    expect((await exec.run(call('move_note', { id, folder: 'Home' }, scope))).isError).toBe(true)
    expect((await repo.getNote(id))?.folderId).toBe(work.id)
    // A new folder only inside a visible one.
    expect((await exec.run(call('create_folder', { name: 'Top' }, scope))).isError).toBe(true)
    expect(
      (await exec.run(call('create_folder', { name: 'Top', parent: 'Home' }, scope))).isError,
    ).toBe(true)
    expect(
      (await exec.run(call('create_folder', { name: 'Q3', parent: 'Work' }, scope))).isError,
    ).toBeUndefined()
    expect((await repo.getNote(diary.id))?.content).toBe('# Diary\n\nsecret')
  })

  it('takes a limited number of changes in a short time, reads go on', async () => {
    await setKv(MCP_ACCESS_KEY, 'write')
    let now = 1000
    const paced = new RemoteExecutor(db, repo, audit, { now: () => now })
    for (let i = 0; i < CHANGE_LIMIT; i++) {
      expect((await paced.run(call('create_note', { content: `# Note ${i}` }))).isError).toBe(
        undefined,
      )
    }
    // Refused changes do not count.
    expect((await paced.run(call('create_note', { content: '' }))).isError).toBe(true)
    const refused = await paced.run(call('create_note', { content: '# One more' }))
    expect(text(refused)).toContain('Too many changes')
    expect((await paced.run(call('list_recent'))).isError).toBeUndefined()
    now += CHANGE_WINDOW_MS
    expect((await paced.run(call('create_note', { content: '# Later' }))).isError).toBe(undefined)
    expect((await repo.listNotes({ limit: 50 })).items).toHaveLength(CHANGE_LIMIT + 1)
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

  it('narrows to the account scope from the relay, never past the device scope', async () => {
    const work = await repo.createFolder('Work', null)
    const home = await repo.createFolder('Home', null)
    const plan = await repo.createNote({ content: '# Plan\n\nshared word', folderId: work.id })
    const diary = await repo.createNote({ content: '# Diary\n\nshared word', folderId: home.id })
    const loose = await repo.createNote({ content: '# Loose\n\nshared word' })
    const onlyWork = { folders: [work.id], notes: [] }
    let found = text(await exec.run(call('search_notes', { query: 'shared' }, onlyWork)))
    expect(found).toContain('Plan')
    expect(found).not.toContain('Diary')
    expect(found).not.toContain('Loose')
    // The device allows Home and one loose note; the relay allows Work and that note: only the note.
    await setKv(MCP_SCOPE_KEY, JSON.stringify({ folders: [home.id], notes: [loose.id] }))
    found = text(
      await exec.run(
        call('search_notes', { query: 'shared' }, { folders: [work.id], notes: [loose.id] }),
      ),
    )
    expect(found).toContain('Loose')
    expect(found).not.toContain('Plan')
    expect(found).not.toContain('Diary')
    expect((await exec.run(call('get_note', { id: diary.id }, onlyWork))).isError).toBe(true)
    expect((await exec.run(call('get_note', { id: plan.id }, onlyWork))).isError).toBe(true)
  })

  it('tells when a call starts and ends, for the indicator', async () => {
    const seen: string[] = []
    const watched = new RemoteExecutor(db, repo, audit, {
      onStart: (a) => seen.push(`start ${a.client} ${a.tool}`),
      onCall: (e, a) => seen.push(`end ${a.tool} ${e.ok}`),
    })
    await watched.run(call('list_folders'))
    await watched.run(call('delete_note', { id: 'x' }))
    expect(seen).toEqual([
      'start Claude list_folders',
      'end list_folders true',
      'end delete_note false',
    ])
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
