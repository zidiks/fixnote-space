import { describe, expect, it } from 'vitest'
import { colorFor, initials } from './people'

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
})
