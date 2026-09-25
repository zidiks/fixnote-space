import {
  currentLanguage,
  i18n,
  LANGUAGE_NAMES,
  type Language,
  SUPPORTED_LANGUAGES,
  useTranslation,
} from '@fixnote/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { type Theme, useUi } from '../../app/store'
import { CAPTURE_TO_DAILY } from '../../lib/daily'
import { useDb } from '../../lib/db'
import { kvStore } from '../../lib/kv'

export function GeneralSection() {
  const { t } = useTranslation()
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const [lang, setLang] = useState<Language>(currentLanguage())
  const { driver } = useDb()
  const qc = useQueryClient()
  const toDaily = useQuery({
    queryKey: ['kv', CAPTURE_TO_DAILY],
    queryFn: async () => (await kvStore(driver).get(CAPTURE_TO_DAILY)) === '1',
  }).data

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[160px_1fr] items-center gap-3">
        <label htmlFor="settings-language" className="text-sm text-muted-foreground">
          {t('settings.language')}
        </label>
        <Select
          value={lang}
          onValueChange={(v) => {
            setLang(v as Language)
            void i18n.changeLanguage(v)
          }}
        >
          <SelectTrigger id="settings-language" className="max-w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label htmlFor="settings-theme" className="text-sm text-muted-foreground">
          {t('settings.theme')}
        </label>
        <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <SelectTrigger id="settings-theme" className="max-w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['system', 'light', 'dark'] as const).map((th) => (
              <SelectItem key={th} value={th}>
                {t(`settings.themes.${th}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex max-w-lg items-start gap-3 pt-2">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-brand"
          checked={toDaily ?? false}
          onChange={(e) => {
            const on = e.target.checked
            qc.setQueryData(['kv', CAPTURE_TO_DAILY], on)
            void kvStore(driver).set(CAPTURE_TO_DAILY, on ? '1' : '0')
          }}
        />
        <span className="space-y-0.5">
          <span className="block text-sm">{t('daily.toDaily')}</span>
          <span className="block text-sm text-muted-foreground">{t('daily.toDailyBody')}</span>
        </span>
      </label>
    </div>
  )
}
