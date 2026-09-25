import { describe, expect, it } from 'vitest'
import { matchesHotkey } from './hotkeys'

const ev = (
  key: string,
  m: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...m,
})

describe('matchesHotkey', () => {
  it('uses Ctrl as the modifier on Windows/Linux', () => {
    expect(matchesHotkey(ev('j', { ctrlKey: true }), { key: 'j', mod: true }, false)).toBe(true)
    expect(matchesHotkey(ev('j', { metaKey: true }), { key: 'j', mod: true }, false)).toBe(false)
  })

  it('uses ⌘ as the modifier on Apple platforms', () => {
    expect(matchesHotkey(ev('j', { metaKey: true }), { key: 'j', mod: true }, true)).toBe(true)
    expect(matchesHotkey(ev('j', { ctrlKey: true }), { key: 'j', mod: true }, true)).toBe(false)
  })

  it('is case-insensitive and rejects extra modifiers', () => {
    expect(matchesHotkey(ev('J', { ctrlKey: true }), { key: 'j', mod: true }, false)).toBe(true)
    expect(
      matchesHotkey(ev('j', { ctrlKey: true, altKey: true }), { key: 'j', mod: true }, false),
    ).toBe(false)
    expect(
      matchesHotkey(ev('j', { ctrlKey: true, shiftKey: true }), { key: 'j', mod: true }, false),
    ).toBe(false)
  })
})
