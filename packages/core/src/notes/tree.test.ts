import { describe, expect, it } from 'vitest'
import { folderTree } from './tree'

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
