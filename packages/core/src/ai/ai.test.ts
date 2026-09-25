import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { FakeEmbedder } from '../testing/fake-embedder'
import { createMemoryDriver } from '../testing/memory-driver'
import { chunkNote, contentHash } from './chunk'
import { Indexer } from './indexer'
import { keywordQuery, retrieve, similarNotes } from './retrieve'

let db: SqlDriver
let repo: NotesRepo
let embedder: FakeEmbedder
let indexer: Indexer
let clock: number

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  clock = 1_000_000
  repo = new NotesRepo(db, { now: () => clock++ })
  embedder = new FakeEmbedder()
  indexer = new Indexer(db, embedder)
  await indexer.prepare()
})

describe('chunkNote', () => {
  it('packs short blocks and splits long ones, as plain text', () => {
    const md = `# Plan\n\n- [ ] **one**\n\n${'Long sentence here. '.repeat(120)}`
    const chunks = chunkNote(md)
    expect(chunks[0]?.text.startsWith('Plan\none')).toBe(true)
    expect(chunks.every((c) => c.text.length <= 1200)).toBe(true)
    expect(chunks.map((c) => c.ord)).toEqual(chunks.map((_, i) => i))
    expect(chunkNote('')).toEqual([])
  })

  it('hashes content stably', () => {
    expect(contentHash('abc')).toBe(contentHash('abc'))
    expect(contentHash('abc')).not.toBe(contentHash('abd'))
  })
})

describe('Indexer', () => {
  it('embeds stale notes once and again only after a content change', async () => {
    const n = await repo.createNote({ content: 'CSS tokens\n\nuse oklch' })
    expect(await indexer.pendingCount()).toBe(1)
    expect(await indexer.indexSome()).toBe(0)
    expect(embedder.calls).toBe(1)
    expect((await indexer.all()).get(n.id)?.length).toBe(1)

    const f = await repo.createFolder('F')
    await repo.moveNote(n.id, f.id) // metadata only: no new embedding
    await indexer.indexSome()
    expect(embedder.calls).toBe(1)

    await repo.updateContent(n.id, 'CSS tokens\n\nuse oklch everywhere')
    await indexer.indexSome()
    expect(embedder.calls).toBe(2)
  })

  it('reindexes everything when the model changes', async () => {
    await repo.createNote({ content: 'borsch recipe' })
    await indexer.indexSome()
    const next = new Indexer(db, new FakeEmbedder('fake-v2'))
    await next.prepare()
    expect(await next.pendingCount()).toBe(1)
  })
})

describe('keywordQuery', () => {
  it('ORs content words, drops stopwords, stems long words', () => {
    expect(keywordQuery('что я писал про CSS в заметках')).toBe(
      '"писал"* OR "pisal"* OR "css"* OR "ксс"* OR "заметк"* OR "zametk"*',
    )
    expect(keywordQuery('и в на')).toBeNull()
  })

  it('stems common Russian, Spanish and English endings to a shared prefix', async () => {
    const { stem } = await import('./retrieve')
    expect(['токенами', 'токены', 'токен'].map(stem)).toEqual(['токен', 'токен', 'токен'])
    expect(['заметках', 'заметки', 'заметка'].map(stem)).toEqual(['заметк', 'заметк', 'заметк'])
    expect(stem('сделать')).toBe('сдела')
    expect(['canciones', 'notes', 'budget'].map(stem)).toEqual(['canc', 'note', 'budget'])
  })

  it('finds a word written in the other script', async () => {
    await repo.createNote({ content: 'Бот в Telegram для заметок' })
    expect((await retrieve(db, null, 'что с телеграмом?', { kind: 'all' })).length).toBe(1)
    expect((await repo.search('телеграм')).length).toBe(1)
  })

  it('uses extra keywords from query expansion for recall', async () => {
    await repo.createNote({ content: 'Giveaway в канале\n\nПриз — наушники' })
    expect(await retrieve(db, null, 'какие были розыгрыши?', { kind: 'all' })).toEqual([])
    const hits = await retrieve(
      db,
      null,
      'какие были розыгрыши?',
      { kind: 'all' },
      {
        extraKeywords: ['giveaway', 'raffle'],
      },
    )
    expect(hits.map((h) => h.title)).toEqual(['Giveaway в канале'])
  })

  it('finds an inflected word in a note', async () => {
    await repo.createNote({ content: 'Дизайн-система\n\nОбновить токены oklch' })
    const hits = await retrieve(db, null, 'что нужно сделать с токенами?', { kind: 'all' })
    expect(hits.map((h) => h.title)).toEqual(['Дизайн-система'])
  })
})

describe('retrieve', () => {
  it('finds by keyword without any embeddings, across word forms', async () => {
    await repo.createNote({ content: 'Список заметки про отпуск' })
    await repo.createNote({ content: 'Other topic' })
    const hits = await retrieve(db, null, 'где мои заметках об отпуске', { kind: 'all' })
    expect(hits.map((h) => h.title)).toEqual(['Список заметки про отпуск'])
    expect(hits[0]?.via).toEqual({ keyword: true, semantic: false })
  })

  it('finds by meaning when no word matches', async () => {
    await repo.createNote({ content: 'Design system\n\nupdated the oklch palette' })
    await repo.createNote({ content: 'Бюджет на месяц' })
    await indexer.indexSome()
    const hits = await retrieve(db, indexer, 'какие стили я поменял', { kind: 'all' })
    expect(hits[0]?.title).toBe('Design system')
    expect(hits[0]?.via.semantic).toBe(true)
  })

  it('lists notes similar in meaning, one per note, skipping excluded and deleted ones', async () => {
    const a = await repo.createNote({ content: 'Design system\n\nupdated the oklch palette' })
    const b = await repo.createNote({ content: 'CSS cleanup\n\nstyles' })
    const c = await repo.createNote({ content: 'Стили для блога' })
    await repo.createNote({ content: 'Бюджет на месяц' })
    await indexer.indexSome()
    await repo.deleteNote(c.id)
    const hits = await similarNotes(db, indexer, 'оформление', { exclude: new Set([b.id]) })
    expect(hits.map((h) => h.noteId)).toEqual([a.id])
  })

  it('ranks passages found both ways first and respects folder scope', async () => {
    const work = await repo.createFolder('Work')
    const sub = await repo.createFolder('UI', work.id)
    await repo.createNote({ content: 'CSS colors cleanup', folderId: sub.id })
    await repo.createNote({ content: 'Palette oklch notes', folderId: work.id })
    await repo.createNote({ content: 'CSS at home', folderId: null })
    await indexer.indexSome()
    const all = await retrieve(db, indexer, 'css colors', { kind: 'all' })
    expect(all[0]?.title).toBe('CSS colors cleanup')
    expect(all[0]?.via).toEqual({ keyword: true, semantic: true })
    const scoped = await retrieve(db, indexer, 'css colors', {
      kind: 'folder',
      id: work.id,
      name: 'Work',
    })
    expect(scoped.map((h) => h.title).sort()).toEqual(['CSS colors cleanup', 'Palette oklch notes'])
  })

  it('uses the whole note in note scope and skips deleted notes', async () => {
    const n = await repo.createNote({ content: `Intro\n\n${'x'.repeat(900)}\n\nOutro` })
    const hits = await retrieve(db, indexer, 'anything', { kind: 'note', id: n.id, title: n.title })
    expect(hits.length).toBe(2)
    await repo.deleteNote(n.id)
    expect(await retrieve(db, indexer, 'intro', { kind: 'all' })).toEqual([])
  })

  it('falls back to keywords when the embedder fails', async () => {
    await repo.createNote({ content: 'Flight to Madrid' })
    embedder.fail = true
    const hits = await retrieve(db, indexer, 'flight madrid', { kind: 'all' })
    expect(hits.map((h) => h.title)).toEqual(['Flight to Madrid'])
  })
})

describe('ChatRepo', () => {
  it('stores the thread with scopes, citations and status', async () => {
    const { ChatRepo } = await import('./chat')
    let t = 1
    const chat = new ChatRepo(db, () => t++)
    await chat.add({ kind: 'user', content: 'q1', scope: { kind: 'all' } })
    await chat.add({
      kind: 'divider',
      content: '',
      scope: { kind: 'folder', id: 'f', name: 'Work' },
    })
    const a = await chat.add({
      kind: 'assistant',
      content: '',
      scope: { kind: 'all' },
      status: 'streaming',
    })
    await chat.finish(a.id, {
      content: 'answer [1]',
      status: 'done',
      citations: [{ n: 1, noteId: 'n', title: 'T', quote: 'q' }],
      confidence: 'high',
    })
    const all = await chat.recent()
    expect(all.map((m) => m.kind)).toEqual(['user', 'divider', 'assistant'])
    expect(all[1]?.scope).toEqual({ kind: 'folder', id: 'f', name: 'Work' })
    expect(all[2]).toMatchObject({ content: 'answer [1]', status: 'done', confidence: 'high' })
    expect(all[2]?.citations[0]?.noteId).toBe('n')
    expect((await chat.recent(1)).map((m) => m.kind)).toEqual(['assistant'])
    await chat.clear()
    expect(await chat.recent()).toEqual([])
  })
})
