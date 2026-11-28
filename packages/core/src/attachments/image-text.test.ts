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

  it('queues PDFs, Word docs, spreadsheets, and text files for deep search indexing', async () => {
    await image('contract-pdf', 120_000, 'application/pdf')
    await image(
      'report-docx',
      45_000,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    await image(
      'budget-xlsx',
      30_000,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    await image('notes-csv', 512, 'text/csv')
    await image('clip-mp3', 90_000, 'audio/mpeg')
    const note = await repo.createNote({
      content: [
        '# Docs',
        '[contract.pdf](attachment:contract-pdf "120 KB")',
        '[report.docx](attachment:report-docx "45 KB")',
        '[budget.xlsx](attachment:budget-xlsx "30 KB")',
        '[notes.csv](attachment:notes-csv "512 B")',
        '[clip.mp3](attachment:clip-mp3 "90 KB")',
      ].join('\n\n'),
    })
    const pending = await texts.pending(20)
    expect(pending).toHaveLength(4)
    expect(new Set(pending)).toEqual(
      new Set(['contract-pdf', 'report-docx', 'budget-xlsx', 'notes-csv']),
    )
    await texts.set('contract-pdf', '[Page 1]\nCover\n\n[Page 2]\nIndemnification clause 42')
    const hits = await repo.search('indemnification')
    expect(hits.map((h) => h.note.id)).toEqual([note.id])
    expect(hits[0]?.snippet).toContain('Indemnification')
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
