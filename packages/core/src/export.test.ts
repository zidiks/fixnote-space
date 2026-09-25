import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from './db/migrate'
import { buildExport, safeName } from './export'
import { NotesRepo } from './notes/repo'
import type { SqlDriver } from './platform'
import { createMemoryDriver } from './testing/memory-driver'

let db: SqlDriver
let repo: NotesRepo

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  let t = 1_000
  repo = new NotesRepo(db, { now: () => t++ })
})

const labels = { inbox: 'Входящие', daily: 'Daily', untitled: 'Untitled' }

describe('safeName', () => {
  it('produces names valid on every OS', () => {
    expect(safeName('a/b:c*?"<>|', 'x')).toBe('a b c')
    expect(safeName('ends with dots...', 'x')).toBe('ends with dots')
    expect(safeName('CON', 'x')).toBe('x')
    expect(safeName('   ', 'x')).toBe('x')
    expect(safeName('é'.repeat(100), 'x')).toHaveLength(80)
  })
})

describe('buildExport', () => {
  it('writes notes into their folder paths with unique names and a JSON copy', async () => {
    const work = await repo.createFolder('Work')
    const sub = await repo.createFolder('Projects', work.id)
    await repo.createNote({ content: '# Plan\nstep #x', folderId: sub.id })
    await repo.createNote({ content: '# Plan\nanother', folderId: sub.id })
    await repo.createNote({ content: 'inbox thought' })
    await repo.createNote({ content: '' })
    await repo.getOrCreateDaily('2026-09-25', () => '# Friday')
    const gone = await repo.createNote({ content: 'deleted' })
    await repo.deleteNote(gone.id)

    const files = await buildExport(db, labels, Date.UTC(2026, 8, 25))
    expect(files.map((f) => f.path)).toEqual([
      'Work/Projects/Plan.md',
      'Work/Projects/Plan (2).md',
      'Входящие/inbox thought.md',
      'Входящие/Untitled.md',
      'Daily/2026-09-25.md',
      'fixnote.json',
    ])
    expect(files[0]?.content).toBe('# Plan\nstep #x')
    const json = JSON.parse(files.at(-1)?.content ?? '{}')
    expect(json).toMatchObject({
      format: 'fixnote-export',
      version: 1,
      exportedAt: '2026-09-25T00:00:00.000Z',
    })
    expect(json.notes).toHaveLength(5)
    expect(json.notes[0].tags).toEqual(['x'])
    expect(json.folders).toHaveLength(2)
  })

  it('puts images in attachments/ and links notes to them', async () => {
    const f = await repo.createFolder('Trips')
    await repo.createNote({
      content: 'Map ![](attachment:a1) and ![](attachment:gone)',
      folderId: f.id,
    })
    await repo.createNote({ content: '![x](attachment:a1)' })
    const blobs: Record<string, Blob> = {
      a1: new Blob([new Uint8Array([1, 2])], { type: 'image/webp' }),
    }
    const files = await buildExport(db, labels, 0, { load: async (id) => blobs[id] ?? null })
    expect(files.map((x) => x.path)).toEqual([
      'attachments/a1.webp',
      'Trips/Map and.md',
      'Входящие/x.md',
      'fixnote.json',
    ])
    expect(files[0]?.data).toEqual(new Uint8Array([1, 2]))
    expect(files[1]?.content).toBe('Map ![](../attachments/a1.webp) and ![](attachment:gone)')
    expect(files[2]?.content).toBe('![x](../attachments/a1.webp)')
    expect(JSON.parse(files[3]?.content ?? '{}').attachments).toEqual({ a1: 'attachments/a1.webp' })
  })
})
