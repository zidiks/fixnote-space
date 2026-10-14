import { describe, expect, it } from 'vitest'
import {
  accelerator,
  type Binding,
  bindingFromEvent,
  bindingLabel,
  bindingProblem,
  defaultBindings,
  GLOBAL_ACTIONS,
  matchesBinding,
  parseBinding,
  serializeBinding,
} from './hotkeys'

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

const modJ: Binding = { code: 'KeyJ', mod: true }

describe('matchesBinding', () => {
  it('uses Ctrl as the modifier on Windows/Linux', () => {
    expect(matchesBinding(ev('j', { ctrlKey: true }, 'KeyJ'), modJ, false)).toBe(true)
    expect(matchesBinding(ev('j', { metaKey: true }, 'KeyJ'), modJ, false)).toBe(false)
  })

  it('uses ⌘ as the modifier on Apple platforms, Control apart from it', () => {
    expect(matchesBinding(ev('j', { metaKey: true }, 'KeyJ'), modJ, true)).toBe(true)
    expect(matchesBinding(ev('j', { ctrlKey: true }, 'KeyJ'), modJ, true)).toBe(false)
    const ctrlJ = { code: 'KeyJ', ctrl: true }
    expect(matchesBinding(ev('j', { ctrlKey: true }, 'KeyJ'), ctrlJ, true)).toBe(true)
    expect(matchesBinding(ev('j', { ctrlKey: true, metaKey: true }, 'KeyJ'), ctrlJ, true)).toBe(
      false,
    )
  })

  it('is case-insensitive and rejects extra or missing modifiers', () => {
    expect(matchesBinding(ev('J', { ctrlKey: true }), modJ, false)).toBe(true)
    expect(matchesBinding(ev('j', { ctrlKey: true, altKey: true }, 'KeyJ'), modJ, false)).toBe(
      false,
    )
    expect(matchesBinding(ev('j', { ctrlKey: true, shiftKey: true }, 'KeyJ'), modJ, false)).toBe(
      false,
    )
    const withAlt = { code: 'KeyJ', mod: true, alt: true }
    expect(matchesBinding(ev('j', { ctrlKey: true }, 'KeyJ'), withAlt, false)).toBe(false)
    expect(matchesBinding(ev('j', { ctrlKey: true, altKey: true }, 'KeyJ'), withAlt, false)).toBe(
      true,
    )
  })

  it('works on any keyboard layout by physical key', () => {
    // Russian layout: Ctrl+J types "о", Ctrl+[ types "х"
    expect(matchesBinding(ev('о', { ctrlKey: true }, 'KeyJ'), modJ, false)).toBe(true)
    expect(
      matchesBinding(
        ev('х', { ctrlKey: true }, 'BracketLeft'),
        { code: 'BracketLeft', mod: true },
        false,
      ),
    ).toBe(true)
    expect(
      matchesBinding(ev('о', { ctrlKey: true }, 'KeyJ'), { code: 'KeyK', mod: true }, false),
    ).toBe(false)
    // Dvorak: the key labelled K sits where QWERTY has V; the character wins
    expect(
      matchesBinding(ev('k', { ctrlKey: true }, 'KeyV'), { code: 'KeyK', mod: true }, false),
    ).toBe(true)
  })

  it('follows a custom binding recorded on another layout', () => {
    // Recorded on a Spanish layout: Ctrl+Alt+Ñ is the Semicolon key.
    const b = bindingFromEvent(ev('ñ', { ctrlKey: true, altKey: true }, 'Semicolon'), false)
    expect(b).toEqual({ code: 'Semicolon', mod: true, alt: true })
    // Pressed on a Russian layout, the same key types "ж".
    expect(matchesBinding(ev('ж', { ctrlKey: true, altKey: true }, 'Semicolon'), b, false)).toBe(
      true,
    )
    expect(matchesBinding(ev('ж', { ctrlKey: true }, 'Semicolon'), b, false)).toBe(false)
  })

  it('never matches without a binding', () => {
    expect(matchesBinding(ev('n', { ctrlKey: true }, 'KeyN'), null, false)).toBe(false)
  })
})

describe('parse and serialize', () => {
  it('round-trips with modifiers in a fixed order', () => {
    const b = { code: 'Space', shift: true, mod: true }
    expect(serializeBinding(b)).toBe('Mod+Shift+Space')
    expect(parseBinding('Mod+Shift+Space', false)).toEqual({
      code: 'Space',
      mod: true,
      shift: true,
    })
    expect(serializeBinding(parseBinding('Shift+Alt+Ctrl+Mod+KeyN', true) as Binding)).toBe(
      'Mod+Ctrl+Alt+Shift+KeyN',
    )
  })

  it('reads Ctrl as Mod off Apple platforms', () => {
    expect(parseBinding('Ctrl+Alt+KeyN', false)).toEqual({ code: 'KeyN', mod: true, alt: true })
    expect(parseBinding('Ctrl+Alt+KeyN', true)).toEqual({ code: 'KeyN', ctrl: true, alt: true })
  })

  it('rejects unknown keys and modifiers', () => {
    expect(parseBinding('Mod+Hyper+KeyN', false)).toBeNull()
    expect(parseBinding('Mod+Escape', false)).toBeNull()
    expect(parseBinding('Mod+', false)).toBeNull()
    expect(parseBinding('', false)).toBeNull()
  })

  it('records presses, not lone modifiers or the Windows key', () => {
    expect(bindingFromEvent(ev('Control', { ctrlKey: true }, 'ControlLeft'), false)).toBeNull()
    expect(bindingFromEvent(ev('k', { ctrlKey: true, metaKey: true }, 'KeyK'), false)).toBeNull()
    expect(bindingFromEvent(ev('k', { metaKey: true, ctrlKey: true }, 'KeyK'), true)).toEqual({
      code: 'KeyK',
      mod: true,
      ctrl: true,
    })
  })

  it('labels per platform', () => {
    const b = { code: 'KeyN', mod: true, alt: true, shift: true }
    expect(bindingLabel(b, false)).toBe('Ctrl+Alt+Shift+N')
    expect(bindingLabel(b, true)).toBe('⌥⇧⌘N')
    expect(bindingLabel({ code: 'Space', ctrl: true, alt: true }, true)).toBe('⌃⌥Space')
    expect(bindingLabel({ code: 'Backslash', mod: true }, false)).toBe('Ctrl+\\')
  })

  it('names keys for the global-shortcut plugin', () => {
    expect(accelerator({ code: 'KeyN', mod: true, alt: true }, false)).toBe('Control+Alt+KeyN')
    expect(accelerator({ code: 'KeyN', ctrl: true, alt: true }, true)).toBe('Control+Alt+KeyN')
    expect(accelerator({ code: 'Space', mod: true, shift: true }, true)).toBe('Super+Shift+Space')
  })
})

describe('bindingProblem', () => {
  const ctx = (apple: boolean, desktop = true) => ({
    apple,
    desktop,
    bindings: defaultBindings(apple, desktop),
  })

  it('accepts the defaults on every platform', () => {
    for (const apple of [false, true]) {
      for (const desktop of [false, true]) {
        const c = ctx(apple, desktop)
        for (const [action, b] of Object.entries(c.bindings)) {
          if (b) expect(bindingProblem(action as keyof typeof c.bindings, b, c)).toBeNull()
        }
      }
    }
  })

  it('finds another action with the same keys', () => {
    expect(bindingProblem('chat', { code: 'KeyK', mod: true }, ctx(false))).toEqual({
      kind: 'taken',
      by: 'search',
    })
    // A system-wide shortcut also takes the keys inside the app.
    expect(bindingProblem('chat', { code: 'KeyN', mod: true, alt: true }, ctx(false))).toEqual({
      kind: 'taken',
      by: 'global.newNote',
    })
    expect(
      bindingProblem('global.voice', { code: 'Space', mod: true, alt: true }, ctx(false)),
    ).toEqual({ kind: 'taken', by: 'global.toggle' })
  })

  it('ignores system-wide shortcuts that are off, and all of them on the web', () => {
    const b = { code: 'KeyN', mod: true, alt: true }
    expect(bindingProblem('chat', b, { ...ctx(false), off: { 'global.newNote': true } })).toBeNull()
    expect(bindingProblem('chat', b, ctx(false, false))).toBeNull()
  })

  it('keeps reserved keys', () => {
    expect(bindingProblem('chat', { code: 'KeyC', mod: true }, ctx(false))).toEqual({
      kind: 'reserved',
    })
    expect(bindingProblem('chat', { code: 'KeyQ', mod: true }, ctx(true))).toEqual({
      kind: 'reserved',
    })
    expect(bindingProblem('chat', { code: 'KeyQ', mod: true }, ctx(false))).toBeNull()
    // The browser keeps Ctrl+N; the desktop app may take it.
    expect(bindingProblem('newNote', { code: 'KeyN', mod: true }, ctx(false, false))).toEqual({
      kind: 'reserved',
    })
    expect(
      bindingProblem('global.search', { code: 'Space', mod: true, alt: true }, ctx(true)),
    ).toEqual({ kind: 'reserved' })
  })

  it('wants a modifier in the app and two system-wide', () => {
    expect(bindingProblem('chat', { code: 'KeyJ' }, ctx(false))).toEqual({ kind: 'modifier' })
    expect(bindingProblem('chat', { code: 'KeyJ', shift: true }, ctx(false))).toEqual({
      kind: 'modifier',
    })
    expect(bindingProblem('chat', { code: 'F2' }, ctx(false))).toBeNull()
    expect(bindingProblem('global.search', { code: 'KeyL', mod: true }, ctx(false))).toEqual({
      kind: 'modifier',
    })
    expect(
      bindingProblem('global.search', { code: 'KeyL', shift: true, alt: true }, ctx(false)),
    ).toBeNull()
    expect(bindingProblem('global.search', { code: 'F9', alt: true }, ctx(false))).toBeNull()
    expect(bindingProblem('global.search', { code: 'F9' }, ctx(false))).toEqual({
      kind: 'modifier',
    })
  })

  it('has system-wide defaults with two modifiers', () => {
    for (const apple of [false, true]) {
      const d = defaultBindings(apple, true)
      for (const a of GLOBAL_ACTIONS) {
        expect([d[a]?.mod, d[a]?.ctrl, d[a]?.alt].filter(Boolean)).toHaveLength(2)
      }
    }
  })
})
