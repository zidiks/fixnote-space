import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { AuditLog } from './audit'
import {
  addTags,
  findDuplicates,
  mergeContents,
  needsTitle,
  suggestionsFromProposals,
  Tidy,
  type TidyLabels,
} from './tidy'

const labels: TidyLabels = {
  move: (f, n) => `move ${n} → ${f}`,
  tag: (t, n) => `tag ${n} ${t}`,
  title: (t) => `title ${t}`,
  merge: (a, b) => `merge ${a} + ${b}`,
}

describe('tidy helpers', () => {
  it('spots prose first lines', () => {
    expect(needsTitle('# Plan\n\ntext')).toBe(false)
    expect(needsTitle('Покупки\nмолоко')).toBe(false)
    expect(
      needsTitle('Партнёрства с детейлингом, студиями защитной плёнки, тюнинг-ателье и дилерами'),
    ).toBe(true)
    expect(needsTitle('Позвонить маме. Потом купить хлеб')).toBe(true)
  })

  it('adds tags to an existing tag line or a new one, without repeats', () => {
    expect(addTags('Text', ['идеи', 'bot'])).toBe('Text\n\n#идеи #bot')
    expect(addTags('Text\n\n#work', ['идеи', 'Work'])).toBe('Text\n\n#work #идеи')
    expect(addTags('Text #bot', ['bot'])).toBe('Text #bot')
  })

  it('keeps the longer note when two were edited at the same moment', () => {
    expect(
      findDuplicates([
        { id: 'long', title: 'A', content: 'A\nодин два три четыре', updatedAt: 5 },
        { id: 'short', title: 'A', content: 'A\nодин два три', updatedAt: 5 },
      ]),
    ).toEqual([['long', 'short']])
  })

  it('finds duplicates and merges without losing lines', () => {
    const pairs = findDuplicates([
      { id: 'old', title: 'Покупки', content: 'Покупки\nмолоко хлеб сыр', updatedAt: 1 },
      { id: 'new', title: 'Покупки', content: 'Покупки\nмолоко хлеб сыр кефир', updatedAt: 2 },
      { id: 'x', title: 'Другое', content: 'совсем другое про отпуск', updatedAt: 3 },
    ])
    expect(pairs).toEqual([['new', 'old']])
    expect(mergeContents('a\nb', 'b\nc\n\na')).toBe('a\nb\n\nc')
  })
})

describe('Tidy', () => {
  let db: SqlDriver
  let repo: NotesRepo
  let tidy: Tidy
  let audit: AuditLog

  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
    repo = new NotesRepo(db)
    audit = new AuditLog(db, repo)
    tidy = new Tidy(db, repo, audit)
  })

  it('picks candidates with refs and applies accepted suggestions, undoable', async () => {
    const work = await repo.createFolder('Работа')
    const a = await repo.createNote({ content: 'Бот в Telegram\nкоманды' })
    const b = await repo.createNote({
      content: 'Партнёрства с детейлингом, студиями защитной плёнки, тюнинг-ателье и дилерами',
    })
    await repo.createNote({ content: '# Готово\n\n#done', folderId: work.id })
    const c = await tidy.candidates()
    expect(c.notes.map((n) => [n.title.slice(0, 12), n.noFolder, n.needsTitle])).toEqual([
      ['Партнёрства ', true, true],
      ['Бот в Telegr', true, false],
    ])
    expect(c.folders).toEqual([{ ref: 1, id: work.id, name: 'Работа' }])

    const refA = c.notes.find((n) => n.id === a.id)?.ref ?? 0
    const refB = c.notes.find((n) => n.id === b.id)?.ref ?? 0
    const saved = await tidy.save(
      suggestionsFromProposals(c, [
        { kind: 'move', note: refA, folder: 1 },
        { kind: 'move', note: refB, newFolder: 'Партнёры' },
        { kind: 'tag', note: refA, tags: ['бот'] },
        { kind: 'title', note: refB, title: 'Партнёрства' },
      ]),
    )
    expect((await tidy.pending()).map((s) => s.kind)).toEqual(['move', 'move', 'tag', 'title'])

    for (const s of saved) await tidy.accept(s, 'test', labels)
    expect(await tidy.pendingCount()).toBe(0)
    const na = await repo.getNote(a.id)
    const nb = await repo.getNote(b.id)
    expect([na?.folderId, na?.content]).toEqual([work.id, 'Бот в Telegram\nкоманды\n\n#бот'])
    expect(nb?.content.startsWith('# Партнёрства\n\nПартнёрства с')).toBe(true)
    const partners = (await repo.listFolders()).find((f) => f.name === 'Партнёры')
    expect(nb?.folderId).toBe(partners?.id)

    const log = await audit.list()
    expect(log.map((x) => x.summary)).toEqual([
      'title Партнёрства',
      'tag Бот в Telegram #бот',
      'move Партнёрства с детейлингом, студиями защитной плёнки, тюнинг-ателье и дилерами → Партнёры',
      'move Бот в Telegram → Работа',
    ])
    // Undo the newest first, then the move of the same note.
    expect(await audit.undo(log[0]?.id ?? '')).toEqual({ ok: true })
    expect(await audit.undo(log[2]?.id ?? '')).toEqual({ ok: true })
    const back = await repo.getNote(b.id)
    expect([back?.folderId, back?.content.startsWith('Партнёрства с')]).toEqual([null, true])
  })

  it('suggests merging duplicates and remembers rejections', async () => {
    const old = await repo.createNote({ content: 'Покупки\nмолоко хлеб сыр' })
    const fresh = await repo.createNote({ content: 'Покупки\nмолоко хлеб сыр кефир' })
    const dup = await tidy.duplicateSuggestions()
    expect(dup).toMatchObject([{ kind: 'merge', noteId: fresh.id, otherId: old.id }])
    const [s] = await tidy.save(dup)
    if (!s) throw new Error('no suggestion')
    await tidy.accept(s, 'test', labels)
    expect(await repo.getNote(old.id)).toBeNull()
    expect((await repo.getNote(fresh.id))?.content).toBe(
      'Покупки\nмолоко хлеб сыр кефир\n\nмолоко хлеб сыр',
    )

    const n = await repo.createNote({ content: 'Бот\nx' })
    const c = await tidy.candidates()
    const [t] = await tidy.save(
      suggestionsFromProposals(c, [{ kind: 'tag', note: c.notes[0]?.ref ?? 0, tags: ['a'] }]),
    )
    if (!t) throw new Error('no suggestion')
    await tidy.reject(t.id)
    expect((await tidy.candidates()).notes.map((x) => x.id)).not.toContain(n.id)
  })
})
