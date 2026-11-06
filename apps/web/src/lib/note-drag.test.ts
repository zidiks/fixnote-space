import { describe, expect, it } from 'vitest'
import { moveNotes } from './note-drag'

describe('moveNotes', () => {
  const notes = new Map<string, { folderId: string | null; readOnly: boolean }>([
    ['a', { folderId: null, readOnly: false }],
    ['b', { folderId: 'f1', readOnly: false }],
    ['c', { folderId: 'f2', readOnly: true }],
    ['d', { folderId: 'f2', readOnly: false }],
  ])
  const repo = {
    getNote: async (id: string) => {
      const n = notes.get(id)
      return n ? ({ id, ...n } as never) : null
    },
    moveNote: async (id: string, folderId: string | null) => {
      const n = notes.get(id)
      if (n) n.folderId = folderId
    },
  }

  it('moves what can move and remembers where from', async () => {
    const { moved, error } = await moveNotes(repo, ['a', 'b', 'c', 'd', 'gone'], 'f1')
    expect(error).toBeUndefined()
    expect(moved).toEqual([
      { id: 'a', from: null },
      { id: 'd', from: 'f2' },
    ])
    expect(notes.get('c')?.folderId).toBe('f2')
  })
})
