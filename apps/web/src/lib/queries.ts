import type { Note, NoteCursor, NoteFilter } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useRepo } from './db'

export const keys = {
  notes: ['notes'] as const,
  list: (filter: NoteFilter) => ['notes', 'list', filter] as const,
  note: (id: string) => ['notes', 'one', id] as const,
  search: (q: string) => ['notes', 'search', q] as const,
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

export function useNote(id: string) {
  const repo = useRepo()
  return useQuery({ queryKey: keys.note(id), queryFn: () => repo.getNote(id) })
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

export function useRecents(limit = 8) {
  const repo = useRepo()
  return useQuery({
    queryKey: [...keys.notes, 'recents', limit],
    queryFn: async () => (await repo.listNotes({ limit })).items,
  })
}

/** Everything derived from notes: lists, counts, tags, folder counts. */
export function useInvalidateNotes() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.notes }),
      qc.invalidateQueries({ queryKey: keys.counts }),
      qc.invalidateQueries({ queryKey: keys.tags }),
      qc.invalidateQueries({ queryKey: keys.folders }),
    ])
}

export function useCreateNote() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return useMutation({
    mutationFn: (input: { content: string; folderId?: string | null }) => repo.createNote(input),
    onSuccess: invalidate,
  })
}

export function useDeleteNote() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return useMutation({
    mutationFn: (id: string) => repo.deleteNote(id),
    onSuccess: invalidate,
  })
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

export function dailyTemplate(d = new Date()): string {
  const title = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'full' }).format(d)
  const heading = title.charAt(0).toLocaleUpperCase() + title.slice(1)
  return `# ${heading}\n\n## ${i18n.t('daily.tasks')}\n\n- [ ] \n\n## ${i18n.t('daily.notes')}\n\n`
}

export function useOpenDaily() {
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  return useMutation({
    mutationFn: (): Promise<Note> => repo.getOrCreateDaily(localDate(), () => dailyTemplate()),
    onSuccess: invalidate,
  })
}
