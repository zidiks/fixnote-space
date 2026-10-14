import type { NoteSort } from '@fixnote/core'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'

/** What the content column shows. Kept in memory; the desktop app has no URL bar. */
export type Route =
  /** Home: the greeting and every note; `filter: 'inbox'` shows notes without a folder. */
  | { kind: 'home'; filter?: 'inbox' }
  | { kind: 'folder'; id: string }
  | { kind: 'note'; id: string }
  /** Tidy suggestions to review. */
  | { kind: 'tidy' }
  /** Notes edited today (the notes layout lists them beside today's daily note). */
  | { kind: 'today' }
  /** The big-card Home screen with the greeting, in the notes layout (where Home is a list). */
  | { kind: 'overview' }

/** Routes that are a list of notes: in the notes layout they fill the middle column. */
export type ListRoute = Extract<Route, { kind: 'home' | 'folder' | 'today' }>

export const isListRoute = (r: Route): r is ListRoute =>
  r.kind === 'home' || r.kind === 'folder' || r.kind === 'today'

/**
 * The list shown beside an open note in the notes layout: the route itself when it is a list,
 * else the list the person last came through (so Back and Forward bring the right one along),
 * else Home.
 */
export function listOf(route: Route, back: readonly Route[]): ListRoute {
  if (isListRoute(route)) return route
  for (let i = back.length - 1; i >= 0; i--) {
    const r = back[i]
    if (r && isListRoute(r)) return r
  }
  return { kind: 'home' }
}

/**
 * How the window is laid out: `assistant` = sidebar and one content area (Home with large cards
 * and the assistant; a note opens in place), `notes` = three columns like Bear (sidebar, a column
 * of compact cards, the open note). `null` = not chosen yet on this device: `LayoutOnboarding`
 * asks once, and the app looks like `assistant` until then.
 */
export type Layout = 'assistant' | 'notes'

/** The middle column of the notes layout: its width in px, kept on this device. */
export const LIST_WIDTH = { min: 240, max: 480, initial: 320 } as const

export const clampListWidth = (w: number) =>
  Number.isFinite(w)
    ? Math.round(Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, w)))
    : LIST_WIDTH.initial

/** The sidebar and the assistant panel as they take room beside the content (`docking`). */
export const SIDEBAR_WIDTH = 256
export const CHAT_WIDTH = 390
/** The open note in the notes layout keeps at least this much width, for reading. */
export const EDITOR_MIN = 460

export interface Docking {
  /** The sidebar opens over the content (a drawer) instead of beside it. */
  sidebarDrawer: boolean
  /** The assistant opens over the content instead of beside it. */
  chatOverlay: boolean
}

/**
 * Whether the sidebar and the assistant fit beside the content. A narrow window (a phone, half a
 * laptop screen) opens both over it. In the notes layout the list column and a readable note
 * come first: the assistant docks only if the note keeps `EDITOR_MIN` beside the list, then the
 * sidebar only if there is still room for it; otherwise each opens over the content.
 */
export function docking(s: {
  narrow: boolean
  width: number
  layout: Layout | null
  listWidth: number
  chatOpen: boolean
}): Docking {
  if (s.narrow) return { sidebarDrawer: true, chatOverlay: true }
  if (s.layout !== 'notes') return { sidebarDrawer: false, chatOverlay: false }
  const room = s.width - s.listWidth - EDITOR_MIN
  const chatOverlay = room < CHAT_WIDTH
  const chat = s.chatOpen && !chatOverlay ? CHAT_WIDTH : 0
  return { sidebarDrawer: room - chat < SIDEBAR_WIDTH, chatOverlay }
}

/** How lists of notes look: cards in a grid, rows with a preview, or one line per note. */
export type NoteView = 'cards' | 'list' | 'compact'

export type SettingsSection =
  | 'general'
  | 'shortcuts'
  | 'account'
  | 'plan'
  | 'integrations'
  | 'ai'
  | 'data'
  | 'advanced'

/** An AI edit a note should open as soon as it is on screen (e.g. "tidy up" after dictation). */
export interface AiRequest {
  noteId: string
  action: 'structure'
}

export const sameRoute = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b)

interface UiState {
  sidebarOpen: boolean
  /** A narrow window (half a laptop screen): the sidebar and the assistant open over the content. */
  narrow: boolean
  /** The sidebar opened over the content in a narrow window; closes on navigation. */
  drawerOpen: boolean
  setNarrow: (narrow: boolean) => void
  /** The window's width in px, for `docking`. */
  width: number
  setWidth: (width: number) => void
  chatOpen: boolean
  spotlightOpen: boolean
  settings: SettingsSection | null
  theme: Theme
  /** Chosen once (`LayoutOnboarding`) and in Settings → General; kept on this device. */
  layout: Layout | null
  listWidth: number
  setLayout: (layout: Layout) => void
  setListWidth: (width: number) => void
  /** Remembered on this device, like the theme. */
  noteView: NoteView
  noteSort: NoteSort
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
  /** Folders folded in the sidebar (ids), kept on this device. */
  collapsedFolders: string[]
  toggleFolder: (id: string) => void
  setNoteView: (noteView: NoteView) => void
  setNoteSort: (noteSort: NoteSort) => void
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
      narrow: false,
      drawerOpen: false,
      setNarrow: (narrow) => set({ narrow, drawerOpen: false }),
      width: 1280,
      setWidth: (width) =>
        set((s) =>
          docking(s).sidebarDrawer === docking({ ...s, width }).sidebarDrawer
            ? { width }
            : { width, drawerOpen: false },
        ),
      chatOpen: false,
      spotlightOpen: false,
      settings: null,
      theme: 'system',
      layout: null,
      listWidth: LIST_WIDTH.initial,
      setLayout: (layout) => set({ layout }),
      setListWidth: (width) => set({ listWidth: clampListWidth(width) }),
      collapsedFolders: [],
      noteView: 'cards',
      noteSort: 'edited',
      chatDraft: '',
      aiRequest: null,
      route: { kind: 'home' },
      back: [],
      forward: [],
      toggleSidebar: () =>
        set((s) =>
          docking(s).sidebarDrawer
            ? { drawerOpen: !s.drawerOpen }
            : { sidebarOpen: !s.sidebarOpen },
        ),
      setChatOpen: (chatOpen) => set({ chatOpen }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      setSpotlightOpen: (spotlightOpen) => set({ spotlightOpen }),
      openSettings: (settings) => set({ settings }),
      setTheme: (theme) => set({ theme }),
      toggleFolder: (id) =>
        set((s) => ({
          collapsedFolders: s.collapsedFolders.includes(id)
            ? s.collapsedFolders.filter((f) => f !== id)
            : [...s.collapsedFolders, id],
        })),
      setNoteView: (noteView) => set({ noteView }),
      setNoteSort: (noteSort) => set({ noteSort }),
      setChatDraft: (chatDraft) => set({ chatDraft }),
      requestAi: (aiRequest) => set({ aiRequest }),
      navigate: (route, opts) =>
        set((s) => {
          if (sameRoute(route, s.route)) return { drawerOpen: false }
          if (opts?.replace) return { route, drawerOpen: false }
          return {
            route,
            back: [...s.back, s.route].slice(-HISTORY_LIMIT),
            forward: [],
            drawerOpen: false,
          }
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
      partialize: ({
        sidebarOpen,
        theme,
        noteView,
        noteSort,
        collapsedFolders,
        layout,
        listWidth,
      }) => ({
        sidebarOpen,
        theme,
        noteView,
        noteSort,
        collapsedFolders,
        layout,
        listWidth,
      }),
      merge: (persisted, current) => ({ ...current, ...readPersisted(persisted) }),
    },
  ),
)

type Persisted = Partial<
  Pick<
    UiState,
    'sidebarOpen' | 'theme' | 'noteView' | 'noteSort' | 'collapsedFolders' | 'layout' | 'listWidth'
  >
>

/**
 * What was kept on this device, with values that cannot be used dropped: a layout that is not
 * one of ours is asked again, a width out of range is brought back into it.
 */
export function readPersisted(value: unknown): Persisted {
  if (typeof value !== 'object' || value === null) return {}
  const out = { ...(value as Persisted) }
  if (out.layout !== 'assistant' && out.layout !== 'notes') out.layout = null
  if (out.listWidth !== undefined) out.listWidth = clampListWidth(Number(out.listWidth))
  return out
}

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
