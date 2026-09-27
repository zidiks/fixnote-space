import type { NoteFilter, NoteSummary } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Pin, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useNotesInfinite, usePinnedNotes } from '../lib/queries'
import { type DateGroup, dateGroup, dateGroupKey } from '../lib/time'
import { NoteCard } from './NoteCard'

interface Section {
  key: string
  group: DateGroup
  notes: NoteSummary[]
}

/** Notes come newest first, so each date group is one run of the list. */
function sections(notes: NoteSummary[], now: Date): Section[] {
  const out: Section[] = []
  for (const n of notes) {
    const group = dateGroup(n.updatedAt, now)
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

/**
 * Card grid with infinite scroll: the next page loads as the sentinel nears the viewport. With
 * `pinnedFirst` (Home, folders), pinned notes get their own section on top.
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
  /** Shows a "New note" card first in the grid (in a folder: a note in that folder). */
  onNew?: () => void
}) {
  const { t } = useTranslation()
  const listFilter = useMemo(
    () => (pinnedFirst ? { ...filter, pinned: false } : filter),
    [filter, pinnedFirst],
  )
  const query = useNotesInfinite(listFilter)
  const pinned = usePinnedNotes(filter, pinnedFirst).data ?? []
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

  const notes = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data])
  const groups = useMemo(() => sections(notes, new Date()), [notes])
  const label = useGroupLabel()

  if (query.isPending) {
    return <p className="mt-6 text-sm text-muted-foreground">{t('common.loading')}</p>
  }
  const newCard = onNew ? (
    <li>
      <NewNoteCard onClick={onNew} />
    </li>
  ) : null
  if (!notes.length && !(pinnedFirst && pinned.length)) {
    return (
      <>
        {newCard ? (
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{newCard}</ul>
        ) : null}
        {empty}
      </>
    )
  }
  // The card goes with the newest notes (Today), among the pinned ones only when there is nothing else.
  const newIn = groups[0]?.key ?? 'pinned'

  return (
    <>
      {pinnedFirst && pinned.length ? (
        <section aria-label={t('pin.section')} className="mt-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Pin className="size-3.5" />
            {t('pin.section')}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {newIn === 'pinned' ? newCard : null}
            {pinned.map((n) => (
              <li key={n.id}>
                <NoteCard note={n} inFolder={filter.folderId} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {groups.map((section) => (
        <section key={section.key} aria-label={label(section.group)} className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            {label(section.group)}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {newIn === section.key ? newCard : null}
            {section.notes.map((n) => (
              <li key={n.id}>
                <NoteCard note={n} inFolder={filter.folderId} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div ref={sentinel} aria-hidden className="h-px" />
      {isFetchingNextPage ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}
    </>
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
