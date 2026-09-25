import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'

/** Session-only capture until local storage lands in M1. */
export interface DraftNote {
  id: string
  text: string
  createdAt: number
}

interface UiState {
  sidebarOpen: boolean
  chatOpen: boolean
  theme: Theme
  chatDraft: string
  drafts: DraftNote[]
  toggleSidebar: () => void
  setChatOpen: (open: boolean) => void
  toggleChat: () => void
  setTheme: (theme: Theme) => void
  setChatDraft: (text: string) => void
  addDraft: (text: string) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      chatOpen: false,
      theme: 'system',
      chatDraft: '',
      drafts: [],
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setChatOpen: (chatOpen) => set({ chatOpen }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      setTheme: (theme) => set({ theme }),
      setChatDraft: (chatDraft) => set({ chatDraft }),
      addDraft: (text) =>
        set((s) => ({
          drafts: [{ id: crypto.randomUUID(), text, createdAt: Date.now() }, ...s.drafts],
        })),
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
