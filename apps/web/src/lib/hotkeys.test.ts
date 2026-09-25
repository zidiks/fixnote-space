import { describe, expect, it } from 'vitest'
import { matchesHotkey } from './hotkeys'

const ev = (
  key: string,
  m: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {},
  code = '',
) => ({
  key,
  code,
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

  it('works on any keyboard layout by physical key', () => {
    // Russian layout: Ctrl+J types "о", Ctrl+\ types "\\", Ctrl+[ types "х"
    expect(matchesHotkey(ev('о', { ctrlKey: true }, 'KeyJ'), { key: 'j', mod: true }, false)).toBe(
      true,
    )
    expect(
      matchesHotkey(ev('х', { ctrlKey: true }, 'BracketLeft'), { key: '[', mod: true }, false),
    ).toBe(true)
    expect(matchesHotkey(ev('о', { ctrlKey: true }, 'KeyJ'), { key: 'k', mod: true }, false)).toBe(
      false,
    )
    // Dvorak: the key labelled K sits where QWERTY has V; the character wins
    expect(matchesHotkey(ev('k', { ctrlKey: true }, 'KeyV'), { key: 'k', mod: true }, false)).toBe(
      true,
    )
  })
})
