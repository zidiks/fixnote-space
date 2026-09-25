import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import es from './locales/es'
import ru from './locales/ru'

export const SUPPORTED_LANGUAGES = ['en', 'es', 'ru'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  ru: 'Русский',
}

export const resources = {
  en: { translation: en },
  es: { translation: es },
  ru: { translation: ru },
} as const

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}

let initialized: Promise<unknown> | null = null

/** Interface language only; the language of note content is independent. */
export function initI18n() {
  initialized ??= i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      supportedLngs: SUPPORTED_LANGUAGES,
      fallbackLng: 'en',
      nonExplicitSupportedLngs: true,
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: 'fixnote.lang',
        caches: ['localStorage'],
      },
    })
  return initialized
}

export function currentLanguage(): Language {
  const lng = i18n.resolvedLanguage ?? 'en'
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lng) ? (lng as Language) : 'en'
}

export { useTranslation } from 'react-i18next'
export { i18n }
