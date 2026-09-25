import { describe, expect, it } from 'vitest'
import { deriveExcerpt, deriveTitle, extractTags, taskProgress, toPlainText } from './markdown'

describe('deriveTitle', () => {
  it('uses the first non-empty line without Markdown syntax', () => {
    expect(deriveTitle('\n\n# Story **problem**\nbody')).toBe('Story problem')
    expect(deriveTitle('- [ ] buy [milk](https://x.y)')).toBe('buy milk')
    expect(deriveTitle('```\ncode\n```\nReal title')).toBe('Real title')
    expect(deriveTitle('')).toBe('')
  })

  it('truncates long titles', () => {
    expect(deriveTitle('a'.repeat(200), 10)).toBe('aaaaaaaaa…')
  })
})

describe('deriveExcerpt', () => {
  it('joins the lines after the title', () => {
    expect(deriveExcerpt('# Title\n\nFirst *line*\n- second\n\n> third')).toBe(
      'First line second third',
    )
  })
})

describe('extractTags', () => {
  it('finds Bear-style tags in any script', () => {
    expect(extractTags('Идея #работа и #idea/fixnote, again #Работа')).toEqual([
      'работа',
      'idea/fixnote',
    ])
  })

  it('ignores headings, numbers, code and URL fragments', () => {
    const md = '# Heading\nissue #123\n`#code` and\n```\n#fenced\n```\nsee https://x.com/#anchor'
    expect(extractTags(md)).toEqual([])
  })

  it('accepts an escaped hash at line start', () => {
    expect(extractTags('\\#daily til')).toEqual(['daily'])
  })
})

describe('taskProgress', () => {
  it('counts checked and total items', () => {
    expect(taskProgress('- [x] a\n- [ ] b\n* [X] c\ntext')).toEqual({ done: 2, total: 3 })
    expect(taskProgress('no tasks')).toBeNull()
  })
})

describe('toPlainText', () => {
  it('keeps one line per block without syntax', () => {
    expect(toPlainText('# A\n\n- [ ] b **c**\n> d\n```css\ncolor: oklch(0.7 0.1 50)\n```')).toBe(
      'A\nb c\nd\ncolor: oklch(0.7 0.1 50)',
    )
  })
})
