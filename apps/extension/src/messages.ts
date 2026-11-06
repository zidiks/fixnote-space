import type { Pairing } from './api'
import type { SavedPost } from './sites'

/** What the content scripts and the options page ask the service worker. */
export type Message =
  | { type: 'social-save'; source: string; post: SavedPost }
  | { type: 'unpair' }
  | { type: 'status' }

export interface Answer {
  ok: boolean
  pairing?: Pairing | null
  error?: string
}

/** A text from _locales in the browser's language (en, ru, es). */
export const msg = (name: string, sub?: string) => chrome.i18n.getMessage(name, sub) || name

/** "Chrome on Windows": the label the app shows for this connection. */
export function browserLabel(): string {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /YaBrowser\//.test(ua)
        ? 'Yandex Browser'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Chrome'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Linux/.test(ua)
          ? 'Linux'
          : ''
  return os ? `${browser} · ${os}` : browser
}
