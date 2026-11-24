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

export function isExtensionMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const t = (value as { type?: unknown }).type
  return t === 'social-save' || t === 'unpair' || t === 'status'
}

export interface SenderLike {
  id?: string
  tab?: { url?: string }
  url?: string
}

/**
 * Validates runtime message senders:
 * - Always requires `sender.id === runtimeId` (rejects external extensions/pages).
 * - Content-script `social-save` messages must come from an HTTPS tab.
 * - Privileged messages (`status`, `unpair`, etc.) are restricted to extension pages (never web tabs):
 *   either no `sender.tab` (popup/embedded options) or an extension-origin tab (`chrome-extension://<id>/`).
 */
export function isAllowedSender(
  message: Message,
  sender: SenderLike,
  runtimeId: string,
  extensionOrigin: string,
): boolean {
  if (!runtimeId || sender.id !== runtimeId) return false
  if (message.type === 'social-save') {
    const url = sender.url ?? sender.tab?.url ?? ''
    return Boolean(sender.tab) && url.startsWith('https://')
  }
  if (!sender.tab) return true
  const pageUrl = sender.url ?? sender.tab.url ?? ''
  return Boolean(extensionOrigin) && pageUrl.startsWith(extensionOrigin)
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
