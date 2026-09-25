import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import { buildExport } from '../export'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import {
  bearTags,
  detectSource,
  type ImportFile,
  parseFrontMatter,
  planImport,
  runImport,
} from './index'

let db: SqlDriver
let repo: NotesRepo

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  let t = 1_000_000
  repo = new NotesRepo(db, { now: () => t++ })
})

const file = (path: string, content: string | Uint8Array, modified?: number): ImportFile => ({
  path,
  data: typeof content === 'string' ? strToU8(content) : content,
  ...(modified ? { modified } : {}),
})

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

/** Stores images in memory so tests can see what was added. */
function imageStore() {
  const added: { path: string; mime: string }[] = []
  return {
    added,
    addImage: async (f: ImportFile, mime: string) => {
      added.push({ path: f.path, mime })
      return `img${added.length}`
    },
  }
}

describe('parseFrontMatter', () => {
  it('reads title, tags in both styles and dates, and drops the block', () => {
    const fm = parseFrontMatter(
      '---\ntitle: "Trip"\ntags: [travel, "big plans"]\ncreated: 2024-05-01T10:00:00Z\nauthor: me\n---\nBody',
    )
    expect(fm).toEqual({
      body: 'Body',
      title: 'Trip',
      tags: ['travel', 'big-plans'],
      created: Date.parse('2024-05-01T10:00:00Z'),
    })
    expect(parseFrontMatter('---\ntags:\n  - a\n  - "#b"\n---\nx').tags).toEqual(['a', 'b'])
    expect(parseFrontMatter('no front matter')).toEqual({ body: 'no front matter', tags: [] })
  })
})

describe('bearTags', () => {
  it('turns multi-word tags into hyphenated ones and leaves the rest', () => {
    expect(bearTags('see #work stuff# and #solo\n#a b c#')).toBe(
      'see #work-stuff and #solo\n#a-b-c',
    )
    expect(bearTags('# Heading')).toBe('# Heading')
  })
})

describe('planImport', () => {
  it('plans a Markdown folder: folders, titles, front matter tags and images', () => {
    const plan = planImport([
      file('Vault/Work/Plan.md', '---\ntags: [q3]\n---\nSteps ![shot](../img/a%20b.png)', 5000),
      file('Vault/Work/Ideas.md', '# Ideas\n![[a b.png]] and [Plan](Plan.md)'),
      file('Vault/img/a b.png', PNG),
      file('Vault/Root.txt', 'Root'),
      file('Vault/table.csv', 'a,b'),
      file('Vault/.DS_Store', 'x'),
    ])
    expect(plan.source).toBe('markdown')
    expect(plan.notes.map((n) => [n.folder, n.content])).toEqual([
      [['Work'], '# Plan\n\nSteps ![shot](../img/a%20b.png)\n\n#q3'],
      [['Work'], '# Ideas\n![[a b.png]] and Plan'],
      [[], 'Root'],
    ])
    expect(plan.notes[0]?.updated).toBe(5000)
    expect(plan.notes[0]?.images).toEqual([
      { match: '![shot](../img/a%20b.png)', alt: 'shot', file: 'img/a b.png' },
    ])
    expect(plan.notes[1]?.images[0]?.file).toBe('img/a b.png')
    expect(plan).toMatchObject({ folders: 1, images: 1, skipped: ['table.csv'] })
  })

  it('plans a Bear backup with textbundles, dates and tags', () => {
    const info = JSON.stringify({
      'net.shinyfrog.bear': {
        creationDate: '2023-01-02T03:04:05Z',
        modificationDate: '2023-02-02T03:04:05Z',
      },
    })
    const backup = zipSync({
      'Bear Notes/Recipe.textbundle/text.markdown': strToU8(
        '# Recipe\n#food and drink# ![](assets/pie.jpg)',
      ),
      'Bear Notes/Recipe.textbundle/info.json': strToU8(info),
      'Bear Notes/Recipe.textbundle/assets/pie.jpg': PNG,
    })
    const plan = planImport([file('backup.bear2bk', backup)])
    expect(plan.source).toBe('bear')
    expect(plan.notes).toHaveLength(1)
    const note = plan.notes[0]
    expect(note?.folder).toEqual([])
    expect(note?.content).toBe('# Recipe\n#food-and-drink ![](assets/pie.jpg)')
    expect(note?.created).toBe(Date.parse('2023-01-02T03:04:05Z'))
    expect(note?.updated).toBe(Date.parse('2023-02-02T03:04:05Z'))
    // The wrapping folder of the archive is dropped.
    expect(note?.images[0]?.file).toBe('Recipe.textbundle/assets/pie.jpg')
    expect(plan.skipped).toEqual([])
  })

  it('plans a Notion export: nested zip, ids dropped from names and folders', () => {
    const id = '0123456789abcdef0123456789abcdef'
    const inner = zipSync({
      [`Home ${id}.md`]: strToU8(`# Home\n[Sub](Home%20${id}/Sub%20${id}.md)`),
      [`Home ${id}/Sub ${id}.md`]: strToU8(`# Sub\n![](Sub%20${id}/cat.png)`),
      [`Home ${id}/Sub ${id}/cat.png`]: PNG,
      [`Home ${id}/Tasks ${id}.csv`]: strToU8('a'),
    })
    const outer = zipSync({ 'Export-part-1.zip': inner })
    const plan = planImport([file('Export.zip', outer)])
    expect(detectSource([file(`Home ${id}.md`, '')])).toBe('notion')
    expect(plan.source).toBe('notion')
    expect(plan.notes.map((n) => [n.folder, n.content])).toEqual([
      [[], '# Home\nSub'],
      [['Home'], `# Sub\n![](Sub%20${id}/cat.png)`],
    ])
    expect(plan.images).toBe(1)
    expect(plan.skipped).toEqual([`Home ${id}/Tasks ${id}.csv`])
  })
})

describe('runImport', () => {
  it('creates folders, stores each image once, keeps dates and skips duplicates', async () => {
    const existing = await repo.createFolder('Work')
    const input = [
      file('Work/Plan.md', 'Steps ![](img/a.png)', 5000),
      file('Work/Deep/Other.md', 'Text ![](../img/a.png)'),
      file('Work/img/a.png', PNG),
      file('Top.md', 'Top'),
    ]
    const plan = planImport(input)
    const images = imageStore()
    const progress: number[] = []
    const result = await runImport(plan, input, {
      repo,
      addImage: images.addImage,
      onProgress: (done) => progress.push(done),
    })
    expect(result).toMatchObject({ images: 1, duplicates: 0 })
    expect(result.noteIds).toHaveLength(3)
    expect(images.added).toEqual([{ path: 'Work/img/a.png', mime: 'image/png' }])
    expect(progress).toEqual([1, 2, 3])

    const folders = await repo.listFolders()
    const deep = folders.find((f) => f.name === 'Deep')
    expect(deep?.parentId).toBe(existing.id)
    expect(result.folderIds).toEqual([deep?.id])

    const plan0 = await repo.getNote(result.noteIds[0] as string)
    expect(plan0?.content).toBe('# Plan\n\nSteps ![](attachment:img1)')
    expect(plan0?.folderId).toBe(existing.id)
    expect(plan0?.updatedAt).toBe(5000)
    const other = await repo.getNote(result.noteIds[1] as string)
    expect(other?.content).toBe('# Other\n\nText ![](attachment:img1)')

    // The same files again add nothing.
    const again = await runImport(planImport(input), input, { repo, addImage: images.addImage })
    expect(again).toMatchObject({ noteIds: [], folderIds: [], images: 0, duplicates: 3 })
  })

  it('keeps the original reference when an image cannot be stored', async () => {
    const input = [file('a.md', 'Text ![](big.png)'), file('big.png', PNG), file('b.md', 'B')]
    const result = await runImport(planImport(input), input, {
      repo,
      addImage: async () => {
        throw new Error('too large')
      },
    })
    expect(result).toMatchObject({ images: 0, duplicates: 0 })
    const a = await repo.getNote(result.noteIds[0] as string)
    expect(a?.content).toBe('# a\n\nText ![](big.png)')
  })

  it('round-trips a FixNote export into an empty database', async () => {
    const work = await repo.createFolder('Work')
    await repo.createNote({ content: '# Plan\n![pic](attachment:att1)', folderId: work.id })
    await repo.createNote({ content: 'loose #tag' })
    await repo.getOrCreateDaily('2026-09-25', () => '# Friday')
    const blob = new Blob([PNG], { type: 'image/png' })
    const files = await buildExport(
      db,
      { inbox: 'Inbox', daily: 'Daily', untitled: 'Untitled' },
      Date.UTC(2026, 8, 25),
      { load: async () => blob },
    )
    const zip = zipSync(
      Object.fromEntries(files.map((f) => [f.path, f.data ?? strToU8(f.content)])),
    )
    const input = [file('fixnote-2026-09-25.zip', zip)]

    const target = await createMemoryDriver()
    await prepareDatabase(target)
    const repo2 = new NotesRepo(target)
    const plan = planImport(input)
    expect(plan).toMatchObject({ source: 'fixnote', folders: 1, images: 1, skipped: [] })
    const images = imageStore()
    const result = await runImport(plan, input, { repo: repo2, addImage: images.addImage })
    expect(result).toMatchObject({ images: 1, duplicates: 0 })
    expect(images.added).toEqual([{ path: 'attachments/att1.png', mime: 'image/png' }])

    const notes = await Promise.all(result.noteIds.map((id) => repo2.getNote(id)))
    const folders = await repo2.listFolders()
    expect(folders.map((f) => f.name)).toEqual(['Work'])
    const byContent = new Map(notes.map((n) => [n?.content, n]))
    expect(byContent.get('# Plan\n![pic](attachment:img1)')?.folderId).toBe(folders[0]?.id)
    expect(byContent.get('# Friday')).toMatchObject({ type: 'daily', dailyDate: '2026-09-25' })
    expect(byContent.get('loose #tag')?.folderId).toBeNull()
  })
})
