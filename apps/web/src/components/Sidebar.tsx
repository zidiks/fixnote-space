import { useTranslation } from '@fixnote/i18n'
import { appInfo } from '@fixnote/platform-tauri'
import {
  Button,
  cn,
  Kbd,
  shortcutLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  CloudAlert,
  CloudCheck,
  CloudOff,
  HardDrive,
  House,
  RefreshCw,
  Search,
  Settings,
  WandSparkles,
} from 'lucide-react'
import { useUi } from '../app/store'
import { useAccount } from '../lib/account/account'
import { useLlm } from '../lib/assistant/llm'
import { useTidy } from '../lib/assistant/tidy'
import { usePlatform } from '../lib/platform'
import { useCounts, useOpenDaily } from '../lib/queries'
import { ProCard } from './ProCard'
import { SidebarFolders } from './SidebarFolders'

function NavItem({
  icon: Icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: typeof House
  label: string
  active?: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'mb-0.5 flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13.5px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
        active && 'bg-sidebar-accent font-medium text-foreground',
      )}
    >
      <Icon className="size-4 opacity-70" />
      <span className="flex-1 truncate text-left">{label}</span>
      {count ? <span className="text-xs text-muted-foreground tabular-nums">{count}</span> : null}
    </button>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const setSpotlightOpen = useUi((s) => s.setSpotlightOpen)
  const route = useUi((s) => s.route)
  const navigate = useUi((s) => s.navigate)
  const counts = useCounts().data
  const openDaily = useOpenDaily()
  const tidyPending = useTidy((s) => s.pending)
  return (
    <aside className="flex h-full w-64 shrink-0 select-none flex-col border-r border-sidebar-border bg-sidebar pt-1">
      <div className="px-2">
        <button
          type="button"
          onClick={() => setSpotlightOpen(true)}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-background"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">{t('sidebar.search')}</span>
          <Kbd>{shortcutLabel('K')}</Kbd>
        </button>
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto px-2">
        <NavItem
          icon={House}
          label={t('nav.home')}
          count={counts?.all}
          active={route.kind === 'home'}
          onClick={() => navigate({ kind: 'home' })}
        />
        <NavItem
          icon={CalendarDays}
          label={t('sidebar.daily')}
          onClick={() =>
            openDaily.mutate(undefined, { onSuccess: (n) => navigate({ kind: 'note', id: n.id }) })
          }
        />
        <NavItem
          icon={WandSparkles}
          label={t('tidy.nav')}
          count={tidyPending || undefined}
          active={route.kind === 'tidy'}
          onClick={() => navigate({ kind: 'tidy' })}
        />
        <SidebarFolders />
      </nav>

      <ProCard />
      <SidebarFooter />
    </aside>
  )
}

function SyncIndicator() {
  const { t } = useTranslation()
  const phase = useAccount((s) => s.phase)
  const status = useAccount((s) => s.sync.status)
  const openSettings = useUi((s) => s.openSettings)
  const localOnly = useLlm((s) => s.localOnly)
  if (localOnly) {
    return (
      <button
        type="button"
        onClick={() => openSettings('ai')}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-sidebar-accent hover:text-foreground pointer-coarse:py-2"
      >
        <HardDrive className="size-3.5" />
        {t('aiProvider.localOnly')}
      </button>
    )
  }
  if (phase === 'disabled') return null
  if (phase !== 'ready') {
    return (
      <button
        type="button"
        onClick={() => openSettings('account')}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-sidebar-accent hover:text-foreground pointer-coarse:py-2"
      >
        <CloudOff className="size-3.5" />
        {t('account.signInToSync')}
      </button>
    )
  }
  if (status === 'free') {
    return (
      <button
        type="button"
        onClick={() => openSettings('plan')}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-sidebar-accent hover:text-foreground pointer-coarse:py-2"
      >
        <CloudOff className="size-3.5" />
        {t('plan.syncInPro')}
      </button>
    )
  }
  const Icon =
    status === 'syncing'
      ? RefreshCw
      : status === 'offline'
        ? CloudOff
        : status === 'error'
          ? CloudAlert
          : CloudCheck
  const label =
    status === 'syncing'
      ? t('account.status.syncing')
      : status === 'offline'
        ? t('status.offline')
        : status === 'error'
          ? t('account.status.error', { message: '' }).replace(/[:：]\s*$/, '')
          : t('settings.account')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => openSettings('account')}
          aria-label={label}
          className={cn(
            'flex size-7 items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-foreground',
            status === 'error' && 'text-destructive',
          )}
        >
          <Icon className={cn('size-3.5', status === 'syncing' && 'animate-spin')} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarFooter() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const openSettings = useUi((s) => s.openSettings)
  const info = useQuery({
    queryKey: ['app-info'],
    queryFn: appInfo,
    enabled: platform.kind === 'desktop',
    staleTime: Number.POSITIVE_INFINITY,
  })

  return (
    <div className="flex h-11 items-center justify-between gap-2 border-t border-sidebar-border px-2 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-1">
        <SyncIndicator />
        {info.data ? <span className="px-1 tabular-nums">v{info.data.version}</span> : null}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => openSettings('general')}
        aria-label={t('sidebar.settings')}
      >
        <Settings />
      </Button>
    </div>
  )
}
