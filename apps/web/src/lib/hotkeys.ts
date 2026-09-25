import { useEffect } from 'react'

export interface Hotkey {
  /** Lowercase `KeyboardEvent.key`, e.g. 'j', 'k', '\\'. */
  key: string
  /** ⌘ on Apple platforms, Ctrl elsewhere. */
  mod?: boolean
  shift?: boolean
}

const PUNCTUATION_CODES: Record<string, string> = {
  '\\': 'Backslash',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '-': 'Minus',
  '=': 'Equal',
  '`': 'Backquote',
}

/** Physical key (`KeyboardEvent.code`) of a key on the US layout: 'j' → 'KeyJ', '[' → 'BracketLeft'. */
export function physicalCode(key: string): string | undefined {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return PUNCTUATION_CODES[key]
}

/**
 * Matches by the character or by the physical key, so shortcuts work on any keyboard layout
 * (Ctrl+J on a Russian layout reports key "о" but code "KeyJ").
 */
export function matchesHotkey(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  hk: Hotkey,
  apple: boolean,
) {
  const mod = apple ? e.metaKey : e.ctrlKey
  const sameKey =
    e.key.toLowerCase() === hk.key || (e.code !== '' && e.code === physicalCode(hk.key))
  return sameKey && mod === Boolean(hk.mod) && e.shiftKey === Boolean(hk.shift) && !e.altKey
}

export function useHotkey(hk: Hotkey, handler: () => void, apple: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesHotkey(e, hk, apple)) {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hk, handler, apple])
}
