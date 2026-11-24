import { type NoteFilter, type NoteSummary, subtreeCounts } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, chipVariants, cn, Tooltip, TooltipContent, TooltipTrigger } from '@fixnote/ui'
import { CalendarDays, Folder, House, Link2, Pin, Search, SquarePen, X } from 'lucide-react'
import { type RefObject, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { clampListWidth, LIST_WIDTH, type ListRoute, useUi } from '../app/store'
import { listFilter } from '../lib/layout'
import { useNoteList } from '../lib/note-list'
import { useCounts, useCreateNote, useFolders, useSearch } from '../lib/queries'
import { startOfDay } from '../lib/time'
import { LinksBar } from './LinksBar'
import { NoteSnippet } from './NoteCard'
import { useGroupLabel, ViewMenu } from './NoteGrid'
import { SelectionBar } from './SelectionBar'
import { SlidingHoverIndicator, SlidingIndicator } from './SlidingIndicator'
import { Snippet } from './Spotlight'
import { VirtualList } from './VirtualList'

/**
 * The middle column of the notes layout: the notes of the list picked in the sidebar (Home,
 * Today, a folder) as compact cards, with the same order, infinite scroll and picking as the
 * other lists (`useNoteList`, `useNotePress`, `SelectionBar`), and a search among them. On a
 * phone it is the whole screen, and a note opens over it (Back returns).
 */
export function NoteColumn({
  list,
  activeId,
  wide = false,
  onFirst,
}: {
  list: ListRoute
  /** The note open beside the list. */
  activeId?: string | undefined
  /** Told the list's first note (pinned ones first), or null when it has none. */
  onFirst?: (id: string | null) => void
  /** The whole width (a phone): no resize handle. */
  wide?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const width = useUi((s) => s.listWidth)
  const columnRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [listScrolled, setListScrolled] = useState(false)
  const folders = useFolders().data
  const counts = useCounts().data
  const createNote = useCreateNote()
  const [q, setQ] = useState('')
  const query = useDeferredValue(q).trim()
  // Sync scroll-fade state when switching between search results and the main list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check scrollTop whenever query switches list mode
  useEffect(() => {
    setListScrolled((scrollRef.current?.scrollTop ?? 0) > 1)
  }, [query])
  // Today starts when the list is opened; it does not shrink at midnight while on screen.
  const midnight = useMemo(() => startOfDay(), [])
  const filter = useMemo(() => listFilter(list, midnight), [list, midnight])

  const folder = list.kind === 'folder' ? folders?.find((f) => f.id === list.id) : undefined
  const title =
    list.kind === 'folder'
      ? (folder?.name ?? '')
      : list.kind === 'today'
        ? t('sidebar.daily')
        : list.kind === 'links'
          ? t('links.nav')
          : t('nav.home')
  const Icon =
    list.kind === 'folder'
      ? Folder
      : list.kind === 'today'
        ? CalendarDays
        : list.kind === 'links'
          ? Link2
          : House
  const count =
    list.kind === 'folder'
      ? folder && folders
        ? subtreeCounts(folders).get(folder.id)
        : undefined
      : list.kind === 'home'
        ? list.filter === 'inbox'
          ? counts?.inbox
          : counts?.all
        : list.kind === 'links'
          ? counts?.links
          : undefined
  // View only: nothing is added to someone else's folder from here. Links come from the bar.
  const canAdd = folder?.access !== 'view' && list.kind !== 'links'
  const newNote = () =>
    createNote.mutate(
      { content: '', folderId: list.kind === 'folder' ? list.id : null },
      { onSuccess: (n) => navigate({ kind: 'note', id: n.id }) },
    )

  return (
    <section
      ref={columnRef}
      aria-label={title}
      className={cn(
        'relative flex h-full min-h-0 flex-col bg-background [contain:layout_style]',
        wide ? 'min-w-0 flex-1' : 'shrink-0 border-r',
      )}
      style={wide ? undefined : { width }}
    >
      <header className="space-y-2 px-3 pt-3 pb-1">
        <div className="flex h-7 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
          {count !== undefined ? (
            <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          ) : null}
          <span className="ml-auto flex items-center gap-0.5">
            <ViewMenu sortOnly />
            {canAdd ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={newNote}
                    loading={createNote.isPending}
                    aria-label={t('sidebar.newNote')}
                  >
                    <SquarePen />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('sidebar.newNote')}</TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        </div>
        <label className="flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 pointer-coarse:h-10">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && q) {
                e.stopPropagation()
                setQ('')
              }
            }}
            placeholder={t('layout.search')}
            aria-label={t('layout.search')}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground pointer-coarse:text-base"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label={t('layout.clearSearch')}
              className="-mr-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
        {list.kind === 'links' ? <LinksBar list={list} /> : null}
        {list.kind === 'home' ? (
          <div className="flex gap-1">
            {(['all', 'inbox'] as const).map((s) => {
              const on = (list.filter === 'inbox') === (s === 'inbox')
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    navigate(s === 'inbox' ? { kind: 'home', filter: 'inbox' } : { kind: 'home' }, {
                      replace: true,
                    })
                  }
                  className={chipVariants({ selected: on })}
                >
                  {t(`home.filters.${s}`)}
                </button>
              )
            })}
          </div>
        ) : null}
      </header>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const next = e.currentTarget.scrollTop > 1
          setListScrolled((prev) => (prev === next ? prev : next))
        }}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-1.5 pt-1 pb-24',
          listScrolled && 'fx-scroll-fade-top',
        )}
      >
        <div ref={listRef} className="relative">
          <SlidingHoverIndicator
            container={listRef}
            itemSelector="[data-note-id]"
            activeKey={activeId ?? null}
            className="rounded-lg bg-accent/70"
          />
          <SlidingIndicator
            container={listRef}
            activeKey={activeId ?? null}
            observeMutations
            className="rounded-lg bg-accent"
          />
          {query ? (
            <SearchResults
              query={query}
              filter={filter}
              inFolder={folderId(list)}
              activeId={activeId}
            />
          ) : (
            <Notes
              filter={filter}
              pinnedFirst={list.kind !== 'today'}
              inFolder={folderId(list)}
              activeId={activeId}
              onFirst={onFirst}
              empty={
                list.kind === 'folder'
                  ? t('list.emptyFolder')
                  : list.kind === 'links'
                    ? t('links.empty')
                    : list.kind === 'today'
                      ? t('layout.emptyToday')
                      : list.filter === 'inbox'
                        ? t('home.emptyFiltered')
                        : t('home.empty.title')
              }
            />
          )}
        </div>
      </div>
      {wide ? null : <Resizer target={columnRef} />}
    </section>
  )
}

const folderId = (list: ListRoute) => (list.kind === 'folder' ? list.id : undefined)

function Notes({
  filter,
  pinnedFirst,
  inFolder,
  activeId,
  empty,
  onFirst,
}: {
  filter: NoteFilter
  pinnedFirst: boolean
  inFolder: string | undefined
  activeId: string | undefined
  empty: string
  onFirst: ((id: string | null) => void) | undefined
}) {
  const { t } = useTranslation()
  const label = useGroupLabel()
  const list = useNoteList(filter, pinnedFirst)
  const first = list.pending ? undefined : (list.pickable[0]?.id ?? null)
  useEffect(() => {
    if (first !== undefined) onFirst?.(first)
  }, [first, onFirst])

  if (list.pending) return <Hint>{t('common.loading')}</Hint>
  if (list.empty) return <Hint>{empty}</Hint>
  const rows: ({ key: string; title: string; pinned?: boolean } | NoteSummary)[] = []
  if (list.pinned.length)
    rows.push({ key: 'pinned', title: t('pin.section'), pinned: true }, ...list.pinned)
  for (const section of list.groups) {
    if (section.group) rows.push({ key: section.key, title: label(section.group) })
    rows.push(...section.notes)
  }
  return (
    <>
      <VirtualList
        items={rows}
        itemKey={(row) => ('id' in row ? row.id : `header:${row.key}`)}
        estimate={(row) => ('id' in row ? 132 : 32)}
        className="relative z-[1]"
        render={(row) =>
          'id' in row ? (
            <div className="pb-0.5">
              <NoteSnippet
                note={row}
                inFolder={inFolder}
                date={list.date}
                active={row.id === activeId}
              />
            </div>
          ) : (
            <h2 className="flex items-center gap-1.5 px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
              {row.pinned ? <Pin className="size-3" /> : null}
              {row.title}
            </h2>
          )
        }
      />
      <div ref={list.sentinel} aria-hidden className="h-px" />
      {list.loadingMore ? <Hint>{t('common.loading')}</Hint> : null}
      <SelectionBar notes={list.pickable} />
    </>
  )
}

/** Found among the list's notes, best match first (with the matching words marked). */
function SearchResults({
  query,
  filter,
  inFolder,
  activeId,
}: {
  query: string
  filter: NoteFilter
  inFolder: string | undefined
  activeId: string | undefined
}) {
  const { t } = useTranslation()
  const search = useSearch(query, filter, 50)
  const hits = search.data ?? []
  const notes = useMemo(() => hits.map((h) => h.note), [hits])
  if (search.isPending) return <Hint>{t('common.loading')}</Hint>
  if (!hits.length) return <Hint>{t('layout.noResults')}</Hint>
  return (
    <>
      <VirtualList
        items={hits}
        itemKey={(hit) => hit.note.id}
        estimate={() => 132}
        className="relative z-[1]"
        render={(h) => (
          <div className="pb-0.5">
            <NoteSnippet
              note={h.note}
              inFolder={inFolder}
              active={h.note.id === activeId}
              excerpt={h.snippet ? <Snippet text={h.snippet} /> : undefined}
            />
          </div>
        )}
      />
      <SelectionBar notes={notes} />
    </>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm text-muted-foreground">{children}</p>
}

/**
 * The column's right edge: drag (or arrow keys) to change its width; double-click resets it.
 * Updates the DOM width at VSync via rAF during drag and commits to the store once on release,
 * avoiding React re-renders and localStorage writes on every high-rate pointermove event.
 */
function Resizer({ target }: { target: RefObject<HTMLElement | null> }) {
  const { t } = useTranslation()
  const width = useUi((s) => s.listWidth)
  const setWidth = useUi((s) => s.setListWidth)
  const sepRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; w: number; next: number; raf: number } | null>(null)

  useEffect(
    () => () => {
      if (drag.current?.raf) cancelAnimationFrame(drag.current.raf)
      delete document.documentElement.dataset.resizing
    },
    [],
  )

  const finishDrag = (commit: boolean) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (d.raf) cancelAnimationFrame(d.raf)
    delete document.documentElement.dataset.resizing
    const finalWidth = commit ? d.next : d.w
    if (target.current) target.current.style.width = `${finalWidth}px`
    sepRef.current?.setAttribute('aria-valuenow', String(finalWidth))
    if (commit && finalWidth !== d.w) setWidth(finalWidth)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA pattern for a splitter.
    <div
      ref={sepRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('layout.resize')}
      aria-valuenow={width}
      aria-valuemin={LIST_WIDTH.min}
      aria-valuemax={LIST_WIDTH.max}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, w: width, next: width, raf: 0 }
        document.documentElement.dataset.resizing = 'col'
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        d.next = clampListWidth(d.w + e.clientX - d.x)
        if (!d.raf) {
          d.raf = requestAnimationFrame(() => {
            d.raf = 0
            if (target.current) target.current.style.width = `${d.next}px`
            sepRef.current?.setAttribute('aria-valuenow', String(d.next))
          })
        }
      }}
      onPointerUp={() => finishDrag(true)}
      onPointerCancel={() => finishDrag(false)}
      onDoubleClick={() => setWidth(LIST_WIDTH.initial)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setWidth(width - 16)
        else if (e.key === 'ArrowRight') setWidth(width + 16)
        else return
        e.preventDefault()
      }}
      className="group absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize outline-none touch-none"
    >
      <span className="mx-auto block h-full w-px bg-transparent transition-colors group-hover:bg-ring/60 group-focus-visible:bg-ring group-active:bg-ring" />
    </div>
  )
}

/** The third column with no note open: where a note will appear, and a way to start one. */
export function NoNoteOpen({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
      <p className="font-medium">{t('layout.pickNote')}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{t('layout.pickNoteBody')}</p>
      <Button variant="outline" className="mt-1 rounded-full" onClick={onNew}>
        <SquarePen />
        {t('sidebar.newNote')}
      </Button>
    </div>
  )
}
