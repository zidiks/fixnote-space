import { beforeEach, describe, expect, it } from 'vitest'
import { retrieve } from '../ai/retrieve'
import { prepareDatabase } from '../db/migrate'
import { forgetLocalNotes } from '../local-data'
import { NotesRepo } from '../notes/repo'
import type { BlobStore, SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { ImageTexts } from './image-text'

let db: SqlDriver
let repo: NotesRepo
let texts: ImageTexts

const image = (id: string, size = 50_000, mime = 'image/jpeg') =>
  db.execute('INSERT INTO attachments (id, mime, size, created_at) VALUES (?, ?, ?, ?)', [
    id,
    mime,
    size,
    Date.now(),
  ])

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  repo = new NotesRepo(db)
  texts = new ImageTexts(db)
})

describe('ImageTexts', () => {
  it('lists the images in notes that were not read yet', async () => {
    await image('receipt')
    await image('icon', 2_000)
    await image('logo', 50_000, 'image/svg+xml')
    await image('orphan')
    await repo.createNote({
      content: '# Trip\n\n![](attachment:receipt)\n![](attachment:icon)\n![](attachment:logo)',
    })
    expect(await texts.pending()).toEqual(['receipt'])
    await texts.set('receipt', '')
    expect(await texts.pending()).toEqual([])
    expect(await texts.get('receipt')).toBe('')
    expect(await texts.get('orphan')).toBeNull()
  })

  it('finds notes by the text of their images, after the notes that say it in words', async () => {
    await image('board')
    const pictured = await repo.createNote({ content: '# Meeting\n\n![](attachment:board)' })
    const written = await repo.createNote({ content: '# Budget\n\nThe quarterly budget review' })
    await texts.set('board', 'Quarterly budget: marketing 40%, product 60%')
    const hits = await repo.search('budget')
    expect(hits.map((h) => h.note.id)).toEqual([written.id, pictured.id])
    expect(hits[1]?.snippet).toContain('budget')
    const fragments = await retrieve(db, null, 'marketing budget', { kind: 'all' })
    expect(fragments.find((f) => f.noteId === pictured.id)?.text).toContain('marketing 40%')
  })

  it('is forgotten with the notes when the device is unbound', async () => {
    await image('board')
    await repo.createNote({ content: '![](attachment:board)' })
    await texts.set('board', 'whiteboard plan')
    const blobs: BlobStore = {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
    }
    await forgetLocalNotes(db, blobs)
    expect(await texts.get('board')).toBeNull()
    expect(await texts.search('whiteboard')).toEqual([])
  })
})
