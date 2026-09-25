import type { NoteFilter, NoteSummary } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { useEffect, useMemo, useRef } from 'react'
import { useNotesInfinite } from '../lib/queries'
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

/** Card grid with infinite scroll: the next page loads as the sentinel nears the viewport. */
export function NoteGrid({ filter, empty }: { filter: NoteFilter; empty: React.ReactNode }) {
  const { t } = useTranslation()
  const query = useNotesInfinite(filter)
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
  if (!notes.length) return <>{empty}</>

  return (
    <>
      {groups.map((section) => (
        <section key={section.key} aria-label={label(section.group)} className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            {label(section.group)}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.notes.map((n) => (
              <li key={n.id}>
                <NoteCard note={n} />
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

export function EmptyState({ title, body }: { title?: string; body: string }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed px-6 py-16 text-center">
      {title ? <p className="font-medium">{title}</p> : null}
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
