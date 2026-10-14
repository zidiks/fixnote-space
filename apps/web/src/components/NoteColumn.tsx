import { type NoteFilter, type NoteSummary, subtreeCounts } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@fixnote/ui'
import { CalendarDays, Folder, House, Pin, Search, SquarePen, X } from 'lucide-react'
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { LIST_WIDTH, type ListRoute, useUi } from '../app/store'
import { listFilter } from '../lib/layout'
import { useNoteList } from '../lib/note-list'
import { useCounts, useCreateNote, useFolders, useSearch } from '../lib/queries'
import { startOfDay } from '../lib/time'
import { NoteSnippet } from './NoteCard'
import { useGroupLabel, ViewMenu } from './NoteGrid'
import { SelectionBar } from './SelectionBar'
import { Snippet } from './Spotlight'

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
}: {
  list: ListRoute
  /** The note open beside the list. */
  activeId?: string | undefined
  /** The whole width (a phone): no resize handle. */
  wide?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const width = useUi((s) => s.listWidth)
  const folders = useFolders().data
  const counts = useCounts().data
  const createNote = useCreateNote()
  const [q, setQ] = useState('')
  const query = useDeferredValue(q).trim()
  // Today starts when the list is opened; it does not shrink at midnight while on screen.
  const midnight = useMemo(() => startOfDay(), [])
  const filter = useMemo(() => listFilter(list, midnight), [list, midnight])

  const folder = list.kind === 'folder' ? folders?.find((f) => f.id === list.id) : undefined
  const title =
    list.kind === 'folder'
      ? (folder?.name ?? '')
      : list.kind === 'today'
        ? t('sidebar.daily')
        : t('nav.home')
  const Icon = list.kind === 'folder' ? Folder : list.kind === 'today' ? CalendarDays : House
  const count =
    list.kind === 'folder'
      ? folder && folders
        ? subtreeCounts(folders).get(folder.id)
        : undefined
      : list.kind === 'home'
        ? list.filter === 'inbox'
          ? counts?.inbox
          : counts?.all
        : undefined
  // View only: nothing is added to someone else's folder from here.
  const canAdd = folder?.access !== 'view'
  const newNote = () =>
    createNote.mutate(
      { content: '', folderId: list.kind === 'folder' ? list.id : null },
      { onSuccess: (n) => navigate({ kind: 'note', id: n.id }) },
    )

  return (
    <section
      aria-label={title}
      className={cn(
        'relative flex h-full min-h-0 flex-col bg-background',
        wide ? 'min-w-0 flex-1' : 'shrink-0 border-r',
      )}
      style={wide ? undefined : { width }}
    >
      <header className="space-y-2 px-3 pt-3 pb-2">
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
                  className={cn(
                    'h-7 rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:h-8',
                    on
                      ? 'border-foreground/15 bg-card shadow-xs'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`home.filters.${s}`)}
                </button>
              )
            })}
          </div>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-24">
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
            empty={
              list.kind === 'folder'
                ? t('list.emptyFolder')
                : list.kind === 'today'
                  ? t('layout.emptyToday')
                  : list.filter === 'inbox'
                    ? t('home.emptyFiltered')
                    : t('home.empty.title')
            }
          />
        )}
      </div>
      {wide ? null : <Resizer />}
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
}: {
  filter: NoteFilter
  pinnedFirst: boolean
  inFolder: string | undefined
  activeId: string | undefined
  empty: string
}) {
  const { t } = useTranslation()
  const label = useGroupLabel()
  const list = useNoteList(filter, pinnedFirst)

  if (list.pending) return <Hint>{t('common.loading')}</Hint>
  if (list.empty) return <Hint>{empty}</Hint>
  const item = (n: NoteSummary) => (
    <li key={n.id}>
      <NoteSnippet note={n} inFolder={inFolder} date={list.date} active={n.id === activeId} />
    </li>
  )
  return (
    <>
      {list.pinned.length ? (
        <section aria-label={t('pin.section')}>
          <h2 className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
            <Pin className="size-3" />
            {t('pin.section')}
          </h2>
          <ul className="space-y-0.5">{list.pinned.map(item)}</ul>
        </section>
      ) : null}
      {list.groups.map((section) => (
        <section
          key={section.key}
          aria-label={section.group ? label(section.group) : t('view.allNotes')}
        >
          {section.group ? (
            <h2 className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
              {label(section.group)}
            </h2>
          ) : null}
          <ul className="space-y-0.5">{section.notes.map(item)}</ul>
        </section>
      ))}
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
      <ul className="space-y-0.5 pt-1">
        {hits.map((h) => (
          <li key={h.note.id}>
            <NoteSnippet
              note={h.note}
              inFolder={inFolder}
              active={h.note.id === activeId}
              excerpt={h.snippet ? <Snippet text={h.snippet} /> : undefined}
            />
          </li>
        ))}
      </ul>
      <SelectionBar notes={notes} />
    </>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm text-muted-foreground">{children}</p>
}

/** The column's right edge: drag (or arrow keys) to change its width; double-click resets it. */
function Resizer() {
  const { t } = useTranslation()
  const width = useUi((s) => s.listWidth)
  const setWidth = useUi((s) => s.setListWidth)
  const drag = useRef<{ x: number; w: number } | null>(null)
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA pattern for a splitter.
    <div
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
        drag.current = { x: e.clientX, w: width }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) setWidth(d.w + e.clientX - d.x)
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
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
