import { describe, expect, it } from 'vitest'
import { folderTree, subtreeCounts } from './tree'

describe('folderTree', () => {
  it('lists folders parent first, children indented, in the given order', () => {
    const f = (id: string, parentId: string | null = null) => ({ id, parentId })
    const tree = folderTree([f('b'), f('a'), f('b1', 'b'), f('b1x', 'b1'), f('lost', 'gone')])
    expect(tree.map((t) => `${t.depth}:${t.folder.id}`)).toEqual([
      '0:b',
      '1:b1',
      '2:b1x',
      '0:a',
      '0:lost',
    ])
    // Broken data with a cycle still ends, and keeps every folder.
    expect(folderTree([f('x', 'y'), f('y', 'x')]).map((t) => `${t.depth}:${t.folder.id}`)).toEqual([
      '0:x',
      '1:y',
    ])
  })
})

describe('subtreeCounts', () => {
  it('adds subfolder notes to every folder above them', () => {
    const counts = subtreeCounts([
      { id: 'a', parentId: null, noteCount: 1 },
      { id: 'b', parentId: 'a', noteCount: 2 },
      { id: 'c', parentId: 'b', noteCount: 4 },
      { id: 'd', parentId: null, noteCount: 0 },
    ])
    expect(Object.fromEntries(counts)).toEqual({ a: 7, b: 6, c: 4, d: 0 })
  })
})
