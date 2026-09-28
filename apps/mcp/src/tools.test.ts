import { AuditLog, NotesRepo, prepareDatabase, type SqlDriver } from '@fixnote/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultDatabasePath } from './paths'
import { openNodeSqlite } from './sqlite'
import { ACCESS_KEY, NotesTools, SCOPE_KEY } from './tools'

let db: SqlDriver
let tools: NotesTools

const setAccess = (v: string) =>
  db.execute(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [ACCESS_KEY, v],
  )

beforeEach(async () => {
  db = openNodeSqlite(':memory:')
  await prepareDatabase(db)
  tools = new NotesTools(db, () => 'Claude')
})

describe('NotesTools', () => {
  it('searches, reads and lists notes (read access by default)', async () => {
    const repo = new NotesRepo(db)
    const work = await repo.createFolder('Работа')
    const n = await repo.createNote({
      content: '# Бот в Telegram\n\nкоманды /today #bot',
      folderId: work.id,
    })
    await repo.createNote({ content: 'Рецепт борща' })
    expect(await tools.search('телеграм')).toContain(`Бот в Telegram (id: ${n.id}`)
    expect(await tools.search('кофе')).toBe('No notes match "кофе".')
    const got = await tools.get(n.id)
    expect(got).toContain('folder: Работа')
    expect(got).toContain('команды /today')
    expect(await tools.recent(5)).toContain('Рецепт борща')
    expect(await tools.folders()).toBe(`(no folder): 1 notes\nРабота (id: ${work.id}): 1 notes`)
  })

  it('writes only when the user allowed it, and logs writes for undo', async () => {
    await expect(tools.create('Идея')).rejects.toThrow('allows reading only')
    await setAccess('write')
    expect(await tools.create('# Идея\n\nбот для заметок')).toMatch(/^Saved "Идея" \(id: /)
    const [created] = (await new NotesRepo(db).listNotes()).items
    await tools.append(created?.id ?? '', 'ещё мысль')
    expect((await new NotesRepo(db).getNote(created?.id ?? ''))?.content).toBe(
      '# Идея\n\nбот для заметок\n\nещё мысль',
    )
    await tools.daily('2026-09-25', 'созвон в 15:00')
    expect(await tools.daily('2026-09-25')).toContain('созвон в 15:00')
    expect(await tools.daily('2026-09-24')).toBe('There is no daily note for 2026-09-24.')

    const log = await new AuditLog(db, new NotesRepo(db)).list()
    expect(log.map((a) => [a.kind, a.provider])).toEqual([
      ['mcp.append', 'Claude (MCP)'],
      ['mcp.append', 'Claude (MCP)'],
      ['mcp.create', 'Claude (MCP)'],
    ])
    // Undo the daily note (it was created by the append) and the creation.
    const audit = new AuditLog(db, new NotesRepo(db))
    expect(await audit.undo(log[0]?.id ?? '')).toEqual({ ok: true })
    expect(await tools.daily('2026-09-25')).toBe('There is no daily note for 2026-09-25.')
    expect(await audit.undo(log[2]?.id ?? '')).toEqual({ ok: false, reason: 'changed' })
  })

  it('stops everything when access is off, and finds folders by name only', async () => {
    await setAccess('write')
    await expect(tools.create('x', 'Нет такой')).rejects.toThrow('No folder "Нет такой"')
    await setAccess('off')
    await expect(tools.search('x')).rejects.toThrow('turned off')
  })

  it('changes and deletes notes and folders with the matching access, all undoable', async () => {
    const repo = new NotesRepo(db)
    const audit = new AuditLog(db, repo)
    const home = await repo.createFolder('Дом')
    const n = await repo.createNote({ content: '# Покупки\n\nмолоко', folderId: home.id })

    await setAccess('write')
    await tools.update(n.id, '# Покупки\n\nмолоко, хлеб')
    await tools.createFolder('Ремонт', 'дом')
    const repair = (await repo.listFolders()).find((f) => f.name === 'Ремонт')
    expect(repair?.parentId).toBe(home.id)
    await tools.move(n.id, 'Дом / Ремонт')
    expect((await repo.getNote(n.id))?.folderId).toBe(repair?.id)
    await tools.renameFolder('Ремонт', 'Ремонт кухни')
    await expect(tools.remove(n.id)).rejects.toThrow('does not let connected apps delete')
    await expect(tools.deleteFolder('Дом')).rejects.toThrow('does not let connected apps delete')

    await setAccess('full')
    expect(await tools.deleteFolder('Дом')).toContain(
      'and 1 folders inside it. Its 1 notes were kept',
    )
    expect(await repo.listFolders()).toEqual([])
    expect((await repo.getNote(n.id))?.folderId).toBeNull()

    // Undo the folder deletion: both folders come back and the note returns to its folder.
    const [deleted] = await audit.list()
    expect(deleted?.kind).toBe('mcp.folder')
    expect(await audit.undo(deleted?.id ?? '')).toEqual({ ok: true })
    expect((await repo.listFolders()).map((f) => f.name).sort()).toEqual(['Дом', 'Ремонт кухни'])
    expect((await repo.getNote(n.id))?.folderId).toBe(repair?.id)

    await tools.remove(n.id)
    expect(await repo.getNote(n.id)).toBeNull()
    const [removal] = await audit.list()
    expect(await audit.undo(removal?.id ?? '')).toEqual({ ok: true })
    expect((await repo.getNote(n.id))?.content).toBe('# Покупки\n\nмолоко, хлеб')

    // Undo the rename, then the creation of the folder.
    const log = await audit.list()
    const rename = log.find((a) => a.summary.startsWith('Renamed'))
    expect(await audit.undo(rename?.id ?? '')).toEqual({ ok: true })
    expect((await repo.listFolders()).map((f) => f.name).sort()).toEqual(['Дом', 'Ремонт'])
  })

  it('sees only the folders and notes the user shared, subfolders included', async () => {
    const repo = new NotesRepo(db)
    const work = await repo.createFolder('Работа')
    const sub = await repo.createFolder('Проекты', work.id)
    const personal = await repo.createFolder('Личное')
    const a = await repo.createNote({ content: 'бот задача', folderId: sub.id })
    const b = await repo.createNote({ content: 'бот дневник', folderId: personal.id })
    const c = await repo.createNote({ content: 'бот идея' })
    const shared = await repo.createNote({ content: 'бот список', folderId: personal.id })
    await db.execute('INSERT INTO kv (key, value) VALUES (?, ?)', [
      SCOPE_KEY,
      JSON.stringify({ folders: [work.id], notes: [shared.id] }),
    ])
    await setAccess('full')

    const found = await tools.search('бот')
    expect(found).toContain(a.id)
    expect(found).toContain(shared.id)
    expect(found).not.toContain(b.id)
    expect(found).not.toContain(c.id)
    await expect(tools.get(b.id)).rejects.toThrow(`No note with id ${b.id}`)
    await expect(tools.remove(c.id)).rejects.toThrow('No note with id')
    expect(await tools.folders()).not.toContain('Личное')
    expect(await tools.folders()).toContain('Работа / Проекты')
    await expect(tools.create('x')).rejects.toThrow('only use some folders')
    await expect(tools.create('x', 'Личное')).rejects.toThrow('No folder "Личное"')
    expect(await tools.create('в проекты', 'Проекты')).toMatch(/^Saved/)
    await expect(tools.createFolder('Новая')).rejects.toThrow('inside one of them')
    await expect(tools.daily()).rejects.toThrow('not shared')
    expect(await tools.recent()).not.toContain('дневник')
  })

  it('knows where the desktop app keeps the database', () => {
    expect(defaultDatabasePath({ FIXNOTE_DB: '/tmp/x.db' })).toBe('/tmp/x.db')
    expect(defaultDatabasePath({ XDG_DATA_HOME: '/data' })).toMatch(
      /space\.fixnote\.app[\\/]fixnote\.db$/,
    )
  })
})
