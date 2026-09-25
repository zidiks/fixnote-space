import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  isApple,
  Kbd,
  shortcutLabel,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@fixnote/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, MessageCircle, PanelLeftOpen, Search } from 'lucide-react'
import { lazy, type ReactNode, Suspense, useEffect } from 'react'
import { Toaster } from 'sonner'
import { ChatPanel } from '../components/ChatPanel'
import { Home } from '../components/Home'
import { ListView } from '../components/ListView'
import { QuickInput } from '../components/QuickInput'
import { Sidebar } from '../components/Sidebar'
import { Spotlight } from '../components/Spotlight'
import { StorageBanner } from '../components/StorageBanner'
import { DbProvider } from '../lib/db'
import { useHotkey } from '../lib/hotkeys'
import { PlatformProvider, usePlatform } from '../lib/platform'
import { useCreateNote, useOpenDaily } from '../lib/queries'
import { applyTheme, useUi } from './store'

// The editor (Tiptap/ProseMirror) is the heaviest part of the bundle; load it on first open.
const NoteView = lazy(() => import('../components/NoteView').then((m) => ({ default: m.NoteView })))

const queryClient = new QueryClient({
  defaultOptions: {
    // Local SQLite is the source of truth: no network, so no background refetching.
    queries: { staleTime: Number.POSITIVE_INFINITY, retry: false, refetchOnWindowFocus: false },
  },
})

const HK = {
  chat: { key: 'j', mod: true },
  sidebar: { key: '\\', mod: true },
  spotlight: { key: 'k', mod: true },
  back: { key: '[', mod: true },
  forward: { key: ']', mod: true },
  daily: { key: 'd', mod: true },
  newNote: { key: 'n', mod: true },
} as const

function IconTip({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

function TopBar() {
  const { t } = useTranslation()
  const {
    sidebarOpen,
    chatOpen,
    back,
    forward,
    toggleSidebar,
    toggleChat,
    goBack,
    goForward,
    setSpotlightOpen,
  } = useUi()

  return (
    <div data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-0.5 px-3">
      {sidebarOpen ? null : (
        <IconTip label={t('sidebar.expand')} hint={shortcutLabel('\\')}>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleSidebar}
            aria-label={t('sidebar.expand')}
          >
            <PanelLeftOpen />
          </Button>
        </IconTip>
      )}
      <IconTip label={t('nav.back')} hint={shortcutLabel('[')}>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={goBack}
          disabled={!back.length}
          aria-label={t('nav.back')}
        >
          <ArrowLeft />
        </Button>
      </IconTip>
      <IconTip label={t('nav.forward')} hint={shortcutLabel(']')}>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={goForward}
          disabled={!forward.length}
          aria-label={t('nav.forward')}
        >
          <ArrowRight />
        </Button>
      </IconTip>

      <div className="ml-auto flex items-center gap-1">
        <IconTip label={t('sidebar.search')} hint={shortcutLabel('K')}>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setSpotlightOpen(true)}
            aria-label={t('sidebar.search')}
          >
            <Search />
          </Button>
        </IconTip>
        {chatOpen ? null : (
          <IconTip label={t('chat.open')}>
            <Button variant="ghost" size="sm" onClick={toggleChat} aria-label={t('chat.open')}>
              <MessageCircle />
              {t('chat.title')}
              <Kbd>{shortcutLabel('J')}</Kbd>
            </Button>
          </IconTip>
        )}
      </div>
    </div>
  )
}

function Content() {
  const route = useUi((s) => s.route)
  switch (route.kind) {
    case 'home':
      return <Home />
    case 'note':
      return (
        <Suspense fallback={null}>
          <NoteView id={route.id} />
        </Suspense>
      )
    default:
      return <ListView route={route} />
  }
}

function AppShell() {
  const { i18n } = useTranslation()
  const platform = usePlatform()
  const ui = useUi()
  const createNote = useCreateNote()
  const openDaily = useOpenDaily()
  const { sidebarOpen, chatOpen, theme, route } = ui

  useHotkey(HK.chat, ui.toggleChat, isApple)
  useHotkey(HK.sidebar, ui.toggleSidebar, isApple)
  useHotkey(HK.spotlight, () => ui.setSpotlightOpen(!ui.spotlightOpen), isApple)
  useHotkey(HK.back, ui.goBack, isApple)
  useHotkey(HK.forward, ui.goForward, isApple)
  useHotkey(
    HK.daily,
    () =>
      openDaily.mutate(undefined, { onSuccess: (n) => ui.navigate({ kind: 'note', id: n.id }) }),
    isApple,
  )
  // Browsers reserve Ctrl/⌘+N for a new window; only the desktop app can take it.
  useHotkey(
    platform.kind === 'desktop' ? HK.newNote : { key: '\u0000' },
    () =>
      createNote.mutate(
        { content: '' },
        { onSuccess: (n) => ui.navigate({ kind: 'note', id: n.id }) },
      ),
    isApple,
  )

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  }, [i18n.resolvedLanguage])

  return (
    <div className="flex h-full flex-col">
      <StorageBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen ? <Sidebar /> : null}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="flex-1 overflow-y-auto">
            <Content />
          </div>
          {route.kind === 'note' ? null : <QuickInput />}
        </main>
        {chatOpen ? <ChatPanel /> : null}
      </div>
      <Spotlight />
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{
          className: '!rounded-lg !border !bg-popover !text-popover-foreground !shadow-float',
        }}
      />
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformProvider>
        <TooltipProvider>
          <DbProvider>
            <AppShell />
          </DbProvider>
        </TooltipProvider>
      </PlatformProvider>
    </QueryClientProvider>
  )
}
