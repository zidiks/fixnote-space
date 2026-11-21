import type { Folder, Note, NotePage } from '@fixnote/core'
import { joinPages } from '@fixnote/core'
import { type InfiniteData, QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { cacheSavedNote, matches, patchPages } from './saved-note'

const note = (id: string, title = id, updatedAt = 10): Note => ({
  id,
  title,
  updatedAt,
  createdAt: 1,
  content: title,
  excerpt: title,
  folderId: null,
  type: 'text',
  dailyDate: null,
  tasks: null,
  cover: null,
  pinnedAt: null,
  sharedId: null,
  readOnly: false,
})
const data = (notes: Note[], key: number | string | null = null): InfiniteData<NotePage> => ({
  pages: [{ items: notes, nextCursor: key === null ? null : { key, id: notes.at(-1)?.id ?? '' } }],
  pageParams: [null],
})

describe('cache after a successful save', () => {
  it('updates the card and order without reading lists or navigation again', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    const old = note('a', 'Before', 10)
    const other = note('b', 'Other', 20)
    const listKey = ['notes', 'list', { pinned: false }, 'edited']
    const navigation = { counts: { all: 2, inbox: 2, daily: 0, links: 0 }, folders: [] }
    qc.setQueryData(listKey, data([other, old]))
    qc.setQueryData(['navigation'], navigation)
    qc.setQueryData(['notes', 'one', other.id], other)
    const readList = vi.fn()
    const readNavigation = vi.fn()
    const listObserver = new QueryObserver(qc, { queryKey: listKey, queryFn: readList })
    const navObserver = new QueryObserver(qc, { queryKey: ['navigation'], queryFn: readNavigation })
    const stopList = listObserver.subscribe(() => {})
    const stopNav = navObserver.subscribe(() => {})
    cacheSavedNote(qc, old, { ...old, updatedAt: 30, title: 'After' })
    await Promise.resolve()
    const result = qc.getQueryData<InfiniteData<NotePage>>(listKey) as InfiniteData<NotePage>
    expect(
      joinPages(
        result.pages.map((p) => p.items),
        'edited',
      ).map((n) => n.title),
    ).toEqual(['After', 'Other'])
    expect(result.pages[0]?.items[0]).toBe(other)
    expect(qc.getQueryData(['navigation'])).toBe(navigation)
    expect(qc.getQueryData(['notes', 'one', other.id])).toBe(other)
    expect(readList).not.toHaveBeenCalled()
    expect(readNavigation).not.toHaveBeenCalled()
    stopList()
    stopNav()
    qc.clear()
  })

  it('retains cursors while title edits move into and out of the loaded range', () => {
    const a = note('a', 'Apple'),
      b = note('b', 'Banana')
    const initial = data([a, b], 'banana')
    const moved = patchPages(initial, { ...a, title: 'Zebra' }, true, 'title')
    expect(moved.pages[0]?.items.map((n) => n.id)).toEqual(['b'])
    expect(moved.pages[0]?.nextCursor).toBe(initial.pages[0]?.nextCursor)
    expect(moved.pageParams).toBe(initial.pageParams)
    const inserted = patchPages(moved, note('z', 'Apricot'), true, 'title')
    expect(
      joinPages(
        inserted.pages.map((p) => p.items),
        'title',
      ).map((n) => n.title),
    ).toEqual(['Apricot', 'Banana'])
    expect(patchPages(initial, note('z', 'Zebra'), true, 'title')).toBe(initial)
  })

  it('removes duplicate page entries without disturbing the next fetch cursor', () => {
    const a = note('a'),
      b = note('b')
    const initial = {
      pages: [...data([b, a], 10).pages, ...data([a], 5).pages],
      pageParams: [null, { key: 10, id: 'a' }],
    }
    const next = patchPages(initial, { ...a, updatedAt: 40 }, true, 'edited')
    expect(next.pages.flatMap((p) => p.items).filter((n) => n.id === 'a')).toHaveLength(1)
    expect(next.pages[1]?.nextCursor).toEqual({ key: 5, id: 'a' })
  })

  it('updates link counts only when link membership changes and expires matching searches', () => {
    const qc = new QueryClient()
    const old = note('a')
    qc.setQueryData(['navigation'], { folders: [], counts: { all: 1 } })
    const search = ['notes', 'search', 'hello', null]
    const unrelated = ['notes', 'search', 'hello', { folderId: 'unrelated' }]
    qc.setQueryData(search, [])
    qc.setQueryData(unrelated, [])
    cacheSavedNote(qc, old, { ...old, url: 'https://example.com' })
    expect(qc.getQueryState(['navigation'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState(search)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(unrelated)?.isInvalidated).toBe(false)
    qc.clear()
  })

  it('respects descendant folders, pinning, links and date filters', () => {
    const folders = [{ id: 'child', parentId: 'parent' }] as Folder[]
    const n = { ...note('a'), folderId: 'child' }
    expect(matches(n, { folderId: 'parent' }, folders)).toBe(true)
    expect(matches(n, { folderId: 'parent' })).toBeUndefined()
    expect(matches(n, { scope: 'inbox' }, folders)).toBe(false)
    expect(matches(n, { pinned: true }, folders)).toBe(false)
    expect(matches(n, { links: true }, folders)).toBe(false)
    expect(matches(n, { updatedSince: 11 }, folders)).toBe(false)
  })

  it('keeps a remote invalidation on an inactive list after patching one saved card', async () => {
    const qc = new QueryClient()
    const n = note('a')
    const key = ['notes', 'list', {}, 'edited']
    qc.setQueryData(key, data([n]))
    await qc.invalidateQueries({ queryKey: key })
    cacheSavedNote(qc, n, { ...n, title: 'Saved locally' })
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
    qc.clear()
  })
})
