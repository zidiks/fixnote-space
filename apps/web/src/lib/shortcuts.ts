import { isApple } from '@fixnote/ui'
import { useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import {
  type Binding,
  type Bindings,
  bindingLabel,
  defaultBindings,
  GLOBAL_ACTIONS,
  type GlobalAction,
  matchesBinding,
  parseBinding,
  type ShortcutAction,
  serializeBinding,
} from './hotkeys'
import { platform } from './platform'

/** Per device (kv), not synced: `{ bindings: { search: "Mod+KeyK" }, off: { … } }`. */
export const SHORTCUTS_KEY = 'shortcuts'

interface Kv {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

interface Saved {
  bindings?: Partial<Record<ShortcutAction, string>>
  off?: Partial<Record<GlobalAction, boolean>>
}

interface ShortcutsState {
  /** The person's own bindings, as stored. */
  custom: Partial<Record<ShortcutAction, string>>
  /** System-wide shortcuts switched off. */
  off: Partial<Record<GlobalAction, boolean>>
  /** System-wide shortcuts the OS refused (another app holds them), with its message. */
  failed: Partial<Record<GlobalAction, string>>
  /** A shortcut is being recorded: none of them run, the system-wide ones are let go. */
  recording: boolean
  loaded: boolean
}

export const useShortcuts = create<ShortcutsState>(() => ({
  custom: {},
  off: {},
  failed: {},
  recording: false,
  loaded: false,
}))

let kv: Kv | null = null

export const DEFAULTS: Bindings = defaultBindings(isApple, platform.kind === 'desktop')

export async function initShortcuts(store: Kv) {
  kv = store
  let saved: Saved = {}
  try {
    saved = JSON.parse((await store.get(SHORTCUTS_KEY)) ?? '{}') as Saved
  } catch {
    // keep defaults
  }
  useShortcuts.setState({ custom: saved.bindings ?? {}, off: saved.off ?? {}, loaded: true })
}

/** Every action's binding: the person's own, else the default. */
export function bindingsOf(s: Pick<ShortcutsState, 'custom'>): Bindings {
  const out = { ...DEFAULTS }
  for (const [action, text] of Object.entries(s.custom) as [ShortcutAction, string][]) {
    // '' = no shortcut
    out[action] = text === '' ? null : (parseBinding(text, isApple) ?? DEFAULTS[action])
  }
  return out
}

function save() {
  const { custom, off } = useShortcuts.getState()
  void kv?.set(SHORTCUTS_KEY, JSON.stringify({ bindings: custom, off } satisfies Saved))
}

export function setBinding(action: ShortcutAction, b: Binding | null) {
  useShortcuts.setState((s) => ({
    custom: { ...s.custom, [action]: b ? serializeBinding(b) : '' },
  }))
  save()
}

export function resetBinding(action: ShortcutAction) {
  useShortcuts.setState((s) => {
    const { [action]: _, ...custom } = s.custom
    return { custom }
  })
  save()
}

export function setGlobalOn(action: GlobalAction, on: boolean) {
  useShortcuts.setState((s) => {
    const { [action]: _, ...rest } = s.off
    return { off: on ? rest : { ...rest, [action]: true } }
  })
  save()
}

export function resetAllShortcuts() {
  useShortcuts.setState({ custom: {}, off: {} })
  save()
}

/** The system-wide shortcuts to hold now, as `global_shortcuts` takes them. */
export function activeGlobals(s: ShortcutsState): GlobalAction[] {
  if (!s.loaded || s.recording) return []
  const bindings = bindingsOf(s)
  return GLOBAL_ACTIONS.filter((a) => !s.off[a] && bindings[a])
}

export function useBinding(action: ShortcutAction): Binding | null {
  const text = useShortcuts((s) => s.custom[action])
  return useMemo(() => {
    if (text === undefined) return DEFAULTS[action]
    return text === '' ? null : (parseBinding(text, isApple) ?? DEFAULTS[action])
  }, [text, action])
}

/** `⌘K` / `Ctrl+K` for an action's current shortcut, or undefined when it has none. */
export function useShortcutLabel(action: ShortcutAction): string | undefined {
  const b = useBinding(action)
  return b ? bindingLabel(b, isApple) : undefined
}

/** Runs `handler` when the action's shortcut is pressed anywhere in the app. */
export function useShortcut(action: ShortcutAction, handler: () => void) {
  const b = useBinding(action)
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!b) return
    const onKey = (e: KeyboardEvent) => {
      if (useShortcuts.getState().recording) return
      if (matchesBinding(e, b, isApple)) {
        e.preventDefault()
        latest.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [b])
}
