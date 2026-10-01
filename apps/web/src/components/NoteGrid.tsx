import { joinPages, type NoteFilter, type NoteSort, type NoteSummary } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@fixnote/ui'
import {
  ArrowDownAZ,
  CalendarPlus,
  Check,
  Clock,
  LayoutGrid,
  List,
  type LucideIcon,
  Pin,
  Plus,
  Rows3,
} from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { type NoteView, useUi } from '../app/store'
import { useNotesInfinite, usePinnedNotes } from '../lib/queries'
import { type DateGroup, dateGroup, dateGroupKey } from '../lib/time'
import { NoteCard, NoteLine, NoteRow } from './NoteCard'
import { SelectionBar } from './SelectionBar'

interface Section {
  key: string
  group: DateGroup | null
  notes: NoteSummary[]
}

/**
 * Sorted by a date, notes come newest first, so each date group is one run of the list. By title
 * there are no groups.
 */
function sections(notes: NoteSummary[], sort: NoteSort, now: Date): Section[] {
  if (sort === 'title') return notes.length ? [{ key: 'all', group: null, notes }] : []
  const out: Section[] = []
  for (const n of notes) {
    const group = dateGroup(sort === 'created' ? n.createdAt : n.updatedAt, now)
    const key = dateGroupKey(group)
    const last = out.at(-1)
    if (last?.key === key) last.notes.push(n)
    else out.push({ key, group, notes: [n] })
  }
  return out
}

function useGroupLabel() {
  const { t, i18n } = useTranslation()
  return (g: DateGroup) => {
    if (g.kind === 'year') return String(g.year)
    if (g.kind === 'monthOf') {
      const name = new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: 'long' }).format(
        new Date(g.year, g.month, 1),
      )
      return name.charAt(0).toLocaleUpperCase(i18n.resolvedLanguage) + name.slice(1)
    }
    return t(`home.groups.${g.kind}`)
  }
}

const VIEWS: { view: NoteView; icon: LucideIcon }[] = [
  { view: 'cards', icon: LayoutGrid },
  { view: 'list', icon: List },
  { view: 'compact', icon: Rows3 },
]
const SORTS: { sort: NoteSort; icon: LucideIcon }[] = [
  { sort: 'edited', icon: Clock },
  { sort: 'created', icon: CalendarPlus },
  { sort: 'title', icon: ArrowDownAZ },
]

/** How lists of notes look and are ordered, remembered on this device. */
export function ViewMenu({ className }: { className?: string }) {
  const { t } = useTranslation()
  const view = useUi((s) => s.noteView)
  const sort = useUi((s) => s.noteSort)
  const setView = useUi((s) => s.setNoteView)
  const setSort = useUi((s) => s.setNoteSort)
  const Current = VIEWS.find((v) => v.view === view)?.icon ?? LayoutGrid
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className={cn('rounded-full', className)}
          aria-label={t('view.menu')}
        >
          <Current />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{t('view.title')}</DropdownMenuLabel>
        {VIEWS.map(({ view: v, icon: Icon }) => (
          <DropdownMenuItem key={v} onSelect={() => setView(v)}>
            <Icon />
            <span className="flex-1">{t(`view.${v}`)}</span>
            <Check className={cn(v !== view && 'invisible')} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('view.sort')}</DropdownMenuLabel>
        {SORTS.map(({ sort: o, icon: Icon }) => (
          <DropdownMenuItem key={o} onSelect={() => setSort(o)}>
            <Icon />
            <span className="flex-1">{t(`view.by.${o}`)}</span>
            <Check className={cn(o !== sort && 'invisible')} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The container of one section, by view: a grid of cards or a bordered list of rows. */
function Items({ view, children }: { view: NoteView; children: React.ReactNode }) {
  return view === 'cards' ? (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
  ) : (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">{children}</ul>
  )
}

/**
 * Notes as cards, rows or lines (the view picked in `ViewMenu`) with infinite scroll: the next
 * page loads as the sentinel nears the viewport. With `pinnedFirst` (Home, folders), pinned notes
 * get their own section on top.
 */
export function NoteGrid({
  filter,
  empty,
  pinnedFirst = false,
  onNew,
}: {
  filter: NoteFilter
  empty: React.ReactNode
  pinnedFirst?: boolean
  /** Shows a "New note" item first (in a folder: a note in that folder). */
  onNew?: () => void
}) {
  const { t } = useTranslation()
  const view = useUi((s) => s.noteView)
  const sort = useUi((s) => s.noteSort)
  const listFilter = useMemo(
    () => (pinnedFirst ? { ...filter, pinned: false } : filter),
    [filter, pinnedFirst],
  )
  const query = useNotesInfinite(listFilter, sort)
  const pinned = usePinnedNotes(filter, pinnedFirst, sort).data ?? []
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query

  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Each note once and in order, also when pages refetched after a sync overlap.
  const notes = useMemo(
    () => joinPages(query.data?.pages.map((p) => p.items) ?? [], sort),
    [query.data, sort],
  )
  const groups = useMemo(() => sections(notes, sort, new Date()), [notes, sort])
  // What "Select all" picks: every note on screen, the pinned ones too.
  const pickable = useMemo(
    () => (pinnedFirst ? [...pinned, ...notes] : notes),
    [pinnedFirst, pinned, notes],
  )
  const label = useGroupLabel()
  const date = sort === 'created' ? 'created' : 'edited'
  const Item = view === 'cards' ? NoteCard : view === 'list' ? NoteRow : NoteLine

  if (query.isPending) {
    return <p className="mt-6 text-sm text-muted-foreground">{t('common.loading')}</p>
  }
  const newItem = onNew ? (
    <li>
      {view === 'cards' ? (
        <NewNoteCard onClick={onNew} />
      ) : (
        <NewNoteRow onClick={onNew} compact={view === 'compact'} />
      )}
    </li>
  ) : null
  if (!notes.length && !(pinnedFirst && pinned.length)) {
    return (
      <>
        {newItem ? (
          <div className="mt-6">
            <Items view={view}>{newItem}</Items>
          </div>
        ) : null}
        {empty}
      </>
    )
  }
  // The new note goes with the newest notes (Today), among the pinned ones only when there is
  // nothing else.
  const newIn = groups[0]?.key ?? 'pinned'

  return (
    <>
      {pinnedFirst && pinned.length ? (
        <section aria-label={t('pin.section')} className="mt-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Pin className="size-3.5" />
            {t('pin.section')}
          </h2>
          <Items view={view}>
            {newIn === 'pinned' ? newItem : null}
            {pinned.map((n) => (
              <li key={n.id}>
                <Item note={n} inFolder={filter.folderId} date={date} />
              </li>
            ))}
          </Items>
        </section>
      ) : null}
      {groups.map((section) => (
        <section
          key={section.key}
          aria-label={section.group ? label(section.group) : t('view.allNotes')}
          className="mt-6"
        >
          {section.group ? (
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              {label(section.group)}
            </h2>
          ) : null}
          <Items view={view}>
            {newIn === section.key ? newItem : null}
            {section.notes.map((n) => (
              <li key={n.id}>
                <Item note={n} inFolder={filter.folderId} date={date} />
              </li>
            ))}
          </Items>
        </section>
      ))}
      <div ref={sentinel} aria-hidden className="h-px" />
      <SelectionBar notes={pickable} />
      {isFetchingNextPage ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}
    </>
  )
}

function NewNoteRow({ onClick, compact }: { onClick: () => void; compact: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 text-left text-sm text-muted-foreground outline-none hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
        compact ? 'h-10' : 'h-12 px-4',
      )}
    >
      <Plus className="size-4" />
      {t('sidebar.newNote')}
    </button>
  )
}

function NewNoteCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors outline-none hover:border-foreground/30 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <Plus className="size-5" />
      {t('sidebar.newNote')}
    </button>
  )
}

export function EmptyState({ title, body }: { title?: string; body: string }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed px-6 py-16 text-center">
      {title ? <p className="font-medium">{title}</p> : null}
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
