import {
  addYCommentReply,
  addYCommentThread,
  COMMENTS_FIELD,
  type CommentMention,
  type CommentMessage,
  CommentsRepo,
  type CommentThread,
  deleteYCommentMessage,
  type Note,
  readYComments,
  type SharedMember,
  setYCommentStatus,
} from '@fixnote/core'
import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sharedContext, useAccount } from '../../lib/account/account'
import type { LiveEditing } from '../../lib/collab/live'
import {
  markCommentsRead,
  registerCommentOpener,
  takeCommentOpenRequest,
  useCommentAlerts,
} from '../../lib/comments/store'
import { useDb } from '../../lib/db'
import {
  type CapturedAnchor,
  type CommentHighlightRange,
  captureSelectionAnchor,
  resolveThreadRange,
  scrollToComment,
  setCommentHighlights,
} from './comments-highlight'

export function useNoteComments({
  editor,
  note,
  live,
  readOnly,
  onOpenCountChange,
}: {
  editor: Editor | null
  note: Note
  live?: LiveEditing
  readOnly: boolean
  onOpenCountChange?: (count: number) => void
}) {
  const { driver } = useDb()
  const accountEmail = useAccount((s) => s.email)
  const repo = useMemo(() => new CommentsRepo(driver), [driver])
  const [threads, setThreads] = useState<CommentThread[]>([])
  const [open, setOpen] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CapturedAnchor | null>(null)
  const [collaborators, setCollaborators] = useState<SharedMember[]>([])
  const [orphanThreadIds, setOrphanThreadIds] = useState<Set<string>>(() => new Set())
  const [threadOffsets, setThreadOffsets] = useState<Map<string, number>>(() => new Map())
  const rangesRef = useRef<Map<string, { from: number; to: number }>>(new Map())

  const allEvents = useCommentAlerts((s) => s.events)
  const unreadThreadIds = useMemo(() => {
    const set = new Set<string>()
    if (!note.sharedId) return set
    for (const ev of allEvents) {
      if (ev.sharedNoteId === note.sharedId) set.add(ev.threadId)
    }
    return set
  }, [allEvents, note.sharedId])

  const currentUser = useMemo(() => {
    if (live) return { id: live.user.id, email: live.user.email }
    const ctx = sharedContext()
    return { id: ctx?.userId ?? 'local', email: ctx?.email ?? accountEmail }
  }, [accountEmail, live])

  // Load & subscribe to comment threads.
  useEffect(() => {
    if (live) {
      const ydoc = live.session.doc
      const map = ydoc.getMap(COMMENTS_FIELD)
      const refresh = () => setThreads(readYComments(ydoc))
      refresh()
      map.observeDeep(refresh)
      return () => map.unobserveDeep(refresh)
    }
    let cancelled = false
    void repo.list(note.id).then((list) => {
      if (!cancelled) setThreads(list)
    })
    return () => {
      cancelled = true
    }
  }, [live, note.id, repo])

  // Load collaborators for @mention autocomplete on shared notes when the panel opens.
  useEffect(() => {
    if (!live) {
      setCollaborators([])
      return
    }
    if (!open) return
    const ctx = sharedContext()
    if (!ctx) return
    let cancelled = false
    void ctx.shared
      .collaborators(live.sharedId)
      .then((list) => {
        if (!cancelled) setCollaborators(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [live, open])

  // Report open thread count to the note header.
  const openCount = useMemo(() => threads.filter((t) => t.status === 'open').length, [threads])
  useEffect(() => {
    onOpenCountChange?.(openCount)
  }, [onOpenCountChange, openCount])

  // Resolve and apply ProseMirror highlight decorations for threads.
  const syncHighlights = useCallback(() => {
    if (!editor || editor.isDestroyed) return
    const nextMap = new Map<string, { from: number; to: number }>()
    const nextOffsets = new Map<string, number>()
    const nextOrphans = new Set<string>()
    const ranges: CommentHighlightRange[] = []
    for (const thread of threads) {
      const resolved = resolveThreadRange(editor, thread, live)
      if (!resolved) {
        nextOrphans.add(thread.id)
        continue
      }
      nextMap.set(thread.id, resolved)
      nextOffsets.set(thread.id, resolved.from)
      if (thread.status === 'open' || thread.id === activeThreadId) {
        ranges.push({
          id: thread.id,
          from: resolved.from,
          to: resolved.to,
          active: thread.id === activeThreadId && open,
        })
      }
    }
    rangesRef.current = nextMap
    setThreadOffsets(nextOffsets)
    setOrphanThreadIds(nextOrphans)
    setCommentHighlights(editor, ranges)
  }, [activeThreadId, editor, live, open, threads])

  useEffect(() => {
    syncHighlights()
  }, [syncHighlights])

  // Re-resolve when the document finishes syncing or changes substantially.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onUpdate = () => {
      clearTimeout(timer)
      timer = setTimeout(syncHighlights, 180)
    }
    editor.on('update', onUpdate)
    return () => {
      clearTimeout(timer)
      editor.off('update', onUpdate)
    }
  }, [editor, syncHighlights])

  const selectThread = useCallback(
    (threadId: string) => {
      setOpen(true)
      setActiveThreadId(threadId)
      const range = rangesRef.current.get(threadId)
      if (editor && range) scrollToComment(editor, range)
      if (note.sharedId && unreadThreadIds.has(threadId)) {
        void markCommentsRead(sharedContext()?.shared ?? null, note.sharedId, threadId)
      }
    },
    [editor, note.sharedId, unreadThreadIds],
  )

  // Handle incoming jump requests from the Bell notifications popover.
  useEffect(() => {
    const unregister = registerCommentOpener(note.id, (threadId) => selectThread(threadId))
    return unregister
  }, [note.id, selectThread])

  useEffect(() => {
    if (!editor) return
    const requested = takeCommentOpenRequest(note.id)
    if (requested) selectThread(requested)
  }, [editor, note.id, selectThread])

  const startDraft = useCallback(() => {
    if (!editor || editor.isDestroyed || readOnly) return
    const { from, to } = editor.state.selection
    if (from === to) {
      setOpen(true)
      return
    }
    const anchor = captureSelectionAnchor(editor, { from, to }, live)
    if (!anchor) return
    setDraft(anchor)
    setActiveThreadId(null)
    setOpen(true)
  }, [editor, live, readOnly])

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      if (!next) setDraft(null)
      return next
    })
  }, [])

  const openPanel = useCallback(
    (threadId?: string) => {
      if (threadId) selectThread(threadId)
      else setOpen(true)
    },
    [selectThread],
  )

  const createThread = useCallback(
    async (body: string, mentions: CommentMention[]) => {
      if (!draft || readOnly) return
      const anchor = draft
      setDraft(null)
      const now = Date.now()
      const thread: CommentThread = {
        id: crypto.randomUUID(),
        quote: anchor.quote,
        contextBefore: anchor.contextBefore,
        contextAfter: anchor.contextAfter,
        from: anchor.from,
        to: anchor.to,
        ...(anchor.anchorFrom ? { anchorFrom: anchor.anchorFrom } : {}),
        ...(anchor.anchorTo ? { anchorTo: anchor.anchorTo } : {}),
        status: 'open',
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: crypto.randomUUID(),
            authorId: currentUser.id,
            authorEmail: currentUser.email,
            body,
            mentions,
            createdAt: now,
          },
        ],
      }
      if (live && editor && !editor.isDestroyed) {
        addYCommentThread(live.session.doc, thread)
        setActiveThreadId(thread.id)
        await live.persist(editor.getMarkdown(), { immediate: true })
        const mentionIds = [...new Set(mentions.map((m) => m.userId))]
        void sharedContext()
          ?.shared.notifyComment(live.sharedId, thread.id, mentionIds, false)
          .catch(() => undefined)
        return
      }
      await repo.save(note.id, thread)
      setThreads((prev) => [...prev, thread])
      setActiveThreadId(thread.id)
    },
    [currentUser.email, currentUser.id, draft, editor, live, note.id, readOnly, repo],
  )

  const reply = useCallback(
    async (threadId: string, body: string, mentions: CommentMention[]) => {
      if (readOnly) return
      const msg: CommentMessage = {
        id: crypto.randomUUID(),
        authorId: currentUser.id,
        authorEmail: currentUser.email,
        body,
        mentions,
        createdAt: Date.now(),
      }
      if (live && editor && !editor.isDestroyed) {
        addYCommentReply(live.session.doc, threadId, msg)
        await live.persist(editor.getMarkdown(), { immediate: true })
        const mentionIds = [...new Set(mentions.map((m) => m.userId))]
        void sharedContext()
          ?.shared.notifyComment(live.sharedId, threadId, mentionIds, true)
          .catch(() => undefined)
        return
      }
      const existing = threads.find((th) => th.id === threadId)
      if (!existing) return
      const updated: CommentThread = {
        ...existing,
        status: 'open',
        updatedAt: msg.createdAt,
        messages: [...existing.messages, msg],
      }
      await repo.save(note.id, updated)
      setThreads((prev) => prev.map((th) => (th.id === threadId ? updated : th)))
    },
    [currentUser.email, currentUser.id, editor, live, note.id, readOnly, repo, threads],
  )

  const setStatus = useCallback(
    async (threadId: string, status: 'open' | 'resolved') => {
      if (readOnly) return
      if (live && editor && !editor.isDestroyed) {
        setYCommentStatus(live.session.doc, threadId, status)
        await live.persist(editor.getMarkdown(), { immediate: true })
        return
      }
      const existing = threads.find((th) => th.id === threadId)
      if (!existing) return
      const updated: CommentThread = { ...existing, status, updatedAt: Date.now() }
      await repo.save(note.id, updated)
      setThreads((prev) => prev.map((th) => (th.id === threadId ? updated : th)))
    },
    [editor, live, note.id, readOnly, repo, threads],
  )

  const deleteMessage = useCallback(
    async (threadId: string, messageId: string) => {
      if (readOnly) return
      if (live && editor && !editor.isDestroyed) {
        deleteYCommentMessage(live.session.doc, threadId, messageId)
        await live.persist(editor.getMarkdown(), { immediate: true })
        return
      }
      const existing = threads.find((th) => th.id === threadId)
      if (!existing) return
      const remaining = existing.messages.filter((m) => m.id !== messageId)
      if (!remaining.length) {
        await repo.remove(note.id, threadId)
        setThreads((prev) => prev.filter((th) => th.id !== threadId))
      } else {
        const updated: CommentThread = {
          ...existing,
          updatedAt: Date.now(),
          messages: remaining,
        }
        await repo.save(note.id, updated)
        setThreads((prev) => prev.map((th) => (th.id === threadId ? updated : th)))
      }
    },
    [editor, live, note.id, readOnly, repo, threads],
  )

  // Sort threads by document position so the side panel follows the reading order of the note.
  const orderedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      const ra = threadOffsets.get(a.id)
      const rb = threadOffsets.get(b.id)
      if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb
      if (ra !== undefined && rb === undefined) return -1
      if (ra === undefined && rb !== undefined) return 1
      return a.createdAt - b.createdAt
    })
  }, [threads, threadOffsets])

  return {
    open,
    threads: orderedThreads,
    activeThreadId,
    unreadThreadIds,
    orphanThreadIds,
    collaborators,
    currentUserId: currentUser.id,
    draft,
    openPanel,
    toggleOpen,
    close: () => {
      setOpen(false)
      setDraft(null)
    },
    selectThread,
    startDraft,
    cancelDraft: () => setDraft(null),
    createThread: (body: string, mentions: CommentMention[]) => void createThread(body, mentions),
    reply: (threadId: string, body: string, mentions: CommentMention[]) =>
      void reply(threadId, body, mentions),
    setStatus: (threadId: string, status: 'open' | 'resolved') => void setStatus(threadId, status),
    deleteMessage: (threadId: string, messageId: string) => void deleteMessage(threadId, messageId),
  }
}
