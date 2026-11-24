import type { CommentNotification, Folder, SharedNotes } from '@fixnote/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { create } from 'zustand'
import { useUi } from '../../app/store'
import { useDb } from '../db'

export interface CommentCount {
  total: number
  mentions: number
}

function summarize(events: CommentNotification[]): Record<string, CommentCount> {
  const bySharedId: Record<string, CommentCount> = {}
  for (const ev of events) {
    const entry = bySharedId[ev.sharedNoteId] ?? { total: 0, mentions: 0 }
    entry.total++
    if (ev.kind === 'mention') entry.mentions++
    bySharedId[ev.sharedNoteId] = entry
  }
  return bySharedId
}

interface CommentAlertState {
  events: CommentNotification[]
  bySharedId: Record<string, CommentCount>
  setEvents: (events: CommentNotification[]) => void
  markReadLocal: (sharedId?: string, threadId?: string) => void
  clear: () => void
}

export const useCommentAlerts = create<CommentAlertState>((set) => ({
  events: [],
  bySharedId: {},
  setEvents: (events) =>
    set((s) => {
      if (s.events.length === events.length && s.events.every((e, i) => e.id === events[i]?.id)) {
        return s
      }
      return { events, bySharedId: summarize(events) }
    }),
  markReadLocal: (sharedId, threadId) =>
    set((s) => {
      const next = s.events.filter((ev) => {
        if (sharedId && ev.sharedNoteId !== sharedId) return true
        if (threadId && ev.threadId !== threadId) return true
        return false
      })
      if (next.length === s.events.length) return s
      return { events: next, bySharedId: summarize(next) }
    }),
  clear: () => set((s) => (s.events.length === 0 ? s : { events: [], bySharedId: {} })),
}))

export async function refreshCommentEvents(shared: SharedNotes | null): Promise<void> {
  if (!shared) {
    useCommentAlerts.getState().clear()
    return
  }
  const events = await shared.unreadCommentEvents()
  useCommentAlerts.getState().setEvents(events)
}

export async function markCommentsRead(
  shared: SharedNotes | null,
  sharedId?: string,
  threadId?: string,
): Promise<void> {
  useCommentAlerts.getState().markReadLocal(sharedId, threadId)
  if (!shared) return
  await shared.markCommentsRead(sharedId, threadId).catch(() => undefined)
}

// ── Opening a specific thread when jumping from a notification ───────────────

const openers = new Map<string, (threadId: string) => void>()
let pendingOpen: { noteId: string; threadId: string } | null = null

export function registerCommentOpener(noteId: string, open: (threadId: string) => void) {
  openers.set(noteId, open)
  return () => {
    if (openers.get(noteId) === open) openers.delete(noteId)
  }
}

export function takeCommentOpenRequest(noteId: string): string | null {
  if (pendingOpen?.noteId !== noteId) return null
  const threadId = pendingOpen.threadId
  pendingOpen = null
  return threadId
}

export function requestOpenComment(noteId: string, threadId: string) {
  pendingOpen = { noteId, threadId }
  useUi.getState().navigate({ kind: 'note', id: noteId })
  const open = openers.get(noteId)
  if (open) {
    pendingOpen = null
    open(threadId)
  }
}

// ── Folder rollup counts (unread comments + mentions across subfolders) ──────

const EMPTY_FOLDER_COUNTS = new Map<string, CommentCount>()

export function useFolderCommentCounts(folders: Folder[]): Map<string, CommentCount> {
  const { driver } = useDb()
  const bySharedId = useCommentAlerts((s) => s.bySharedId)
  const sharedKeys = useMemo(() => Object.keys(bySharedId).sort(), [bySharedId])

  const { data: noteLocations } = useQuery({
    queryKey: ['comment-note-folders', sharedKeys.join(',')],
    enabled: sharedKeys.length > 0,
    queryFn: async () => {
      const placeholders = sharedKeys.map(() => '?').join(',')
      return driver.query<{ shared_id: string; folder_id: string | null }>(
        `SELECT shared_id, folder_id FROM notes WHERE shared_id IN (${placeholders}) AND deleted_at IS NULL`,
        sharedKeys,
      )
    },
  })

  return useMemo(() => {
    if (!sharedKeys.length || !noteLocations?.length) return EMPTY_FOLDER_COUNTS
    const parentById = new Map<string, string | null>()
    for (const f of folders) parentById.set(f.id, f.parentId)

    const result = new Map<string, CommentCount>()
    for (const row of noteLocations) {
      if (!row.folder_id) continue
      const count = bySharedId[row.shared_id]
      if (!count) continue
      let cur: string | null = row.folder_id
      const seen = new Set<string>()
      while (cur && !seen.has(cur)) {
        seen.add(cur)
        const entry = result.get(cur) ?? { total: 0, mentions: 0 }
        entry.total += count.total
        entry.mentions += count.mentions
        result.set(cur, entry)
        cur = parentById.get(cur) ?? null
      }
    }
    return result
  }, [bySharedId, folders, noteLocations, sharedKeys.length])
}
