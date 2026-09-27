import type { Note, NoteCursor, NoteFilter, NotesRepo } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { requestSync, sharedContext } from './account/account'
import { findSimilar, notifyNotesChanged, useAssistant } from './assistant/assistant'
import { useRepo } from './db'

export const keys = {
  notes: ['notes'] as const,
  list: (filter: NoteFilter) => ['notes', 'list', filter] as const,
  note: (id: string) => ['notes', 'one', id] as const,
  search: (q: string) => ['notes', 'search', q] as const,
  similar: (q: string) => ['notes', 'similar', q] as const,
  counts: ['counts'] as const,
  folders: ['folders'] as const,
  tags: ['tags'] as const,
}

const PAGE = 30

export function useNotesInfinite(filter: NoteFilter) {
  const repo = useRepo()
  return useInfiniteQuery({
    queryKey: keys.list(filter),
    queryFn: ({ pageParam }) => repo.listNotes({ filter, cursor: pageParam, limit: PAGE }),
    initialPageParam: null as NoteCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  })
}

/** Pinned notes for a list: all of them, they are few. */
export function usePinnedNotes(filter: NoteFilter, enabled = true) {
  const repo = useRepo()
  return useQuery({
    queryKey: keys.list({ ...filter, pinned: true }),
    queryFn: async () =>
      (await repo.listNotes({ filter: { ...filter, pinned: true }, limit: 200 })).items,
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useNote(id: string, opts: { enabled?: boolean; fresh?: boolean } = {}) {
  const repo = useRepo()
  return useQuery({
    queryKey: keys.note(id),
    queryFn: () => repo.getNote(id),
    enabled: opts.enabled ?? true,
    // The editor must start from what is stored now, never from a cached copy.
    ...(opts.fresh ? { refetchOnMount: 'always' as const } : {}),
  })
}

export function useCounts() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.counts, queryFn: () => repo.counts() })
}

export function useFolders() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.folders, queryFn: () => repo.listFolders() })
}

export function useTags() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.tags, queryFn: () => repo.listTags() })
}

export function useSearch(q: string) {
  const repo = useRepo()
  const query = q.trim()
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => repo.search(query, { limit: 20 }),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  })
}

/** Meaning-based matches for Spotlight, once the assistant's local index is ready. */
export function useSimilar(q: string) {
  const query = q.trim()
  const ready = useAssistant((s) => s.semantic === 'ready')
  return useQuery({
    queryKey: keys.similar(query),
    queryFn: () => findSimilar(query),
    enabled: ready && query.length >= 3,
    placeholderData: keepPreviousData,
  })
}

export function useRecents(limit = 8) {
  const repo = useRepo()
  return useQuery({
    queryKey: [...keys.notes, 'recents', limit],
    queryFn: async () => (await repo.listNotes({ limit })).items,
  })
}

/** After a local change: refresh everything derived from notes and schedule a sync. */
export function useInvalidateNotes() {
  const qc = useQueryClient()
  return () => {
    requestSync()
    notifyNotesChanged()
    return Promise.all([
      qc.invalidateQueries({ queryKey: keys.notes }),
      qc.invalidateQueries({ queryKey: keys.counts }),
      qc.invalidateQueries({ queryKey: keys.tags }),
      qc.invalidateQueries({ queryKey: keys.folders }),
    ])
  }
}

export function useCreateNote() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return useMutation({
    mutationFn: (input: { content: string; folderId?: string | null }) => repo.createNote(input),
    onSuccess: invalidate,
  })
}

/**
 * Soft-deletes a note and offers Undo. Everything after the delete goes through the repo and the
 * store, because the component that asked may be gone by the time Undo is pressed.
 */
export function useDeleteWithUndo() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return async (id: string) => {
    const route = useUi.getState().route
    if ((await deleteShared(repo, id)) === 'done') {
      await invalidate()
      if (route.kind === 'note' && route.id === id) useUi.getState().navigate({ kind: 'home' })
      return
    }
    await repo.deleteNote(id)
    await invalidate()
    if (route.kind === 'note' && route.id === id) useUi.getState().goBack()
    toast(i18n.t('note.deleted'), {
      action: {
        label: i18n.t('common.undo'),
        onClick: () =>
          void repo
            .restoreNote(id)
            .then(invalidate)
            .then(() => {
              if (route.kind === 'note' && route.id === id) useUi.getState().navigate(route)
            }),
      },
    })
  }
}

/**
 * Deleting a shared note. One shared on its own: its owner stops sharing it and then deletes it as
 * usual; anyone else leaves it ('done'). One in a shared folder: owner and editors delete it as
 * usual (sync deletes it for everyone once its undo has run out); a viewer cannot ('done').
 */
async function deleteShared(repo: NotesRepo, id: string): Promise<'done' | 'delete'> {
  const note = await repo.getNote(id)
  const ctx = note?.sharedId ? sharedContext() : null
  const doc = ctx && note?.sharedId ? await ctx.shared.doc(note.sharedId) : null
  if (!ctx || !doc) return 'delete'
  if (doc.folderSharedId) {
    if (doc.role !== 'view') return 'delete'
    toast(i18n.t('people.viewOnly'))
    return 'done'
  }
  if (doc.role === 'owner') {
    await ctx.shared.unshare(doc.sharedId)
    return 'delete'
  }
  await ctx.shared.leave(doc.sharedId)
  toast(i18n.t('people.left'))
  return 'done'
}

export function useMoveNote() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      repo.moveNote(id, folderId),
    onSuccess: invalidate,
  })
}

export function useSetPinned() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => repo.setPinned(id, pinned),
    onSuccess: invalidate,
  })
}

export function useFolderMutations() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return {
    create: useMutation({
      mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) =>
        repo.createFolder(name, parentId ?? null),
      onSuccess: invalidate,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => repo.renameFolder(id, name),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => repo.deleteFolder(id),
      onSuccess: invalidate,
    }),
  }
}

/** Local calendar date, `YYYY-MM-DD`. */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `date` (YYYY-MM-DD) moved by `days`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

export function dailyTemplate(d = new Date()): string {
  const title = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'full' }).format(d)
  const heading = title.charAt(0).toLocaleUpperCase() + title.slice(1)
  return `# ${heading}\n\n## ${i18n.t('daily.tasks')}\n\n- [ ] \n\n## ${i18n.t('daily.notes')}\n\n`
}

export function useOpenDaily() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return useMutation({
    /** Today's note, or the one of `date` (YYYY-MM-DD), made if it does not exist yet. */
    mutationFn: (date?: string): Promise<Note> =>
      repo.getOrCreateDaily(date ?? localDate(), () =>
        dailyTemplate(date ? new Date(`${date}T12:00:00`) : undefined),
      ),
    onSuccess: invalidate,
  })
}
