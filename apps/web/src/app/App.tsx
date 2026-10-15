import { parseConnectLink } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { isApple, TooltipProvider } from '@fixnote/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import { Toaster } from 'sonner'
import { CallBar } from '../components/CallBar'
import { CardPaymentDialog } from '../components/CardPaymentDialog'
import { ChatPanel } from '../components/ChatPanel'
import { ConnectDialog } from '../components/connect/ConnectDialog'
import { DesktopTray } from '../components/DesktopTray'
import { DropLayer } from '../components/DropLayer'
import { Home } from '../components/Home'
import { LayoutOnboarding } from '../components/LayoutOnboarding'
import { ListView } from '../components/ListView'
import { NoNoteOpen, NoteColumn } from '../components/NoteColumn'
import { PairingRequestDialog } from '../components/PairingRequestDialog'
import { PaymentDialog } from '../components/PaymentDialog'
import { Paywall, ProDialog, TrialEndedDialog } from '../components/ProCard'
import { SelectionArea } from '../components/SelectionBar'
import { Sidebar } from '../components/Sidebar'
import { Spotlight } from '../components/Spotlight'
import { StorageBanner } from '../components/StorageBanner'
import { SettingsDialog } from '../components/settings/SettingsDialog'
import { TidyView } from '../components/TidyView'
import { TitleBar } from '../components/TitleBar'
import { VoiceBar } from '../components/VoiceBar'
import { paymentReturned } from '../lib/account/account'
import { usesDevBackend } from '../lib/account/pick'
import { AccountProvider } from '../lib/account/provider'
import { AssistantProvider } from '../lib/assistant/provider'
import { DbProvider, useDb } from '../lib/db'
import { useExternalChanges } from '../lib/external-changes'
import { kvStore } from '../lib/kv'
import { currentListRoute, useDocking, useLayout } from '../lib/layout'
import { useNativeFeel } from '../lib/native'
import { navBack, navForward, useBackLayer, useNavHistory } from '../lib/nav-history'
import { billingLink } from '../lib/payment'
import { PlatformProvider, usePlatform } from '../lib/platform'
import { useCreateNote, useOpenDaily } from '../lib/queries'
import { RemoteMcpBridge } from '../lib/remote-mcp/bridge'
import { askToConnect } from '../lib/remote-mcp/connect'
import { initShortcuts, useShortcut } from '../lib/shortcuts'
import { appShown } from '../lib/shown'
import { useAutoUpdateCheck } from '../lib/updates'
import { useVisualViewport } from '../lib/viewport'
import { toggleVoice } from '../lib/voice/voice'
import { applyTheme, listOf, useUi } from './store'

// The editor (Tiptap/ProseMirror) is the heaviest part of the bundle; load it on first open.
const NoteView = lazy(() => import('../components/NoteView').then((m) => ({ default: m.NoteView })))

const queryClient = new QueryClient({
  defaultOptions: {
    // Local SQLite is the source of truth: no network, so no background refetching.
    queries: { staleTime: Number.POSITIVE_INFINITY, retry: false, refetchOnWindowFocus: false },
  },
})

function OpenNote({ id }: { id: string }) {
  return (
    <Suspense fallback={null}>
      {/* One instance per note: its query must refetch on mount, and the editor must start
          from the stored text, also when switching straight from note to note. */}
      <NoteView key={id} id={id} />
    </Suspense>
  )
}

/** The assistant layout: one content area for Home, a folder, Tidy or the open note. */
function Content() {
  const route = useUi((s) => s.route)
  switch (route.kind) {
    case 'home':
    case 'overview':
      return <Home />
    case 'tidy':
      return <TidyView />
    case 'note':
      return <OpenNote id={route.id} />
    default:
      return <ListView route={route} />
  }
}

/**
 * The notes layout (like Bear): the list of the place picked in the sidebar in its own column,
 * the open note beside it. Tidy and the big-card Home take the whole width. A narrow window shows
 * one of them at a time, list then note, and Back goes from the note to the list.
 */
function NotesContent({ onNewNote }: { onNewNote: () => void }) {
  const route = useUi((s) => s.route)
  const back = useUi((s) => s.back)
  const narrow = useUi((s) => s.narrow)
  // Everything right of the sidebar: the bar for picked notes is centred over it.
  const area = useRef<HTMLDivElement>(null)
  const list = listOf(route, back)
  const whole = (node: React.ReactNode) => (
    <main className="relative flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">{node}</div>
    </main>
  )
  if (narrow) {
    if (route.kind === 'overview') return whole(<Home />)
    if (route.kind === 'tidy') return whole(<TidyView />)
    if (route.kind === 'note') return whole(<OpenNote id={route.id} />)
    // One instance per list: its search and scroll start fresh in another place.
    return <NoteColumn key={JSON.stringify(list)} list={list} wide />
  }
  return (
    <SelectionArea.Provider value={area}>
      <div ref={area} className="flex min-w-0 flex-1">
        {route.kind === 'overview' ? (
          whole(<Home />)
        ) : route.kind === 'tidy' ? (
          whole(<TidyView />)
        ) : (
          <>
            <NoteColumn
              key={JSON.stringify(list)}
              list={list}
              activeId={route.kind === 'note' ? route.id : undefined}
            />
            {whole(
              route.kind === 'note' ? <OpenNote id={route.id} /> : <NoNoteOpen onNew={onNewNote} />,
            )}
          </>
        )}
      </div>
    </SelectionArea.Provider>
  )
}

function AppShell() {
  const { t, i18n } = useTranslation()
  const platform = usePlatform()
  const ui = useUi()
  const createNote = useCreateNote()
  const openDaily = useOpenDaily()
  const { driver } = useDb()
  const { sidebarOpen, chatOpen, theme, drawerOpen } = ui
  // Beside the content, or over it when it would squeeze the content too much.
  const { sidebarDrawer, chatOverlay } = useDocking()
  const layout = useLayout()
  // Back from Suby's payment page (supabase/functions/billing): the dialog, then Pro.
  useEffect(() => {
    const url = new URL(location.href)
    const billing = url.searchParams.get('billing')
    if (!billing) return
    url.searchParams.delete('billing')
    history.replaceState(history.state, '', url)
    if (billing === 'success' || billing === 'cancel') paymentReturned(billing)
  }, [])
  // The desktop app: the page after paying hands back with fixnote://billing/…, the connect page
  // asks with fixnote://connect?authorization_id=… (`?dev-backend`: from another tab).
  useEffect(() => {
    let off: (() => void) | undefined
    let gone = false
    void (async () =>
      platform.deepLinks ??
      (usesDevBackend() ? (await import('../lib/remote-mcp/dev')).devDeepLinks : null))()
      .then((links) =>
        links?.listen((link) => {
          const result = billingLink(link)
          if (result) paymentReturned(result)
          const connect = parseConnectLink(link)
          if (connect) askToConnect(connect)
        }),
      )
      .then((unlisten) => {
        if (gone) unlisten?.()
        else off = unlisten
      })
    return () => {
      gone = true
      off?.()
    }
  }, [platform])

  // Half a laptop screen or less: panels open over the content instead of squeezing it.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 799px)')
    const update = () => useUi.getState().setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  // The notes layout also lets panels open over the content when its columns would be tight.
  useEffect(() => {
    const update = () => useUi.getState().setWidth(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const newNote = () => {
    // In the folder on screen, or (notes layout) the folder listed beside the open note.
    const list = currentListRoute()
    createNote.mutate(
      { content: '', folderId: list?.kind === 'folder' ? list.id : null },
      { onSuccess: (n) => ui.navigate({ kind: 'note', id: n.id }) },
    )
  }
  const nativeActions = useMemo(
    () => ({
      back: navBack,
      forward: navForward,
      search: () => useUi.getState().setSpotlightOpen(true),
    }),
    [],
  )

  // Shortcuts the person changed (Settings → Shortcuts), kept on this device.
  useEffect(() => {
    void initShortcuts(kvStore(driver))
  }, [driver])

  useNavHistory(platform.kind === 'web')
  useVisualViewport(platform.kind === 'web')
  // On a phone, back closes the panels that open over the content.
  useBackLayer(sidebarDrawer && drawerOpen, () => useUi.setState({ drawerOpen: false }))
  useBackLayer(chatOverlay && chatOpen, () => useUi.getState().setChatOpen(false))
  useNativeFeel(platform, isApple, nativeActions)
  useExternalChanges()
  useAutoUpdateCheck()
  useShortcut('chat', ui.toggleChat)
  useShortcut('sidebar', ui.toggleSidebar)
  useShortcut('search', () => ui.setSpotlightOpen(!ui.spotlightOpen))
  useShortcut('back', navBack)
  useShortcut('forward', navForward)
  useShortcut('today', () =>
    openDaily.mutate(undefined, { onSuccess: (n) => ui.navigate({ kind: 'note', id: n.id }) }),
  )
  // Dictation: into the chat input when it has focus, else into the open note or a new one.
  useShortcut(
    'voice',
    () =>
      void toggleVoice(
        document.activeElement?.closest('[data-voice-target="chat"]') ? 'chat' : 'auto',
      ),
  )
  // Browsers keep Ctrl/⌘+N for a new window: on the web it has no shortcut unless one is picked.
  useShortcut('newNote', newNote)

  // The app is on screen: the desktop window may appear (it waits hidden until now).
  useEffect(() => appShown(), [])

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
          {sidebarOpen && !sidebarDrawer ? <Sidebar /> : null}
          {sidebarDrawer && drawerOpen ? (
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
          {layout === 'notes' ? (
            <NotesContent onNewNote={newNote} />
          ) : (
            <main className="relative flex min-w-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto">
                <Content />
              </div>
            </main>
          )}
        </div>
      </div>
      {/* Full window height, beside the title bar: its buttons end next to the panel. */}
      {chatOpen && chatOverlay ? (
        <>
          <button
            type="button"
            aria-label={t('chat.close')}
            className="absolute inset-0 z-30 bg-black/30"
            onClick={() => ui.setChatOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 z-40 flex max-w-full max-sm:left-0">
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
      <PaymentDialog />
      <CardPaymentDialog />
      <VoiceBar />
      <CallBar />
      <DesktopTray />
      <RemoteMcpBridge />
      <DropLayer />
      <PairingRequestDialog />
      <ConnectDialog />
      <LayoutOnboarding />
      <Toaster
        theme={theme}
        position="bottom-right"
        // Above the iPhone's home bar.
        mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
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
