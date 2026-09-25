import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import { MIGRATIONS } from '../db/schema'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { NotesRepo } from './repo'
import { MARK_END, MARK_START } from './types'

let db: SqlDriver
let repo: NotesRepo
let clock: number
let seq: number

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  clock = 1_000
  seq = 0
  repo = new NotesRepo(db, {
    now: () => clock++,
    newId: () => `id-${String(++seq).padStart(4, '0')}`,
  })
})

describe('migrations', () => {
  it('are applied once and recorded in user_version', async () => {
    const [row] = await db.query<{ user_version: number }>('PRAGMA user_version')
    expect(row?.user_version).toBe(MIGRATIONS.length)
    expect(await prepareDatabase(db)).toEqual({ from: MIGRATIONS.length, to: MIGRATIONS.length })
  })

  it('refuse a database from a newer app version', async () => {
    await db.execute(`PRAGMA user_version = ${MIGRATIONS.length + 1}`)
    await expect(prepareDatabase(db)).rejects.toThrow(/newer than this app/)
  })
})

describe('notes', () => {
  it('derives title, excerpt, tags and tasks', async () => {
    const note = await repo.createNote({
      content:
        '# Wednesday\n\n- [x] contrast #design\n- [ ] tests #dev/cli\n\nSpent the morning in CSS',
    })
    expect(note).toMatchObject({
      title: 'Wednesday',
      folderId: null,
      type: 'text',
      tags: ['design', 'dev/cli'],
      tasks: { done: 1, total: 2 },
    })
    expect(note.excerpt).toContain('Spent the morning in CSS')
  })

  it('updates content, title and tags, and skips no-op saves', async () => {
    const note = await repo.createNote({ content: 'Draft #a' })
    const edited = await repo.updateContent(note.id, 'Final title\n#b')
    expect(edited.title).toBe('Final title')
    expect(edited.tags).toEqual(['b'])
    expect(edited.updatedAt).toBeGreaterThan(note.updatedAt)
    const same = await repo.updateContent(note.id, 'Final title\n#b')
    expect(same.updatedAt).toBe(edited.updatedAt)
    expect(await repo.listTags()).toEqual([{ name: 'b', count: 1 }])
  })

  it('soft-deletes and restores', async () => {
    const note = await repo.createNote({ content: 'gone #x' })
    await repo.deleteNote(note.id)
    expect(await repo.getNote(note.id)).toBeNull()
    expect((await repo.listNotes()).items).toHaveLength(0)
    expect(await repo.listTags()).toEqual([])
    expect(await repo.search('gone')).toEqual([])
    await repo.restoreNote(note.id)
    expect((await repo.getNote(note.id))?.title).toBe('gone #x')
  })
})

describe('listNotes', () => {
  it('pages newest first without gaps or duplicates', async () => {
    for (let i = 0; i < 7; i++) await repo.createNote({ content: `note ${i}` })
    const seen: string[] = []
    let cursor = null
    do {
      const page = await repo.listNotes({ cursor, limit: 3 })
      seen.push(...page.items.map((n) => n.title))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(['note 6', 'note 5', 'note 4', 'note 3', 'note 2', 'note 1', 'note 0'])
  })

  it('filters by inbox, folder, type, tag with children, and date', async () => {
    const folder = await repo.createFolder('Work')
    await repo.createNote({ content: 'inbox #work' })
    const t = clock
    await repo.createNote({ content: 'filed #work/fixnote', folderId: folder.id })
    await repo.getOrCreateDaily('2026-09-25', () => '# Daily')
    const titles = async (filter: object) =>
      (await repo.listNotes({ filter })).items.map((n) => n.title).sort()

    expect(await titles({ scope: 'inbox' })).toEqual(['Daily', 'inbox #work'])
    expect(await titles({ folderId: folder.id })).toEqual(['filed #work/fixnote'])
    expect(await titles({ type: 'daily' })).toEqual(['Daily'])
    expect(await titles({ tag: 'WORK' })).toEqual(['filed #work/fixnote', 'inbox #work'])
    expect(await titles({ tag: 'work/fixnote' })).toEqual(['filed #work/fixnote'])
    expect(await titles({ updatedSince: t })).toEqual(['Daily', 'filed #work/fixnote'])
    expect(await repo.counts()).toEqual({ all: 3, inbox: 2, daily: 1 })
  })
})

describe('search', () => {
  it('matches word prefixes across ru/es/en, ignoring case and accents', async () => {
    await repo.createNote({ content: 'Контраст в дизайн-системе\nПроверить токены' })
    await repo.createNote({ content: 'Canción de la mañana' })
    await repo.createNote({ content: 'Oklch colour space' })

    expect((await repo.search('контр')).map((h) => h.note.title)).toEqual([
      'Контраст в дизайн-системе',
    ])
    expect((await repo.search('cancion manana')).map((h) => h.note.title)).toEqual([
      'Canción de la mañana',
    ])
    expect(await repo.search('   "*  ')).toEqual([])
    const [hit] = await repo.search('токен')
    expect(hit?.snippet).toContain(`${MARK_START}токены${MARK_END}`)
  })

  it('ranks title matches above body matches', async () => {
    await repo.createNote({ content: 'Groceries\nremember the oklch talk' })
    await repo.createNote({ content: 'Oklch notes\nperceptual lightness' })
    expect((await repo.search('oklch'))[0]?.note.title).toBe('Oklch notes')
  })

  it('indexes plain text, so snippets carry no Markdown syntax', async () => {
    await repo.createNote({ content: '# Plan\n\n## Tasks\n\n- [x] **update** tokens' })
    const [hit] = await repo.search('tokens')
    expect(hit?.snippet).toBe(`Plan\nTasks\nupdate ${MARK_START}tokens${MARK_END}`)
    expect(await repo.search('x')).toEqual([])
  })

  it('treats FTS syntax in user input as plain words', async () => {
    await repo.createNote({ content: 'NEAR OR AND NOT' })
    expect(await repo.search('NEAR( OR "')).toHaveLength(1)
  })
})

describe('daily notes', () => {
  it('creates one note per date from the template', async () => {
    const [a, b] = await Promise.all([
      repo.getOrCreateDaily('2026-04-30', () => '# Wednesday, April 30'),
      repo.getOrCreateDaily('2026-04-30', () => '# Wednesday, April 30'),
    ])
    expect(a?.id).toBe(b?.id)
    expect(a).toMatchObject({ type: 'daily', dailyDate: '2026-04-30' })
  })
})

describe('folders', () => {
  it('lists with counts and renames', async () => {
    const f = await repo.createFolder('  Books ')
    await repo.createNote({ content: 'Story', folderId: f.id })
    await repo.renameFolder(f.id, 'Reading')
    expect(await repo.listFolders()).toEqual([
      { id: f.id, parentId: null, name: 'Reading', sort: 1, noteCount: 1 },
    ])
  })

  it('moves notes of a deleted subtree back to the inbox', async () => {
    const parent = await repo.createFolder('Research')
    const child = await repo.createFolder('Cars', parent.id)
    const note = await repo.createNote({ content: 'engines', folderId: child.id })
    await repo.deleteFolder(parent.id)
    expect(await repo.listFolders()).toEqual([])
    expect((await repo.getNote(note.id))?.folderId).toBeNull()
  })

  it('moves a note between folders', async () => {
    const f = await repo.createFolder('Log')
    const note = await repo.createNote({ content: 'x' })
    await repo.moveNote(note.id, f.id)
    expect((await repo.getNote(note.id))?.folderId).toBe(f.id)
  })
})

describe('driver', () => {
  it('rolls back a failed transaction and keeps working', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          "INSERT INTO folders (id, name, created_at, updated_at) VALUES ('f', 'x', 1, 1)",
        )
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await db.query("SELECT id FROM folders WHERE id = 'f'")).toEqual([])
    expect(await repo.listFolders()).toEqual([])
  })
})
