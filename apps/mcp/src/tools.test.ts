import { AuditLog, NotesRepo, prepareDatabase, type SqlDriver } from '@fixnote/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultDatabasePath } from './paths'
import { openNodeSqlite } from './sqlite'
import { ACCESS_KEY, NotesTools } from './tools'

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
    expect(got).toContain('tags: #bot')
    expect(got).toContain('команды /today')
    expect(await tools.recent(5)).toContain('Рецепт борща')
    expect(await tools.folders()).toBe('(no folder): 1 notes\nРабота: 1 notes')
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
    await expect(tools.create('x', 'Нет такой')).rejects.toThrow('No folder named')
    await setAccess('off')
    await expect(tools.search('x')).rejects.toThrow('turned off')
  })

  it('knows where the desktop app keeps the database', () => {
    expect(defaultDatabasePath({ FIXNOTE_DB: '/tmp/x.db' })).toBe('/tmp/x.db')
    expect(defaultDatabasePath({ XDG_DATA_HOME: '/data' })).toMatch(
      /space\.fixnote\.app[\\/]fixnote\.db$/,
    )
  })
})
