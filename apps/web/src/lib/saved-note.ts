import {
  type Folder,
  joinPages,
  type Note,
  type NoteFilter,
  type NotePage,
  type NoteSort,
  type NoteSummary,
} from '@fixnote/core'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'

/** Undefined means folder ancestry is not cached: let the repository decide. */
export function matches(
  note: NoteSummary,
  filter: NoteFilter,
  folders?: Folder[],
): boolean | undefined {
  if (filter.scope === 'inbox' && note.folderId !== null) return false
  if (filter.type && note.type !== filter.type) return false
  if (filter.pinned !== undefined && (note.pinnedAt !== null) !== filter.pinned) return false
  if (filter.links && !note.url) return false
  if (filter.updatedSince !== undefined && note.updatedAt < filter.updatedSince) return false
  if (filter.folderId) {
    let id = note.folderId
    const seen = new Set<string>()
    while (id && id !== filter.folderId && !seen.has(id)) {
      seen.add(id)
      const folder = folders?.find((f) => f.id === id)
      if (!folder) return undefined
      id = folder.parentId
    }
    return id === filter.folderId
  }
  return true
}

/** Preserve keyset cursors: they describe the fetched range, even when a note moves. */
export function patchPages(
  data: InfiniteData<NotePage>,
  note: NoteSummary,
  include: boolean,
  sort: NoteSort,
): InfiniteData<NotePage> {
  const boundary = data.pages.at(-1)?.nextCursor
  const key =
    sort === 'title'
      ? note.title === ''
        ? '\u{10FFFF}'
        : note.title.replace(/[A-Z]/g, (c) => c.toLowerCase())
      : sort === 'created'
        ? note.createdAt
        : note.updatedAt
  const inside =
    !boundary ||
    (sort === 'title'
      ? key < boundary.key || (key === boundary.key && note.id <= boundary.id)
      : key > boundary.key || (key === boundary.key && note.id >= boundary.id))
  let placed = false
  const pages = data.pages.map((page) => {
    if (!page.items.some((old) => old.id === note.id)) return page
    const items = page.items.flatMap((old) => {
      if (old.id !== note.id) return [old]
      if (!include || !inside || placed) return []
      placed = true
      return [note]
    })
    return items.length === page.items.length && items.every((n, i) => n === page.items[i])
      ? page
      : { ...page, items }
  })
  const first = pages[0]
  if (include && inside && !placed && first) pages[0] = { ...first, items: [note, ...first.items] }
  return pages.every((p, i) => p === data.pages[i]) ? data : { ...data, pages }
}

/** Ordinary text saves do not refetch lists, other notes or the navigation. */
export function cacheSavedNote(qc: QueryClient, before: Note, saved: Note) {
  qc.setQueryData(['notes', 'one', saved.id], saved)
  const folders = qc.getQueryData<{ folders: Folder[] }>(['navigation'])?.folders
  const { content: _, ...summary } = saved
  for (const query of qc.getQueryCache().findAll({ queryKey: ['notes'] })) {
    const [, kind, arg, sort = 'edited'] = query.queryKey
    const data = query.state.data
    const wasInvalidated = query.state.isInvalidated
    if (!data) continue
    if (kind === 'list') {
      const include = matches(saved, arg as NoteFilter, folders)
      if (include === undefined) {
        void qc.invalidateQueries({ queryKey: query.queryKey, exact: true })
        continue
      }
      qc.setQueryData(
        query.queryKey,
        Array.isArray(data)
          ? joinPages(
              [data.filter((n: NoteSummary) => n.id !== saved.id), include ? [summary] : []],
              sort as NoteSort,
            ).slice(0, 200)
          : patchPages(data as InfiniteData<NotePage>, summary, include, sort as NoteSort),
      )
    } else if (kind === 'recents') {
      qc.setQueryData(
        query.queryKey,
        joinPages(
          [(data as NoteSummary[]).filter((n) => n.id !== saved.id), [summary]],
          'edited',
        ).slice(0, arg as number),
      )
    } else if (kind === 'search') {
      const filter = query.queryKey[3] as NoteFilter | null
      if (
        !filter ||
        matches(before, filter, folders) !== false ||
        matches(saved, filter, folders) !== false
      )
        void qc.invalidateQueries({ queryKey: query.queryKey, exact: true })
    } else if (kind === 'similar') {
      void qc.invalidateQueries({ queryKey: query.queryKey, exact: true, refetchType: 'none' })
    }
    // A remote change may have invalidated an inactive list. Patching one card cannot make the
    // rest of that snapshot fresh; it must still be read when that list is next opened.
    if (wasInvalidated && (kind === 'list' || kind === 'recents'))
      void qc.invalidateQueries({ queryKey: query.queryKey, exact: true, refetchType: 'none' })
  }
  if (
    before.folderId !== saved.folderId ||
    before.type !== saved.type ||
    !!before.url !== !!saved.url
  ) {
    void qc.invalidateQueries({ queryKey: ['navigation'] })
    void qc.invalidateQueries({ queryKey: ['notes', 'link-folders'] })
  }
}
