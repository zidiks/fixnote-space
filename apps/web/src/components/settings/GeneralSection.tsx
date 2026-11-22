import { APP_ICONS, type AppIcon } from '@fixnote/core'
import {
  currentLanguage,
  i18n,
  LANGUAGE_NAMES,
  type Language,
  SUPPORTED_LANGUAGES,
  useTranslation,
} from '@fixnote/i18n'
import { Logo, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'
import { useState } from 'react'
import { FONT_MODES, type FontMode, type Theme, useUi } from '../../app/store'
import { APP_ICON, appIconOf, setAppIcon } from '../../lib/app-icon'
import { setLocalOnly, useLlm } from '../../lib/assistant/llm'
import { captureToDaily, VOICE_TO_DAILY } from '../../lib/daily'
import { useDb } from '../../lib/db'
import { kvStore } from '../../lib/kv'
import { usePlatform } from '../../lib/platform'
import { LayoutPicker } from '../LayoutOnboarding'
import { UpdatesSection } from './UpdatesSection'

export function GeneralSection() {
  const { t } = useTranslation()
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const fontMode = useUi((s) => s.fontMode)
  const setFontMode = useUi((s) => s.setFontMode)
  const layout = useUi((s) => s.layout ?? 'assistant')
  const setLayout = useUi((s) => s.setLayout)
  const platform = usePlatform()
  const [lang, setLang] = useState<Language>(currentLanguage())
  const { driver } = useDb()
  const qc = useQueryClient()
  const toDaily = useQuery({
    queryKey: ['kv', VOICE_TO_DAILY],
    queryFn: () => captureToDaily(driver, 'voice'),
  }).data

  return (
    <div className="space-y-5">
      {platform.kind === 'desktop' ? <OfflineModeSetting /> : null}
      <div className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] items-center gap-3">
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
        <label htmlFor="settings-font" className="text-sm text-muted-foreground">
          {t('settings.font')}
        </label>
        <div className="min-w-0 space-y-1.5">
          <Select value={fontMode} onValueChange={(v) => setFontMode(v as FontMode)}>
            <SelectTrigger id="settings-font" className="max-w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`settings.fonts.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t(`settings.fontHints.${fontMode}`)}</p>
        </div>
      </div>
      <div className="max-w-lg space-y-2 pt-1">
        <p className="text-sm text-muted-foreground">{t('layout.setting')}</p>
        <LayoutPicker value={layout} onChange={setLayout} />
      </div>
      {platform.appIcon && <AppIconPicker />}
      <label className="flex max-w-lg items-start gap-3 pt-2">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-brand"
          checked={toDaily ?? false}
          onChange={(e) => {
            const on = e.target.checked
            qc.setQueryData(['kv', VOICE_TO_DAILY], on)
            void kvStore(driver).set(VOICE_TO_DAILY, on ? '1' : '0')
          }}
        />
        <span className="space-y-0.5">
          <span className="block text-sm">{t('daily.voiceToDaily')}</span>
          <span className="block text-sm text-muted-foreground">{t('daily.voiceToDailyBody')}</span>
        </span>
      </label>
      <UpdatesSection />
    </div>
  )
}

function OfflineModeSetting() {
  const { t } = useTranslation()
  const enabled = useLlm((s) => s.localOnly)
  return (
    <label className="flex w-full max-w-xl cursor-pointer items-start gap-3 rounded-lg border bg-card px-3.5 py-3 transition-colors hover:bg-accent/50">
      <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span id="offline-mode-label" className="block text-sm font-semibold">
          {t('settings.offlineMode')}
        </span>
        <span id="offline-mode-description" className="mt-0.5 block text-xs text-muted-foreground">
          {t('aiProvider.localOnlyBody')}
        </span>
      </span>
      <span className="shrink-0">
        <input
          className="peer sr-only"
          type="checkbox"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="offline-mode-label"
          aria-describedby="offline-mode-description"
          checked={enabled}
          onChange={(e) => void setLocalOnly(e.target.checked)}
        />
        <span
          aria-hidden="true"
          className="relative block h-5 w-9 rounded-full border bg-muted transition-colors after:absolute after:inset-y-0 after:left-0.5 after:m-auto after:size-3.5 after:rounded-full after:bg-foreground after:transition-transform peer-checked:border-brand peer-checked:bg-brand/25 peer-checked:after:translate-x-4 peer-checked:after:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
        />
      </span>
    </label>
  )
}

/** The tile and mark colours of each icon (brand/build.mjs, ICON_VARIANTS). */
const ICON_LOOK: Record<AppIcon, { tile: string; ink: string }> = {
  orange: { tile: '#f86c2d', ink: '#fff' },
  dark: { tile: '#161616', ink: '#fff' },
  light: { tile: '#f4f2ee', ink: '#161616' },
}

/** The desktop app's icon on this device: the running app's taskbar and Dock icon. */
function AppIconPicker() {
  const { t } = useTranslation()
  const { driver } = useDb()
  const qc = useQueryClient()
  const current = useQuery({ queryKey: ['kv', APP_ICON], queryFn: () => appIconOf(driver) }).data
  const pick = (icon: AppIcon) => {
    qc.setQueryData(['kv', APP_ICON], icon)
    void setAppIcon(driver, icon).catch(() => undefined)
  }
  return (
    <div className="max-w-lg space-y-2 pt-1">
      <p className="text-sm text-muted-foreground">{t('settings.appIcon')}</p>
      <div className="flex gap-3">
        {APP_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            aria-pressed={current === icon}
            aria-label={t(`settings.appIcons.${icon}`)}
            title={t(`settings.appIcons.${icon}`)}
            onClick={() => pick(icon)}
            className="rounded-[18px] p-1 ring-offset-2 ring-offset-background transition-shadow aria-pressed:ring-2 aria-pressed:ring-brand"
          >
            <span
              className="flex size-14 items-center justify-center rounded-[14px] border border-border"
              style={{ background: ICON_LOOK[icon].tile, color: ICON_LOOK[icon].ink }}
            >
              <Logo variant="mark" height={26} />
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.appIconHint')}</p>
    </div>
  )
}
