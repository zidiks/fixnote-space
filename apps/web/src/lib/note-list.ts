import { joinPages, type NoteFilter } from '@fixnote/core'
import { useEffect, useMemo, useRef } from 'react'
import { useUi } from '../app/store'
import { useNotesInfinite, usePinnedNotes } from './queries'
import { sections } from './sections'

/**
 * One list of notes, whatever draws it (the grid of `NoteGrid`, the column of the notes layout):
 * pages joined in the chosen order, pinned notes apart with `pinnedFirst`, date sections, what
 * "Select all" picks, and a sentinel that loads the next page as it nears the screen.
 */
export function useNoteList(filter: NoteFilter, pinnedFirst: boolean) {
  const sort = useUi((s) => s.noteSort)
  const listFilter = useMemo(
    () => (pinnedFirst ? { ...filter, pinned: false } : filter),
    [filter, pinnedFirst],
  )
  const query = useNotesInfinite(listFilter, sort)
  const pinnedData = usePinnedNotes(filter, pinnedFirst, sort).data
  const pinned = useMemo(() => (pinnedFirst ? (pinnedData ?? []) : []), [pinnedFirst, pinnedData])
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
  const pickable = useMemo(() => [...pinned, ...notes], [pinned, notes])

  return {
    sort,
    /** The date a note shows: when it was created (sorted by creation) or last edited. */
    date: sort === 'created' ? ('created' as const) : ('edited' as const),
    pending: query.isPending,
    loadingMore: isFetchingNextPage,
    notes,
    pinned,
    groups,
    pickable,
    empty: !notes.length && !pinned.length,
    sentinel,
  }
}
