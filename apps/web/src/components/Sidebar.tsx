import {
  currentLanguage,
  i18n,
  LANGUAGE_NAMES,
  type Language,
  SUPPORTED_LANGUAGES,
  useTranslation,
} from '@fixnote/i18n'
import { appInfo } from '@fixnote/platform-tauri'
import {
  Button,
  cn,
  Kbd,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  shortcutLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Clock,
  Cloud,
  CloudOff,
  Inbox,
  Monitor,
  PanelLeftClose,
  Search,
  Settings,
  SquarePen,
} from 'lucide-react'
import { useState } from 'react'
import { type Theme, useUi } from '../app/store'
import { isSupabaseConfigured } from '../lib/env'
import { usePlatform } from '../lib/platform'

function NavItem({
  icon: Icon,
  label,
  active,
  count,
}: {
  icon: typeof Inbox
  label: string
  active?: boolean
  count?: number
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13.5px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
        active && 'bg-sidebar-accent font-medium text-foreground',
      )}
    >
      <Icon className="size-4 opacity-70" />
      <span className="flex-1 truncate text-left">{label}</span>
      {count ? <span className="text-xs text-muted-foreground tabular-nums">{count}</span> : null}
    </button>
  )
}

function Section({ title, empty }: { title: string; empty: string }) {
  return (
    <div className="mt-5">
      <div className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <p className="px-2.5 text-xs leading-relaxed text-muted-foreground/80">{empty}</p>
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const drafts = useUi((s) => s.drafts.length)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div data-tauri-drag-region className="flex h-12 items-center justify-between px-3">
        <span className="text-sm font-semibold tracking-tight">{t('app.name')}</span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t('sidebar.newNote')}>
                <SquarePen />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('sidebar.newNote')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={toggleSidebar}
                aria-label={t('sidebar.collapse')}
              >
                <PanelLeftClose />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t('sidebar.collapse')}{' '}
              <Kbd className="border-transparent bg-primary-foreground/15 text-primary-foreground">
                {shortcutLabel('\\')}
              </Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="px-2">
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-background"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">{t('sidebar.search')}</span>
          <Kbd>{shortcutLabel('K')}</Kbd>
        </button>
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto px-2">
        <NavItem icon={Inbox} label={t('sidebar.inbox')} active count={drafts} />
        <NavItem icon={CalendarDays} label={t('sidebar.daily')} />
        <NavItem icon={Clock} label={t('sidebar.recents')} />
        <Section title={t('sidebar.folders')} empty={t('sidebar.noFolders')} />
        <Section title={t('sidebar.tags')} empty={t('sidebar.noTags')} />
      </nav>

      {settingsOpen ? <SettingsPanel /> : null}
      <SidebarFooter onSettings={() => setSettingsOpen((v) => !v)} settingsOpen={settingsOpen} />
    </aside>
  )
}

function SettingsPanel() {
  const { t } = useTranslation()
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const [lang, setLang] = useState<Language>(currentLanguage())

  return (
    <div className="mx-2 mb-2 space-y-3 rounded-lg border border-sidebar-border bg-background p-3">
      <div className="space-y-1.5">
        <label htmlFor="settings-language" className="text-xs text-muted-foreground">
          {t('settings.language')}
        </label>
        <Select
          value={lang}
          onValueChange={(v) => {
            setLang(v as Language)
            void i18n.changeLanguage(v)
          }}
        >
          <SelectTrigger id="settings-language">
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
      </div>
      <div className="space-y-1.5">
        <label htmlFor="settings-theme" className="text-xs text-muted-foreground">
          {t('settings.theme')}
        </label>
        <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <SelectTrigger id="settings-theme">
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

function SidebarFooter({
  onSettings,
  settingsOpen,
}: {
  onSettings: () => void
  settingsOpen: boolean
}) {
  const { t } = useTranslation()
  const platform = usePlatform()
  const info = useQuery({
    queryKey: ['app-info'],
    queryFn: appInfo,
    enabled: platform.kind === 'desktop',
    staleTime: Number.POSITIVE_INFINITY,
  })

  return (
    <div className="flex h-11 items-center justify-between border-t border-sidebar-border px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1">
              <Monitor className="size-3.5" />
              {platform.kind === 'desktop' ? 'Desktop' : 'Web'}
              {info.data ? <span className="tabular-nums">v{info.data.version}</span> : null}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {info.data ? `${info.data.os} · ${info.data.arch}` : platform.kind}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center">
              {isSupabaseConfigured ? (
                <Cloud className="size-3.5" />
              ) : (
                <CloudOff className="size-3.5" />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {isSupabaseConfigured ? 'Supabase' : t('status.notConfigured')}
          </TooltipContent>
        </Tooltip>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onSettings}
        aria-label={t('sidebar.settings')}
        aria-expanded={settingsOpen}
        className={cn(settingsOpen && 'bg-sidebar-accent')}
      >
        <Settings />
      </Button>
    </div>
  )
}
