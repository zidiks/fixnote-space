import { isApple } from '@fixnote/ui'

/** An editor shortcut as the platform writes it: `⇧⌘S` on macOS, `Ctrl+Shift+S` elsewhere. */
export function combo(key: string, opts: { shift?: boolean; alt?: boolean } = {}) {
  if (isApple) return `${opts.alt ? '⌥' : ''}${opts.shift ? '⇧' : ''}⌘${key}`
  return ['Ctrl', opts.alt && 'Alt', opts.shift && 'Shift', key].filter(Boolean).join('+')
}
