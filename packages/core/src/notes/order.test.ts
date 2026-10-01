import { describe, expect, it } from 'vitest'
import { joinPages } from './order'
import type { NoteSummary } from './types'

const note = (id: string, updatedAt: number, createdAt = updatedAt, title = id): NoteSummary => ({
  id,
  folderId: null,
  type: 'text',
  dailyDate: null,
  title,
  excerpt: '',
  tasks: null,
  cover: null,
  pinnedAt: null,
  sharedId: null,
  readOnly: false,
  createdAt,
  updatedAt,
})

describe('joinPages', () => {
  it('keeps each note once, newest first, however the pages came back', () => {
    // A refetch after sync: the second page overlaps the first and starts out of step.
    const pages = [
      [note('a', 50), note('b', 40), note('old', 10)],
      [note('b', 40), note('c', 45), note('d', 20)],
    ]
    expect(joinPages(pages, 'edited').map((n) => n.id)).toEqual(['a', 'c', 'b', 'd', 'old'])
  })

  it('orders by creation or by title like the database', () => {
    const notes = [note('x', 1, 30, 'banana'), note('y', 2, 20, 'Apple'), note('z', 3, 10, '')]
    expect(joinPages([notes], 'created').map((n) => n.id)).toEqual(['x', 'y', 'z'])
    expect(joinPages([notes], 'title').map((n) => n.id)).toEqual(['y', 'x', 'z'])
  })
})
