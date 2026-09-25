import { useEffect } from 'react'

export interface Hotkey {
  /** Lowercase `KeyboardEvent.key`, e.g. 'j', 'k', '\\'. */
  key: string
  /** ⌘ on Apple platforms, Ctrl elsewhere. */
  mod?: boolean
  shift?: boolean
}

export function matchesHotkey(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  hk: Hotkey,
  apple: boolean,
) {
  const mod = apple ? e.metaKey : e.ctrlKey
  return (
    e.key.toLowerCase() === hk.key &&
    mod === Boolean(hk.mod) &&
    e.shiftKey === Boolean(hk.shift) &&
    !e.altKey
  )
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
