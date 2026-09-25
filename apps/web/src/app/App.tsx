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
import { MessageCircle, PanelLeftOpen } from 'lucide-react'
import { useEffect } from 'react'
import { ChatPanel } from '../components/ChatPanel'
import { Home } from '../components/Home'
import { QuickInput } from '../components/QuickInput'
import { Sidebar } from '../components/Sidebar'
import { useHotkey } from '../lib/hotkeys'
import { PlatformProvider } from '../lib/platform'
import { applyTheme, useUi } from './store'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

const HK_CHAT = { key: 'j', mod: true } as const
const HK_SIDEBAR = { key: '\\', mod: true } as const

function AppShell() {
  const { t, i18n } = useTranslation()
  const { sidebarOpen, chatOpen, theme, toggleSidebar, toggleChat } = useUi()

  useHotkey(HK_CHAT, toggleChat, isApple)
  useHotkey(HK_SIDEBAR, toggleSidebar, isApple)

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
    <div className="flex h-full overflow-hidden">
      {sidebarOpen ? <Sidebar /> : null}

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div
          data-tauri-drag-region
          className="flex h-12 shrink-0 items-center justify-between px-3"
        >
          <div>
            {sidebarOpen ? null : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={toggleSidebar}
                    aria-label={t('sidebar.expand')}
                  >
                    <PanelLeftOpen />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('sidebar.expand')}{' '}
                  <Kbd className="border-transparent bg-primary-foreground/15 text-primary-foreground">
                    {shortcutLabel('\\')}
                  </Kbd>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {chatOpen ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={toggleChat} aria-label={t('chat.open')}>
                  <MessageCircle />
                  {t('chat.title')}
                  <Kbd>{shortcutLabel('J')}</Kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('chat.open')}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <Home />
        </div>
        <QuickInput />
      </main>

      {chatOpen ? <ChatPanel /> : null}
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformProvider>
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </PlatformProvider>
    </QueryClientProvider>
  )
}
