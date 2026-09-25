import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'

/** What the content column shows. Kept in memory; the desktop app has no URL bar. */
export type Route =
  /** Home: the greeting and every note; `filter: 'inbox'` shows notes without a folder. */
  | { kind: 'home'; filter?: 'inbox' }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; name: string }
  | { kind: 'note'; id: string }

export type SettingsSection = 'general' | 'account' | 'data'

/** An AI edit a note should open as soon as it is on screen (e.g. "tidy up" after dictation). */
export interface AiRequest {
  noteId: string
  action: 'structure'
}

export const sameRoute = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b)

interface UiState {
  sidebarOpen: boolean
  chatOpen: boolean
  spotlightOpen: boolean
  settings: SettingsSection | null
  theme: Theme
  chatDraft: string
  aiRequest: AiRequest | null
  route: Route
  back: Route[]
  forward: Route[]
  toggleSidebar: () => void
  setChatOpen: (open: boolean) => void
  toggleChat: () => void
  setSpotlightOpen: (open: boolean) => void
  openSettings: (section: SettingsSection | null) => void
  setTheme: (theme: Theme) => void
  setChatDraft: (text: string) => void
  requestAi: (request: AiRequest | null) => void
  navigate: (route: Route, opts?: { replace?: boolean }) => void
  goBack: () => void
  goForward: () => void
}

const HISTORY_LIMIT = 100

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      chatOpen: false,
      spotlightOpen: false,
      settings: null,
      theme: 'system',
      chatDraft: '',
      aiRequest: null,
      route: { kind: 'home' },
      back: [],
      forward: [],
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setChatOpen: (chatOpen) => set({ chatOpen }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      setSpotlightOpen: (spotlightOpen) => set({ spotlightOpen }),
      openSettings: (settings) => set({ settings }),
      setTheme: (theme) => set({ theme }),
      setChatDraft: (chatDraft) => set({ chatDraft }),
      requestAi: (aiRequest) => set({ aiRequest }),
      navigate: (route, opts) =>
        set((s) => {
          if (sameRoute(route, s.route)) return {}
          if (opts?.replace) return { route }
          return { route, back: [...s.back, s.route].slice(-HISTORY_LIMIT), forward: [] }
        }),
      goBack: () =>
        set((s) => {
          const prev = s.back.at(-1)
          if (!prev) return {}
          return { route: prev, back: s.back.slice(0, -1), forward: [s.route, ...s.forward] }
        }),
      goForward: () =>
        set((s) => {
          const [next, ...rest] = s.forward
          if (!next) return {}
          return { route: next, back: [...s.back, s.route], forward: rest }
        }),
    }),
    {
      name: 'fixnote.ui',
      partialize: ({ sidebarOpen, theme }) => ({ sidebarOpen, theme }),
    },
  ),
)

/** Keeps the `dark` class on <html> in sync with the chosen theme and the OS setting. */
export function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('fixnote.theme', theme)
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this session.
  }
}
