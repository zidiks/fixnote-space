import type { NoteSummary } from '@fixnote/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUi } from '../app/store'
import { currentListRoute, listedFolderId, listFilter } from './layout'
import { sections } from './sections'

beforeEach(() => useUi.setState({ route: { kind: 'home' }, back: [], forward: [], layout: null }))

describe('the listed place', () => {
  it('in the assistant layout, only while the list is on screen', () => {
    useUi.setState({ layout: 'assistant' })
    useUi.getState().navigate({ kind: 'folder', id: 'f' })
    expect(listedFolderId()).toBe('f')
    useUi.getState().navigate({ kind: 'note', id: 'n' })
    expect(currentListRoute()).toBeNull()
    expect(listedFolderId()).toBeNull()
  })

  it('in the notes layout, also beside the open note (a new note goes to that folder)', () => {
    useUi.setState({ layout: 'notes' })
    useUi.getState().navigate({ kind: 'folder', id: 'f' })
    useUi.getState().navigate({ kind: 'note', id: 'n' })
    expect(currentListRoute()).toEqual({ kind: 'folder', id: 'f' })
    expect(listedFolderId()).toBe('f')
  })

  it('looks like the assistant layout until one is chosen', () => {
    useUi.getState().navigate({ kind: 'folder', id: 'f' })
    useUi.getState().navigate({ kind: 'note', id: 'n' })
    expect(currentListRoute()).toBeNull()
  })
})

describe('what a list shows', () => {
  it('filters notes by the list', () => {
    expect(listFilter({ kind: 'home' }, 0)).toEqual({ scope: 'all' })
    expect(listFilter({ kind: 'home', filter: 'inbox' }, 0)).toEqual({ scope: 'inbox' })
    expect(listFilter({ kind: 'folder', id: 'f' }, 0)).toEqual({ folderId: 'f' })
    expect(listFilter({ kind: 'today' }, 123)).toEqual({ updatedSince: 123 })
  })

  it('groups notes by date for every view of a list', () => {
    const now = new Date(2026, 9, 13, 12)
    const note = (id: string, at: Date) =>
      ({ id, title: id, createdAt: at.getTime(), updatedAt: at.getTime() }) as NoteSummary
    const notes = [
      note('a', new Date(2026, 9, 13, 9)),
      note('b', new Date(2026, 9, 13, 8)),
      note('c', new Date(2026, 9, 12, 8)),
    ]
    const groups = sections(notes, 'edited', now)
    expect(groups.map((g) => g.notes.map((n) => n.id))).toEqual([['a', 'b'], ['c']])
    expect(sections(notes, 'title', now)).toHaveLength(1)
    expect(sections([], 'title', now)).toEqual([])
  })
})
