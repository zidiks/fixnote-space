import {
  currentLanguage,
  i18n,
  LANGUAGE_NAMES,
  type Language,
  SUPPORTED_LANGUAGES,
  useTranslation,
} from '@fixnote/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fixnote/ui'
import { useState } from 'react'
import { type Theme, useUi } from '../../app/store'

export function GeneralSection() {
  const { t } = useTranslation()
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const [lang, setLang] = useState<Language>(currentLanguage())

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
    </div>
  )
}
