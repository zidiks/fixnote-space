import { beforeEach, describe, expect, it } from 'vitest'
import { importInbox } from '../capture'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { Folder } from '../notes/types'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { cleanUrl, findLinkNote, linkMarkdown, linkUrlOf, normalizeUrl } from './note'
import { folderPath, learnedFolder, type PlaceDeps, placeLink, rankFolders } from './place'

let db: SqlDriver
let repo: NotesRepo

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  let seq = 0
  repo = new NotesRepo(db, { newId: () => `id-${++seq}` })
})

describe('normalizeUrl', () => {
  it('ignores tracking, www, fragments, order and trailing slashes', () => {
    expect(normalizeUrl('http://www.Example.com/a/?utm_source=x&b=2&a=1#top')).toBe(
      'https://example.com/a?a=1&b=2',
    )
    expect(normalizeUrl('https://youtu.be/abc?si=XYZ')).toBe('https://youtu.be/abc')
    expect(normalizeUrl('https://m.reddit.com/r/x/')).toBe(normalizeUrl('https://reddit.com/r/x'))
    expect(normalizeUrl('https://example.com/?q=1')).not.toBe(normalizeUrl('https://example.com/'))
  })

  it('saved links keep the address without tracking', () => {
    expect(cleanUrl('https://www.youtube.com/watch?v=abc&si=XYZ&utm_source=tg#t=1')).toBe(
      'https://www.youtube.com/watch?v=abc#t=1',
    )
    expect(cleanUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
  })
})

describe('link notes', () => {
  const md = linkMarkdown(
    {
      url: 'https://example.com/post',
      title: 'A post',
      description: 'What it is about',
      selection: 'Quoted line',
      text: '# Not a heading\n\n- not a list\nplain',
    },
    { pageText: 'Page text' },
  )

  it('have the title, the URL alone on its line, the quote and the folded page text', () => {
    expect(md.startsWith('# A post\n\nhttps://example.com/post\n\n> Quoted line\n\n')).toBe(true)
    expect(md).toContain('<details>\n<summary>Page text</summary>')
    expect(md).toContain('\\# Not a heading')
    expect(md).toContain('\\- not a list')
  })

  it('are recognised from the text, in JS and in SQL', async () => {
    expect(linkUrlOf(md)).toBe('https://example.com/post')
    expect(linkUrlOf('https://example.com')).toBe('https://example.com')
    expect(linkUrlOf('# Title\n\nSome text https://example.com')).toBeNull()
    expect(linkUrlOf('Shopping list')).toBeNull()

    await repo.createNote({ content: md })
    await repo.createNote({ content: 'https://bare.example' })
    await repo.createNote({ content: '# Plain\n\ntext' })
    const page = await repo.listNotes({ filter: { links: true } })
    expect(page.items.map((n) => n.url).sort()).toEqual([
      'https://bare.example',
      'https://example.com/post',
    ])
    expect((await repo.counts()).links).toBe(2)
  })

  it('are found again by the same page', async () => {
    const note = await repo.createNote({ content: md })
    expect(await findLinkNote(db, 'http://www.example.com/post/?utm_medium=x')).toEqual({
      id: note.id,
      folderId: null,
    })
    expect(await findLinkNote(db, 'https://example.com/other')).toBeNull()
  })
})

const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  name,
  parentId,
  sort: 0,
  noteCount: 0,
  shared: null,
  access: null,
})

describe('placing a link', () => {
  it('ranks folders by the mean of their best notes, skipping thin ones', () => {
    expect(
      rankFolders([
        { folderId: 'a', score: 0.9 },
        { folderId: 'a', score: 0.7 },
        { folderId: 'b', score: 0.95 },
        { folderId: 'c', score: 0.8 },
        { folderId: 'c', score: 0.8 },
      ]),
    ).toEqual([
      { folderId: 'a', score: 0.8 },
      { folderId: 'c', score: 0.8 },
    ])
  })

  it('learns a site after two moves to the same folder', () => {
    const ok = new Set(['f1', 'f2'])
    const l = (folderId: string, at: number) => ({ host: 'x.com', title: '', folderId, at })
    expect(learnedFolder([l('f1', 1)], 'x.com', ok)).toBeNull()
    expect(learnedFolder([l('f1', 1), l('f1', 2)], 'x.com', ok)).toBe('f1')
    expect(learnedFolder([l('f1', 1), l('f2', 2)], 'x.com', ok)).toBeNull()
    expect(learnedFolder([l('f1', 1), l('f1', 2)], 'y.com', ok)).toBeNull()
  })

  async function setup() {
    const design = await repo.createFolder('Design')
    const food = await repo.createFolder('Food')
    await repo.createNote({ content: 'Typography grid layout fonts kerning', folderId: design.id })
    await repo.createNote({ content: 'Color palette contrast layout fonts', folderId: design.id })
    await repo.createNote({ content: 'Pasta recipe tomato basil', folderId: food.id })
    await repo.createNote({ content: 'Soup recipe onion garlic', folderId: food.id })
    const deps: PlaceDeps = {
      db,
      folders: await repo.listFolders(),
      embed: null,
      vectors: null,
      ask: null,
      lessons: [],
    }
    return { design, food, deps }
  }

  it('goes to the folder whose notes share its words', async () => {
    const { food, deps } = await setup()
    expect(
      await placeLink(
        { title: 'Recipe', host: 'food.com', about: 'Tomato soup recipe garlic' },
        deps,
      ),
    ).toEqual({ kind: 'folder', folderId: food.id, how: 'keywords' })
  })

  it('uses vectors when semantic search is on', async () => {
    const { design, deps } = await setup()
    const notes = await repo.listNotes({})
    const near = new Float32Array([1, 0])
    const far = new Float32Array([0, 1])
    const vectors = new Map(
      notes.items.map((n) => [n.id, [{ vector: n.folderId === design.id ? near : far }]]),
    )
    const placed = await placeLink(
      { title: 'x', host: 'x.dev', about: 'anything' },
      { ...deps, embed: async () => near, vectors: async () => vectors },
    )
    expect(placed).toEqual({ kind: 'folder', folderId: design.id, how: 'semantic' })
  })

  it('asks the model when nothing fits, and falls back to Misc', async () => {
    const { deps } = await setup()
    const input = { title: 'Rust async', host: 'blog.rs', about: 'Rust async runtimes tokio' }
    expect(await placeLink(input, deps)).toEqual({ kind: 'topic', name: null })
    expect(
      await placeLink(input, { ...deps, ask: async () => ({ newFolder: ' Programming ' }) }),
    ).toEqual({ kind: 'topic', name: 'Programming' })
    const withRef = await placeLink(input, {
      ...deps,
      ask: async (req) => ({ folder: req.folders.find((f) => f.path === 'Food')?.ref ?? 0 }),
    })
    expect(withRef).toMatchObject({ kind: 'folder', how: 'model' })
  })

  it('never picks a shared folder by itself', async () => {
    const { food, deps } = await setup()
    const shared = deps.folders.map((f) =>
      f.id === food.id ? { ...f, shared: 'owner' as const } : f,
    )
    const placed = await placeLink(
      { title: 'Recipe', host: 'food.com', about: 'Tomato soup recipe garlic' },
      { ...deps, folders: shared },
    )
    expect(placed).not.toMatchObject({ folderId: food.id })
  })

  it('names a folder by its path', () => {
    const list = [folder('a', 'Links'), folder('b', 'Design', 'a')]
    expect(folderPath(list, 'b')).toEqual(['Links', 'Design'])
    expect(folderPath(list, null)).toEqual([])
  })
})

describe('captured links', () => {
  it('go to saveLink, and so does a message that is only a URL', async () => {
    const got: { url: string; title?: string | undefined; channel: string }[] = []
    const items = [
      {
        id: '1',
        channel: 'extension',
        payload: { kind: 'link', url: 'https://a.example', title: 'A' },
      },
      { id: '2', channel: 'telegram', payload: { kind: 'text', text: '  https://b.example  ' } },
      { id: '3', channel: 'telegram', payload: { kind: 'text', text: 'see https://c.example' } },
    ]
    const removed: string[] = []
    const result = await importInbox({
      db,
      keys: {} as never,
      remote: {
        list: async () => items.map((i) => ({ id: i.id, channel: i.channel, sealed: i.id })),
        remove: async (id) => void removed.push(id),
      },
      repo,
      attachments: {} as never,
      open: (_keys, sealed) =>
        JSON.stringify({ v: 1, receivedAt: 5, ...items.find((i) => i.id === sealed)?.payload }),
      saveLink: async (link, _at, channel) => void got.push({ ...link, channel }),
    })
    expect(result.imported).toBe(3)
    expect(got).toEqual([
      { url: 'https://a.example', title: 'A', channel: 'extension' },
      { url: 'https://b.example', channel: 'telegram' },
    ])
    expect((await repo.listNotes({})).items.map((n) => n.title)).toEqual(['see https://c.example'])
    expect(removed).toEqual(['1', '2', '3'])
  })
})
