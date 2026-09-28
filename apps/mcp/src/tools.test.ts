import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuditLog, NotesRepo, prepareDatabase, type SqlDriver } from '@fixnote/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { blobFileName, fileBlobStore } from './blobs'
import { defaultDatabasePath } from './paths'
import { openNodeSqlite } from './sqlite'
import { ACCESS_KEY, NotesTools, SCOPE_KEY } from './tools'

let db: SqlDriver
let tools: NotesTools
let dir: string

const setAccess = (v: string) =>
  db.execute(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [ACCESS_KEY, v],
  )

beforeEach(async () => {
  db = openNodeSqlite(':memory:')
  await prepareDatabase(db)
  dir = mkdtempSync(join(tmpdir(), 'fixnote-mcp-'))
  tools = new NotesTools(db, () => 'Claude', fileBlobStore(join(dir, 'blobs')))
})

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

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

  it('attaches files to notes and opens them, within the access and scope', async () => {
    const repo = new NotesRepo(db)
    const work = await repo.createFolder('Работа')
    const personal = await repo.createFolder('Личное')
    const n = await repo.createNote({ content: '# План', folderId: work.id })
    const hidden = await repo.createNote({ content: '# Дневник', folderId: personal.id })

    // Reading is allowed by default, attaching is not.
    await expect(
      tools.attach(n.id, { data: PNG.toString('base64'), name: 'a.png' }),
    ).rejects.toThrow('allows reading only')
    await setAccess('write')

    const img = join(dir, 'схема.png')
    writeFileSync(img, PNG)
    expect(await tools.attach(n.id, { path: img })).toBe('Attached схема.png (68 B) to "План".')
    expect(
      await tools.attach(n.id, {
        data: Buffer.from('итоги: всё ок').toString('base64'),
        name: 'notes [v2].txt',
      }),
    ).toMatch(/^Attached notes \[v2\]\.txt/)
    await expect(tools.attach(n.id, { path: 'relative.png' })).rejects.toThrow('full path')
    await expect(tools.attach(n.id, { data: 'eA==' })).rejects.toThrow('name')

    const note = await repo.getNote(n.id)
    const [imageId, fileId] = [...(note?.content ?? '').matchAll(/attachment:([\w-]+)/g)].map(
      (m) => m[1] as string,
    )
    expect(note?.content).toBe(
      `# План\n\n![схема.png](attachment:${imageId})\n\n[notes \\[v2\\].txt](attachment:${fileId} "23 B")`,
    )
    // Stored where the desktop app looks for them, and waiting for the app to upload them.
    expect(readdirSync(join(dir, 'blobs')).sort()).toEqual(
      [blobFileName(`att/${imageId}`), blobFileName(`att/${fileId}`)].sort(),
    )
    const [row] = await db.query<{ n: number }>(
      'SELECT count(*) AS n FROM attachments WHERE uploaded = 0',
    )
    expect(Number(row?.n)).toBe(2)

    const listed = await tools.get(n.id)
    expect(listed).toContain(`- image, image/png, 68 B (id: ${imageId})`)
    expect(listed).toContain(`- notes [v2].txt, text/plain, 23 B (id: ${fileId})`)

    const image = await tools.getAttachment(imageId ?? '')
    expect(image[1]).toEqual({ type: 'image', mimeType: 'image/png', data: PNG.toString('base64') })
    const text = await tools.getAttachment(fileId ?? '')
    expect(text[1]).toEqual({ type: 'text', text: 'итоги: всё ок' })

    // Every change is in the activity log and can be undone.
    const [last] = await new AuditLog(db, repo).list()
    expect(last?.summary).toBe('Attached notes [v2].txt to "План"')

    // Outside the scope an attachment does not exist.
    await tools.attach(hidden.id, { path: img })
    const hiddenId = (await repo.getNote(hidden.id))?.content.match(/attachment:([\w-]+)/)?.[1]
    await db.execute('INSERT INTO kv (key, value) VALUES (?, ?)', [
      SCOPE_KEY,
      JSON.stringify({ folders: [work.id], notes: [] }),
    ])
    await expect(tools.getAttachment(hiddenId ?? '')).rejects.toThrow('No attachment with id')
    await expect(tools.getAttachment('../../etc/passwd')).rejects.toThrow('No attachment with id')
    expect(await tools.getAttachment(imageId ?? '')).toHaveLength(2)
  })

  it('says when a file is not on this computer yet', async () => {
    const repo = new NotesRepo(db)
    const n = await repo.createNote({ content: '# Скан\n\n![](attachment:abc-123)' })
    expect(await tools.get(n.id)).toContain('- image (id: abc-123), not on this computer yet')
    await expect(tools.getAttachment('abc-123')).rejects.toThrow('not on this computer yet')
  })

  it('names attachment files like the desktop app', () => {
    expect(blobFileName('att/5f0c-1e9a')).toBe('att_5f0c-1e9a')
    expect(blobFileName('../x')).toBe('_x')
  })

  it('knows where the desktop app keeps the database', () => {
    expect(defaultDatabasePath({ FIXNOTE_DB: '/tmp/x.db' })).toBe('/tmp/x.db')
    expect(defaultDatabasePath({ XDG_DATA_HOME: '/data' })).toMatch(
      /space\.fixnote\.app[\\/]fixnote\.db$/,
    )
  })
})
