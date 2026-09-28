import { describe, expect, it } from 'vitest'
import { assignColors, colorFor, initials } from './people'

describe('live people', () => {
  it('takes one or two letters from an email', () => {
    expect(initials('bob.smith@x.io')).toBe('BS')
    expect(initials('ann@x.io')).toBe('AN')
    expect(initials('z@x.io')).toBe('Z')
    expect(initials('zidiks228@gmail.com')).toBe('ZI')
    expect(initials('')).toBe('?')
  })

  it('gives a person the same colour every time', () => {
    expect(colorFor('user-1')).toBe(colorFor('user-1'))
    expect(colorFor('user-1')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('never gives two people in a note the same colour, and every device agrees', () => {
    // Find two accounts whose own colours clash.
    const ids = Array.from({ length: 200 }, (_, i) => `user-${i}`)
    const a = ids[0] as string
    const b = ids.find((id) => id !== a && colorFor(id) === colorFor(a)) as string
    const colors = assignColors([a, b])
    expect(colors.get(a)).not.toBe(colors.get(b))
    // Same people in any order, or one of them twice (two devices): the same colours.
    expect(assignColors([b, a, b])).toEqual(colors)
    // Alone, a person has their own colour.
    expect(assignColors([b]).get(b)).toBe(colorFor(b))
    // Ten people, ten colours.
    expect(new Set(assignColors(ids.slice(0, 10)).values()).size).toBe(10)
  })
})
