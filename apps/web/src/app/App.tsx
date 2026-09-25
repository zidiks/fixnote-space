import { useTranslation } from '@fixnote/i18n'
import { isApple, TooltipProvider } from '@fixnote/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo } from 'react'
import { Toaster } from 'sonner'
import { ChatPanel } from '../components/ChatPanel'
import { Home } from '../components/Home'
import { ListView } from '../components/ListView'
import { PairingRequestDialog } from '../components/PairingRequestDialog'
import { Sidebar } from '../components/Sidebar'
import { Spotlight } from '../components/Spotlight'
import { StorageBanner } from '../components/StorageBanner'
import { SettingsDialog } from '../components/settings/SettingsDialog'
import { TidyView } from '../components/TidyView'
import { TitleBar } from '../components/TitleBar'
import { VoiceBar } from '../components/VoiceBar'
import { AccountProvider } from '../lib/account/provider'
import { AssistantProvider } from '../lib/assistant/provider'
import { DbProvider } from '../lib/db'
import { useHotkey } from '../lib/hotkeys'
import { useNativeFeel } from '../lib/native'
import { PlatformProvider, usePlatform } from '../lib/platform'
import { useCreateNote, useOpenDaily } from '../lib/queries'
import { toggleVoice } from '../lib/voice/voice'
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
  voice: { key: ' ', mod: true, shift: true },
} as const

const NONE = { key: '\u0000' } as const

function Content() {
  const route = useUi((s) => s.route)
  switch (route.kind) {
    case 'home':
      return <Home />
    case 'tidy':
      return <TidyView />
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
  const { sidebarOpen, chatOpen, theme } = ui

  const newNote = () => {
    const route = useUi.getState().route
    createNote.mutate(
      { content: '', folderId: route.kind === 'folder' ? route.id : null },
      { onSuccess: (n) => ui.navigate({ kind: 'note', id: n.id }) },
    )
  }
  const nativeActions = useMemo(
    () => ({
      back: () => useUi.getState().goBack(),
      forward: () => useUi.getState().goForward(),
      search: () => useUi.getState().setSpotlightOpen(true),
    }),
    [],
  )

  useNativeFeel(platform, isApple, nativeActions)
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
  // Dictation: into the chat input when it has focus, else into the open note or a new one.
  useHotkey(
    HK.voice,
    () =>
      void toggleVoice(
        document.activeElement?.closest('[data-voice-target="chat"]') ? 'chat' : 'auto',
      ),
    isApple,
  )
  // Browsers reserve Ctrl/⌘+N for a new window; only the desktop app can take it.
  useHotkey(platform.kind === 'desktop' ? HK.newNote : NONE, newNote, isApple)

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
      <TitleBar onNewNote={newNote} />
      <StorageBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen ? <Sidebar /> : null}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <Content />
          </div>
        </main>
        {chatOpen ? <ChatPanel /> : null}
      </div>
      <Spotlight />
      <SettingsDialog />
      <VoiceBar />
      <PairingRequestDialog />
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
            <AccountProvider>
              <AssistantProvider>
                <AppShell />
              </AssistantProvider>
            </AccountProvider>
          </DbProvider>
        </TooltipProvider>
      </PlatformProvider>
    </QueryClientProvider>
  )
}
