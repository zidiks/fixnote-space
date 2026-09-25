import { i18n } from '@fixnote/i18n'

/** First line of a conflict copy, in the interface language. */
export function conflictHeading(at: number): string {
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at)
  return i18n.t('sync.conflictCopy', { date })
}
