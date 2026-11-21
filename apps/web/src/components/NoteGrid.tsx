import type { NoteFilter, NoteSort, NoteSummary } from '@fixnote/core'
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
import { type NoteView, useUi } from '../app/store'
import { useNoteList } from '../lib/note-list'
import type { DateGroup } from '../lib/time'
import { NoteCard, NoteLine, NoteRow } from './NoteCard'
import { SelectionBar } from './SelectionBar'
import { useCardColumns, VirtualList } from './VirtualList'

export function useGroupLabel() {
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

/**
 * How lists of notes look and are ordered, remembered on this device. `sortOnly`: the column of
 * the notes layout, whose cards always look the same.
 */
export function ViewMenu({
  className,
  sortOnly = false,
}: {
  className?: string
  sortOnly?: boolean
}) {
  const { t } = useTranslation()
  const view = useUi((s) => s.noteView)
  const sort = useUi((s) => s.noteSort)
  const setView = useUi((s) => s.setNoteView)
  const setSort = useUi((s) => s.setNoteSort)
  const Current = sortOnly
    ? (SORTS.find((o) => o.sort === sort)?.icon ?? Clock)
    : (VIEWS.find((v) => v.view === view)?.icon ?? LayoutGrid)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={sortOnly ? 'ghost' : 'outline'}
          size={sortOnly ? 'icon-xs' : 'icon-sm'}
          className={cn(!sortOnly && 'rounded-full', className)}
          aria-label={sortOnly ? t('view.sort') : t('view.menu')}
        >
          <Current />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {sortOnly ? null : (
          <>
            <DropdownMenuLabel>{t('view.title')}</DropdownMenuLabel>
            {VIEWS.map(({ view: v, icon: Icon }) => (
              <DropdownMenuItem key={v} onSelect={() => setView(v)}>
                <Icon />
                <span className="flex-1">{t(`view.${v}`)}</span>
                <Check className={cn(v !== view && 'invisible')} />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
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
  const columns = useCardColumns()
  const {
    pending,
    loadingMore,
    pinned,
    groups,
    pickable,
    empty: none,
    sentinel,
    date,
  } = useNoteList(filter, pinnedFirst)
  const label = useGroupLabel()
  const Item = view === 'cards' ? NoteCard : view === 'list' ? NoteRow : NoteLine

  if (pending) {
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
  if (none) {
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

  type Row =
    | { key: string; title: string | null; pinned?: boolean }
    | { key: string; notes: (NoteSummary | null)[]; first: boolean; last: boolean }
  const rows: Row[] = []
  const add = (key: string, notes: NoteSummary[], title: string | null, isPinned = false) => {
    rows.push({ key: `header:${key}`, title, pinned: isPinned })
    const entries: (NoteSummary | null)[] = newIn === key && onNew ? [null, ...notes] : notes
    const size = view === 'cards' ? columns : 1
    for (let i = 0; i < entries.length; i += size) {
      rows.push({
        key: entries[i]?.id ?? 'new',
        notes: entries.slice(i, i + size),
        first: i === 0,
        last: i + size >= entries.length,
      })
    }
  }
  if (pinned.length) add('pinned', pinned, t('pin.section'), true)
  for (const section of groups)
    add(section.key, section.notes, section.group ? label(section.group) : null)
  return (
    <>
      <VirtualList
        key={`${view}:${columns}`}
        items={rows}
        itemKey={(row) => row.key}
        estimate={(row) =>
          'notes' in row
            ? view === 'cards'
              ? 220
              : view === 'list'
                ? 90
                : 40
            : row.title
              ? 52
              : 24
        }
        render={(row) =>
          'notes' in row ? (
            <div
              className={cn(
                view === 'cards'
                  ? 'grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2 lg:grid-cols-3'
                  : 'border-x border-b bg-card shadow-xs',
                view !== 'cards' && row.first && 'rounded-t-xl border-t',
                view !== 'cards' && row.last && 'rounded-b-xl overflow-hidden',
              )}
            >
              {row.notes.map((note) => (
                <div
                  key={note?.id ?? 'new'}
                  className={view === 'cards' ? 'h-full [&>button]:h-full' : undefined}
                >
                  {note ? (
                    <Item note={note} inFolder={filter.folderId} date={date} />
                  ) : onNew ? (
                    view === 'cards' ? (
                      <NewNoteCard onClick={onNew} />
                    ) : (
                      <NewNoteRow onClick={onNew} compact={view === 'compact'} />
                    )
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="pt-6 pb-2">
              {row.title ? (
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                  {row.pinned ? <Pin className="size-3.5" /> : null}
                  {row.title}
                </h2>
              ) : null}
            </div>
          )
        }
      />
      <div ref={sentinel} aria-hidden className="h-px" />
      <SelectionBar notes={pickable} />
      {loadingMore ? (
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
