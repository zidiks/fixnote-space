import { merge } from 'node-diff3'
import { describe, expect, it } from 'vitest'
import { merge3, unionLines } from './merge'

describe('bounded transcript merging', () => {
  const transcript = `# Meeting\n\n${'A repeated transcript line.\n\n'.repeat(4000)}`

  it('keeps the existing conflict behavior for small, unambiguous edits', () => {
    const base = Array.from({ length: 7 }, (_, i) => `line ${i}`)
    for (let a = 0; a < base.length; a++)
      for (let b = 0; b < base.length; b++) {
        const ours = base.map((line, i) => (i === a ? 'local' : line))
        const theirs = base.map((line, i) => (i === b ? 'remote' : line))
        const previous = merge(ours, base, theirs)
        expect(merge3(ours.join('\n'), base.join('\n'), theirs.join('\n'))).toBe(
          previous.conflict ? null : previous.result.join('\n'),
        )
      }
  })

  it('merges changes at opposite ends of a long repetitive note', () => {
    expect(merge3(`local\n${transcript}`, transcript, `${transcript}\nremote`)).toBe(
      `local\n${transcript}\nremote`,
    )
    expect(merge3(`${transcript}\nremote`, transcript, `local\n${transcript}`)).toBe(
      `local\n${transcript}\nremote`,
    )
  })

  it('still reports true conflicts after trimming long common context', () => {
    const base = `${transcript}same line\n${transcript}`
    expect(
      merge3(`${transcript}mine\n${transcript}`, base, `${transcript}theirs\n${transcript}`),
    ).toBeNull()
  })

  it('preserves a conflict copy rather than running an unbounded ambiguous diff', () => {
    const base = `start\n${transcript}\nend`
    const ours = `mine\n${transcript}\nmy end`
    const theirs = `theirs\n${transcript}\ntheir end`
    expect(merge3(ours, base, theirs)).toBeNull()
  })

  it('keeps small interleaved edits mergeable', () => {
    const base = 'a\nb\nc\nd\ne'
    expect(merge3('A\nb\nc\nd\nE', base, 'a\nb\nC\nd\ne')).toBe('A\nb\nC\nd\nE')
  })

  it('unions identical transcripts and appended daily entries without a large diff', () => {
    expect(unionLines(transcript, transcript)).toBe(transcript)
    expect(unionLines(`${transcript}\nfirst`, `${transcript}\nsecond`)).toBe(
      `${transcript}\nfirst\nsecond`,
    )
  })

  it('retains both daily versions when their middle is too costly to align', () => {
    const left = `mine\n${transcript}\nmy end`
    const right = `theirs\n${transcript}\ntheir end`
    const result = unionLines(left, right)
    expect(result).toContain(left)
    expect(result).toContain(right)
  })
})
