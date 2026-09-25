import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  shortcutLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  FileText,
  House,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SquarePen,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { type Route, useUi } from '../app/store'
import { usePlatform } from '../lib/platform'
import { useFolders, useNote, useRecents } from '../lib/queries'
import { formatCardDate } from '../lib/time'
import { WindowControls } from './WindowControls'

function Tip({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        {label}
        {hint ? (
          <Kbd className="border-transparent bg-primary-foreground/15 text-primary-foreground">
            {hint}
          </Kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

function useRouteLabel(route: Route): string {
  const { t } = useTranslation()
  const folders = useFolders().data
  const note = useNote(route.kind === 'note' ? route.id : '', { enabled: route.kind === 'note' })
  switch (route.kind) {
    case 'home':
      return t('nav.home')
    case 'folder':
      return folders?.find((f) => f.id === route.id)?.name ?? ''
    case 'tag':
      return `#${route.name}`
    case 'note':
      return note.data?.title || t('common.untitled')
  }
}

/** Current place in the middle of the title bar; opens recent notes (like a document switcher). */
function PlaceMenu() {
  const { t, i18n } = useTranslation()
  const route = useUi((s) => s.route)
  const navigate = useUi((s) => s.navigate)
  const label = useRouteLabel(route)
  const recents = useRecents(10)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 max-w-[min(420px,40vw)] items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium hover:bg-accent data-[state=open]:bg-accent"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-80">
        <DropdownMenuLabel>{t('nav.recents')}</DropdownMenuLabel>
        {(recents.data ?? []).map((n) => (
          <DropdownMenuItem key={n.id} onSelect={() => navigate({ kind: 'note', id: n.id })}>
            {n.type === 'daily' ? <CalendarDays /> : <FileText />}
            <span className="flex-1 truncate">{n.title || t('common.untitled')}</span>
            <span className="text-xs text-muted-foreground">
              {formatCardDate(n.updatedAt, i18n.resolvedLanguage)}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ kind: 'home' })}>
          <House />
          {t('nav.home')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One bar across the whole window: it is the window's title bar on desktop (drag to move,
 * double-click to maximize) and the app header on the web.
 */
export function TitleBar({ onNewNote }: { onNewNote: () => void }) {
  const { t } = useTranslation()
  const platform = usePlatform()
  const ui = useUi()
  const drag = platform.kind === 'desktop' ? { 'data-tauri-drag-region': true } : {}

  return (
    <header {...drag} className="flex h-11 shrink-0 select-none items-stretch">
      <div
        {...drag}
        className={cn(
          'flex shrink-0 items-center gap-0.5 pr-2 pl-3',
          ui.sidebarOpen && 'w-64 border-r border-sidebar-border bg-sidebar',
          platform.chrome === 'mac-overlay' && 'pl-[78px]',
        )}
      >
        {ui.sidebarOpen ? (
          <button
            type="button"
            onClick={() => ui.navigate({ kind: 'home' })}
            className="mr-auto rounded-md px-1 text-sm font-semibold tracking-tight hover:text-brand"
          >
            {t('app.name')}
          </button>
        ) : null}
        <Tip
          label={t('sidebar.newNote')}
          hint={platform.kind === 'desktop' ? shortcutLabel('N') : undefined}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onNewNote}
            aria-label={t('sidebar.newNote')}
          >
            <SquarePen />
          </Button>
        </Tip>
        <Tip
          label={ui.sidebarOpen ? t('sidebar.collapse') : t('sidebar.expand')}
          hint={shortcutLabel('\\')}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={ui.toggleSidebar}
            aria-label={ui.sidebarOpen ? t('sidebar.collapse') : t('sidebar.expand')}
          >
            {ui.sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
        </Tip>
      </div>

      <div {...drag} className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center px-2">
        <div {...drag} className="flex items-center gap-0.5">
          <Tip label={t('nav.back')} hint={shortcutLabel('[')}>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={ui.goBack}
              disabled={!ui.back.length}
              aria-label={t('nav.back')}
            >
              <ArrowLeft />
            </Button>
          </Tip>
          <Tip label={t('nav.forward')} hint={shortcutLabel(']')}>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={ui.goForward}
              disabled={!ui.forward.length}
              aria-label={t('nav.forward')}
            >
              <ArrowRight />
            </Button>
          </Tip>
        </div>
        <PlaceMenu />
        <div {...drag} className="flex items-center justify-end gap-1">
          <Tip label={t('sidebar.search')} hint={shortcutLabel('K')}>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => ui.setSpotlightOpen(true)}
              aria-label={t('sidebar.search')}
            >
              <Search />
            </Button>
          </Tip>
          <Tip label={ui.chatOpen ? t('chat.close') : t('chat.open')} hint={shortcutLabel('J')}>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={ui.toggleChat}
              aria-pressed={ui.chatOpen}
              className={cn(ui.chatOpen && 'bg-accent text-brand')}
              aria-label={ui.chatOpen ? t('chat.close') : t('chat.open')}
            >
              <MessageCircle />
            </Button>
          </Tip>
        </div>
      </div>

      {platform.window ? <WindowControls controls={platform.window} /> : null}
    </header>
  )
}
