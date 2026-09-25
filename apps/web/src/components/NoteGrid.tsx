import type { NoteFilter } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { useEffect, useRef } from 'react'
import { useNotesInfinite } from '../lib/queries'
import { NoteCard } from './NoteCard'

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

  const notes = query.data?.pages.flatMap((p) => p.items) ?? []

  if (query.isPending) {
    return <p className="mt-6 text-sm text-muted-foreground">{t('common.loading')}</p>
  }
  if (!notes.length) return <>{empty}</>

  return (
    <>
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((n) => (
          <li key={n.id}>
            <NoteCard note={n} />
          </li>
        ))}
      </ul>
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
