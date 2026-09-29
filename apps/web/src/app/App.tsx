import { useTranslation } from '@fixnote/i18n'
import { isApple, TooltipProvider } from '@fixnote/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo } from 'react'
import { Toaster, toast } from 'sonner'
import { ChatPanel } from '../components/ChatPanel'
import { DropLayer } from '../components/DropLayer'
import { Home } from '../components/Home'
import { ListView } from '../components/ListView'
import { PairingRequestDialog } from '../components/PairingRequestDialog'
import { Paywall, ProDialog, TrialEndedDialog } from '../components/ProCard'
import { Sidebar } from '../components/Sidebar'
import { Spotlight } from '../components/Spotlight'
import { StorageBanner } from '../components/StorageBanner'
import { SettingsDialog } from '../components/settings/SettingsDialog'
import { TidyView } from '../components/TidyView'
import { TitleBar } from '../components/TitleBar'
import { VoiceBar } from '../components/VoiceBar'
import { paymentReturned } from '../lib/account/account'
import { AccountProvider } from '../lib/account/provider'
import { AssistantProvider } from '../lib/assistant/provider'
import { DbProvider } from '../lib/db'
import { useExternalChanges } from '../lib/external-changes'
import { useHotkey } from '../lib/hotkeys'
import { useNativeFeel } from '../lib/native'
import { PlatformProvider, usePlatform } from '../lib/platform'
import { useCreateNote, useOpenDaily } from '../lib/queries'
import { useAutoUpdateCheck } from '../lib/updates'
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
          {/* One instance per note: its query must refetch on mount, and the editor must start
              from the stored text, also when switching straight from note to note. */}
          <NoteView key={route.id} id={route.id} />
        </Suspense>
      )
    default:
      return <ListView route={route} />
  }
}

function AppShell() {
  const { t, i18n } = useTranslation()
  const platform = usePlatform()
  const ui = useUi()
  const createNote = useCreateNote()
  const openDaily = useOpenDaily()
  const { sidebarOpen, chatOpen, theme, narrow, drawerOpen } = ui
  // Back from Suby's payment page (supabase/functions/billing): thank, then look for Pro.
  useEffect(() => {
    const url = new URL(location.href)
    const billing = url.searchParams.get('billing')
    if (!billing) return
    url.searchParams.delete('billing')
    history.replaceState(null, '', url)
    if (billing === 'success') {
      toast.success(t('plan.thanks'))
      paymentReturned()
    }
  }, [t])

  // Half a laptop screen or less: panels open over the content instead of squeezing it.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 799px)')
    const update = () => useUi.getState().setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

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
  useExternalChanges()
  useAutoUpdateCheck()
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
    <div className="relative flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar onNewNote={newNote} />
        <StorageBanner />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {sidebarOpen && !narrow ? <Sidebar /> : null}
          {narrow && drawerOpen ? (
            <>
              <button
                type="button"
                aria-label={t('sidebar.collapse')}
                className="absolute inset-0 z-30 bg-black/30"
                onClick={ui.toggleSidebar}
              />
              <div className="absolute inset-y-0 left-0 z-40 shadow-xl">
                <Sidebar />
              </div>
            </>
          ) : null}
          <main className="relative flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto">
              <Content />
            </div>
          </main>
        </div>
      </div>
      {/* Full window height, beside the title bar: its buttons end next to the panel. */}
      {chatOpen && narrow ? (
        <>
          <button
            type="button"
            aria-label={t('chat.close')}
            className="absolute inset-0 z-30 bg-black/30"
            onClick={() => ui.setChatOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 z-40 flex max-w-full">
            <ChatPanel />
          </div>
        </>
      ) : chatOpen ? (
        <ChatPanel />
      ) : null}
      <Spotlight />
      <SettingsDialog />
      <ProDialog />
      <TrialEndedDialog />
      <Paywall />
      <VoiceBar />
      <DropLayer />
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
