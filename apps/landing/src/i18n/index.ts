import { en } from './en'
import { es } from './es'
import { ru } from './ru'
import type { Part, Tone } from './types'

export type { Part, Tone }

export const LANGS = ['ru', 'en', 'es'] as const
export type Lang = (typeof LANGS)[number]
export const DEFAULT_LANG: Lang = 'ru'

/** Names in their own language, for the language switcher. */
export const LANG_NAMES: Record<Lang, string> = { ru: 'Русский', en: 'English', es: 'Español' }
export const HTML_LANG: Record<Lang, string> = { ru: 'ru', en: 'en', es: 'es' }
export const OG_LOCALE: Record<Lang, string> = { ru: 'ru_RU', en: 'en_US', es: 'es_ES' }

export const APP_URL = 'https://app.fixnote.space/'

/** Stable links on this site; public/_redirects sends them to the latest release's files. */
export const DOWNLOADS = {
  windows: '/download/windows',
  macArm: '/download/mac-arm',
  macIntel: '/download/mac-intel',
} as const

/**
 * The Russian copy's shape with every text widened to string: en and es must match it key for key,
 * so a missing translation fails the build.
 */
type Widen<T> = T extends Tone
  ? Tone
  : T extends string
    ? string
    : T extends readonly (infer U)[]
      ? [U] extends [string]
        ? string[]
        : [U] extends [Part]
          ? Part[]
          : Widen<U>[]
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T
export type Dict = Widen<typeof ru>

const DICTS: Record<Lang, Dict> = { ru, en, es }

export const t = (lang: Lang): Dict => DICTS[lang]

/** A site path in the given language: Russian at the root, the others under /en/ and /es/. */
export function localePath(lang: Lang, path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return lang === DEFAULT_LANG ? clean : `/${lang}${clean}`
}

/** The language of a URL path and the path without its language prefix. */
export function splitPath(pathname: string): { lang: Lang; path: string } {
  const match = pathname.match(/^\/(en|es)(\/.*)?$/)
  if (match) return { lang: match[1] as Lang, path: match[2] || '/' }
  return { lang: DEFAULT_LANG, path: pathname || '/' }
}

export const isLang = (value: string | undefined): value is Lang =>
  (LANGS as readonly string[]).includes(value ?? '')
