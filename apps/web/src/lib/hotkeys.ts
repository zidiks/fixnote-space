/**
 * Keyboard shortcuts the person can change (Settings → Shortcuts): in-app ones, and on the
 * desktop system-wide ones that work while FixNote is hidden or another app is in front.
 * A binding names the physical key (`KeyboardEvent.code`), so it works in any layout: Ctrl+K on
 * a Russian layout reports key "л" but code "KeyK".
 *
 * Modifiers: `mod` is ⌘ on Apple platforms and Ctrl elsewhere; `ctrl` is the Control key on Apple
 * platforms only (elsewhere it is `mod`). Stored as text per device: "Mod+Shift+Space".
 */

export interface Binding {
  code: string
  mod?: boolean
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
}

export const APP_ACTIONS = [
  'search',
  'newNote',
  'today',
  'voice',
  'chat',
  'sidebar',
  'back',
  'forward',
] as const
export type AppAction = (typeof APP_ACTIONS)[number]

export const GLOBAL_ACTIONS = [
  'global.newNote',
  'global.voice',
  'global.search',
  'global.toggle',
] as const
export type GlobalAction = (typeof GLOBAL_ACTIONS)[number]

export type ShortcutAction = AppAction | GlobalAction

export const isGlobal = (action: ShortcutAction): action is GlobalAction =>
  action.startsWith('global.')

/** The tray action a system-wide shortcut runs (tray.rs `chosen`, `DesktopTray`). */
export const TRAY_ACTION: Record<GlobalAction, string> = {
  'global.newNote': 'new-note',
  'global.voice': 'voice',
  'global.search': 'search',
  'global.toggle': 'toggle',
}

export type Bindings = Record<ShortcutAction, Binding | null>

/**
 * Defaults. In the app: Mod+key as before. System-wide: Ctrl+Alt (⌃⌥ on a Mac) with a letter,
 * a pair no OS shortcut uses on Windows or macOS and few apps take; Ctrl/⌘+Shift is left to
 * apps, ⌥⌘Space is Finder search, Win+… belongs to Windows. The browser keeps Ctrl/⌘+N for a new
 * window, so on the web "new note" has no shortcut until the person picks one.
 */
export function defaultBindings(apple: boolean, desktop: boolean): Bindings {
  const sys = (code: string): Binding =>
    apple ? { code, ctrl: true, alt: true } : { code, mod: true, alt: true }
  return {
    search: { code: 'KeyK', mod: true },
    newNote: desktop ? { code: 'KeyN', mod: true } : null,
    today: { code: 'KeyD', mod: true },
    voice: { code: 'Space', mod: true, shift: true },
    chat: { code: 'KeyJ', mod: true },
    sidebar: { code: 'Backslash', mod: true },
    back: { code: 'BracketLeft', mod: true },
    forward: { code: 'BracketRight', mod: true },
    'global.newNote': sys('KeyN'),
    'global.voice': sys('KeyR'),
    'global.search': sys('KeyK'),
    'global.toggle': sys('Space'),
  }
}

const PUNCTUATION: Record<string, string> = {
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
}

const NAMED = [
  'Space',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'Delete',
]

const isFunctionKey = (code: string) => /^F([1-9]|1[0-2])$/.test(code)

/** A key a shortcut may use (not a modifier, Escape, Tab or Backspace). */
export function isShortcutKey(code: string): boolean {
  return (
    /^Key[A-Z]$/.test(code) ||
    /^Digit[0-9]$/.test(code) ||
    /^Numpad[0-9]$/.test(code) ||
    isFunctionKey(code) ||
    code in PUNCTUATION ||
    NAMED.includes(code)
  )
}

/** The character of a key on the US layout: 'KeyJ' → 'j', 'BracketLeft' → '['. */
export function usChar(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (code === 'Space') return ' '
  return PUNCTUATION[code]
}

/** "Mod+Alt+Shift+KeyN": modifiers in a fixed order, then the key. */
export function serializeBinding(b: Binding): string {
  return [b.mod && 'Mod', b.ctrl && 'Ctrl', b.alt && 'Alt', b.shift && 'Shift', b.code]
    .filter(Boolean)
    .join('+')
}

/** Reads a stored binding; anything unknown is null. Off Apple platforms Ctrl is Mod. */
export function parseBinding(text: string, apple: boolean): Binding | null {
  const parts = text.split('+')
  const code = parts.pop()
  if (!code || !isShortcutKey(code)) return null
  const b: Binding = { code }
  for (const part of parts) {
    if (part === 'Mod') b.mod = true
    else if (part === 'Ctrl') {
      if (apple) b.ctrl = true
      else b.mod = true
    } else if (part === 'Alt') b.alt = true
    else if (part === 'Shift') b.shift = true
    else return null
  }
  return b
}

export function sameBinding(a: Binding | null, b: Binding | null): boolean {
  if (!a || !b) return a === b
  return serializeBinding(a) === serializeBinding(b)
}

const ARROWS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
}

function keyLabel(code: string, apple: boolean): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`
  if (code === 'Enter') return apple ? '↩' : 'Enter'
  if (code === 'Delete') return apple ? '⌦' : 'Del'
  if (code === 'PageUp') return 'PgUp'
  if (code === 'PageDown') return 'PgDn'
  if (code === 'Insert') return 'Ins'
  return ARROWS[code] ?? PUNCTUATION[code] ?? code
}

/** `⌃⌥⇧⌘K` on Apple platforms, `Ctrl+Alt+Shift+K` elsewhere. */
export function bindingLabel(b: Binding, apple: boolean): string {
  const key = keyLabel(b.code, apple)
  if (apple) {
    return `${b.ctrl ? '⌃' : ''}${b.alt ? '⌥' : ''}${b.shift ? '⇧' : ''}${b.mod ? '⌘' : ''}${key}`
  }
  return [b.mod && 'Ctrl', b.alt && 'Alt', b.shift && 'Shift', key].filter(Boolean).join('+')
}

type KeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

/** The binding a key press makes, while recording; null for a lone modifier or another key. */
export function bindingFromEvent(e: KeyEvent, apple: boolean): Binding | null {
  // The Windows key belongs to Windows.
  if (!isShortcutKey(e.code) || (!apple && e.metaKey)) return null
  const b: Binding = { code: e.code }
  if (apple ? e.metaKey : e.ctrlKey) b.mod = true
  if (apple && e.ctrlKey) b.ctrl = true
  if (e.altKey) b.alt = true
  if (e.shiftKey) b.shift = true
  return b
}

/**
 * Matches by the physical key, or by the character on layouts that move letters (Dvorak: the
 * key labelled K sits where QWERTY has V, and the character wins). Extra modifiers never match.
 */
export function matchesBinding(e: KeyEvent, b: Binding | null, apple: boolean): boolean {
  if (!b) return false
  const char = usChar(b.code)
  const sameKey = e.code === b.code || (char !== undefined && e.key.toLowerCase() === char)
  if (!sameKey) return false
  const mod = apple ? e.metaKey : e.ctrlKey
  const ctrl = apple ? e.ctrlKey : false
  if (!apple && e.metaKey) return false
  return (
    mod === Boolean(b.mod) &&
    ctrl === Boolean(b.ctrl) &&
    e.altKey === Boolean(b.alt) &&
    e.shiftKey === Boolean(b.shift)
  )
}

/** What the global-shortcut plugin reads (tauri-plugin-global-shortcut): "Control+Alt+KeyN". */
export function accelerator(b: Binding, apple: boolean): string {
  return [
    b.mod && (apple ? 'Super' : 'Control'),
    b.ctrl && 'Control',
    b.alt && 'Alt',
    b.shift && 'Shift',
    b.code,
  ]
    .filter(Boolean)
    .join('+')
}

/** Kept by the editor (copy, paste, undo, formatting, headings, lists) and by search (Mod+F). */
const EDITOR_KEYS = [
  'Mod+KeyA',
  'Mod+KeyB',
  'Mod+KeyC',
  'Mod+KeyE',
  'Mod+KeyF',
  'Mod+KeyI',
  'Mod+KeyU',
  'Mod+KeyV',
  'Mod+KeyX',
  'Mod+KeyY',
  'Mod+KeyZ',
  'Mod+Shift+KeyZ',
  'Mod+Shift+KeyE',
  'Mod+Shift+KeyS',
  'Mod+Shift+KeyV',
  'Mod+Shift+Digit7',
  'Mod+Shift+Digit8',
  'Mod+Shift+Digit9',
  'Mod+Enter',
  ...[1, 2, 3, 4, 5, 6].map((n) => `Mod+Alt+Digit${n}`),
]

/** The browser never hands these to a page. */
const BROWSER_KEYS = [
  'Mod+KeyN',
  'Mod+KeyT',
  'Mod+KeyW',
  'Mod+Shift+KeyN',
  'Mod+Shift+KeyT',
  'Mod+Shift+KeyW',
]

/** The OS takes these before any app sees them. */
const SYSTEM_KEYS = {
  apple: [
    'Mod+KeyQ',
    'Mod+KeyH',
    'Mod+KeyM',
    'Mod+Space',
    'Ctrl+Space',
    'Mod+Alt+Space',
    'Mod+Ctrl+Space',
    'Mod+Shift+Digit3',
    'Mod+Shift+Digit4',
    'Mod+Shift+Digit5',
    'Mod+Shift+KeyQ',
    'Mod+Ctrl+KeyQ',
    'Mod+Ctrl+KeyF',
    'Mod+Alt+KeyD',
  ],
  other: ['Mod+Alt+Delete', 'Mod+Shift+Escape', 'Alt+F4', 'Alt+Space'],
}

export type BindingProblem =
  /** Needs Ctrl/⌘ (in the app) or two modifiers (system-wide), so typing never triggers it. */
  | { kind: 'modifier' }
  /** The OS, the browser or the editor keeps it. */
  | { kind: 'reserved' }
  /** Another action already has it. */
  | { kind: 'taken'; by: ShortcutAction }

export interface BindingContext {
  apple: boolean
  desktop: boolean
  /** Every action's current binding; a system-wide one that is switched off takes nothing. */
  bindings: Partial<Bindings>
  off?: Partial<Record<GlobalAction, boolean>>
}

/** Why `b` cannot be the shortcut for `action`, or null when it can. */
export function bindingProblem(
  action: ShortcutAction,
  b: Binding,
  ctx: BindingContext,
): BindingProblem | null {
  const global = isGlobal(action)
  const strong = Boolean(b.mod || b.ctrl)
  const count = [b.mod, b.ctrl, b.alt, b.shift].filter(Boolean).length
  if (global) {
    const ok = isFunctionKey(b.code) ? count >= 1 : count >= 2 && (strong || Boolean(b.alt))
    if (!ok) return { kind: 'modifier' }
  } else if (!strong && !isFunctionKey(b.code)) {
    return { kind: 'modifier' }
  }
  const text = serializeBinding(b)
  const reserved = [
    ...EDITOR_KEYS,
    ...(ctx.apple ? SYSTEM_KEYS.apple : SYSTEM_KEYS.other),
    ...(ctx.desktop ? [] : BROWSER_KEYS),
  ]
  if (reserved.includes(text)) return { kind: 'reserved' }
  for (const [other, ob] of Object.entries(ctx.bindings) as [ShortcutAction, Binding | null][]) {
    if (other === action || !ob) continue
    if (isGlobal(other) && (!ctx.desktop || ctx.off?.[other])) continue
    if (sameBinding(ob, b)) return { kind: 'taken', by: other }
  }
  return null
}
