import { describe, expect, it } from 'vitest'
import { diffWords } from './diff'

describe('diffWords', () => {
  it('marks changed words and keeps the rest', () => {
    expect(diffWords('Купить молоко и хлеб', 'Купить кефир и хлеб')).toEqual([
      { kind: 'same', text: 'Купить ' },
      { kind: 'del', text: 'молоко' },
      { kind: 'add', text: 'кефир' },
      { kind: 'same', text: ' и хлеб' },
    ])
  })

  it('rebuilds both sides exactly', () => {
    const a = 'One line.\n\n- item one\n- item two'
    const b = '# Title\n\n- item one\n- item 2, done'
    const parts = diffWords(a, b)
    expect(
      parts
        .filter((p) => p.kind !== 'add')
        .map((p) => p.text)
        .join(''),
    ).toBe(a)
    expect(
      parts
        .filter((p) => p.kind !== 'del')
        .map((p) => p.text)
        .join(''),
    ).toBe(b)
  })

  it('handles empty sides', () => {
    expect(diffWords('', 'new')).toEqual([{ kind: 'add', text: 'new' }])
    expect(diffWords('old', '')).toEqual([{ kind: 'del', text: 'old' }])
  })
})
