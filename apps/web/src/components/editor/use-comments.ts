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
import { useLlm } from '../../lib/assistant/llm'
import type { LiveEditing } from '../../lib/collab/live'
import {
  markCommentsRead,
  registerCommentOpener,
  takeCommentOpenRequest,
  useCommentAlerts,
} from '../../lib/comments/store'
import { useDb } from '../../lib/db'
import {
  type AnchorRect,
  type CapturedAnchor,
  type CommentHighlightRange,
  captureSelectionAnchor,
  getRangeRect,
  resolveThreadRange,
  scrollToComment,
  setCommentHighlights,
} from './comments-highlight'
import { projectScanText } from './privacy-scan'

const HOVER_OPEN_DELAY = 120
const HOVER_CLOSE_DELAY = 90

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
  /** All-comments overview popover (opened from the note header button). */
  const [overviewOpen, setOverviewOpen] = useState(false)
  /** Thread currently opened in the anchored Figma-style popover. */
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  /** Thread currently hovered in the editor (shows compact preview card). */
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null)
  /** New comment draft anchored to a selected range. */
  const [draft, setDraft] = useState<CapturedAnchor | null>(null)
  const [collaborators, setCollaborators] = useState<SharedMember[]>([])
  const [orphanThreadIds, setOrphanThreadIds] = useState<Set<string>>(() => new Set())
  const [threadOffsets, setThreadOffsets] = useState<Map<string, number>>(() => new Map())
  const rangesRef = useRef<Map<string, { from: number; to: number }>>(new Map())
  const hadHighlightsRef = useRef(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

  const anyUiOpen = overviewOpen || activeThreadId !== null || draft !== null

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

  // Load collaborators for @mention autocomplete on shared notes when any comment UI opens.
  useEffect(() => {
    if (!live || useLlm.getState().localOnly) {
      setCollaborators([])
      return
    }
    if (!anyUiOpen) return
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
  }, [anyUiOpen, live])

  // Report open thread count to the note header.
  const openCount = useMemo(() => threads.filter((t) => t.status === 'open').length, [threads])
  useEffect(() => {
    onOpenCountChange?.(openCount)
  }, [onOpenCountChange, openCount])

  // Resolve and apply ProseMirror highlight decorations + inline pins.
  const syncHighlights = useCallback(() => {
    if (!editor || editor.isDestroyed) return
    // Fast path: 0 threads avoids allocating Maps/Sets or dispatching extra ProseMirror transactions.
    if (!threads.length) {
      if (!hadHighlightsRef.current && rangesRef.current.size === 0) return
      hadHighlightsRef.current = false
      rangesRef.current = new Map()
      setThreadOffsets((prev) => (prev.size === 0 ? prev : new Map()))
      setOrphanThreadIds((prev) => (prev.size === 0 ? prev : new Set()))
      setCommentHighlights(editor, [])
      return
    }

    const nextMap = new Map<string, { from: number; to: number }>()
    const nextOffsets = new Map<string, number>()
    const nextOrphans = new Set<string>()
    const ranges: CommentHighlightRange[] = []
    // Compute the plain-text projection at most once for all quote-anchored threads.
    let projection: ReturnType<typeof projectScanText> | undefined
    const getProjection = () => {
      projection ??= projectScanText(editor.state.doc, 0, editor.state.doc.content.size)
      return projection
    }

    for (const thread of threads) {
      const needsProjection = !(live && thread.anchorFrom && thread.anchorTo)
      const resolved = resolveThreadRange(
        editor,
        thread,
        live,
        needsProjection ? getProjection() : undefined,
      )
      if (!resolved) {
        nextOrphans.add(thread.id)
        continue
      }
      nextMap.set(thread.id, resolved)
      nextOffsets.set(thread.id, resolved.from)
      const firstMsg = thread.messages[0]
      if (thread.status === 'open' || thread.id === activeThreadId) {
        ranges.push({
          id: thread.id,
          from: resolved.from,
          to: resolved.to,
          active: thread.id === activeThreadId,
          hovered: thread.id === hoveredThreadId,
          unread: unreadThreadIds.has(thread.id),
          count: thread.messages.length,
          authorId: firstMsg?.authorId ?? 'local',
          authorEmail: firstMsg?.authorEmail ?? '',
        })
      }
    }
    rangesRef.current = nextMap
    hadHighlightsRef.current = ranges.length > 0
    setThreadOffsets((prev) => {
      if (prev.size === nextOffsets.size) {
        let same = true
        for (const [k, v] of nextOffsets) {
          if (prev.get(k) !== v) {
            same = false
            break
          }
        }
        if (same) return prev
      }
      return nextOffsets
    })
    setOrphanThreadIds((prev) => {
      if (prev.size === nextOrphans.size) {
        let same = true
        for (const id of nextOrphans) {
          if (!prev.has(id)) {
            same = false
            break
          }
        }
        if (same) return prev
      }
      return nextOrphans
    })
    setCommentHighlights(editor, ranges)
  }, [activeThreadId, editor, hoveredThreadId, live, threads, unreadThreadIds])

  useEffect(() => {
    syncHighlights()
  }, [syncHighlights])

  // Re-resolve when the document changes (only while the note actually has comments).
  useEffect(() => {
    if (!editor || editor.isDestroyed || !threads.length) return
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
  }, [editor, syncHighlights, threads.length])

  useEffect(() => () => clearTimeout(hoverTimerRef.current), [])

  const handleHoverThread = useCallback((threadId: string | null) => {
    clearTimeout(hoverTimerRef.current)
    if (threadId) {
      hoverTimerRef.current = setTimeout(() => setHoveredThreadId(threadId), HOVER_OPEN_DELAY)
    } else {
      hoverTimerRef.current = setTimeout(() => setHoveredThreadId(null), HOVER_CLOSE_DELAY)
    }
  }, [])

  const selectThread = useCallback(
    (threadId: string) => {
      clearTimeout(hoverTimerRef.current)
      setHoveredThreadId(null)
      setDraft(null)
      const range = rangesRef.current.get(threadId)
      if (range && editor) {
        setOverviewOpen(false)
        setActiveThreadId(threadId)
        scrollToComment(editor, range, threadId)
      } else {
        // Orphaned thread (text deleted): keep it accessible inside the overview popover.
        setActiveThreadId(threadId)
        setOverviewOpen(true)
      }
      if (note.sharedId && unreadThreadIds.has(threadId) && !useLlm.getState().localOnly) {
        void markCommentsRead(sharedContext()?.shared ?? null, note.sharedId, threadId)
      }
    },
    [editor, note.sharedId, unreadThreadIds],
  )

  // Handle incoming jump requests from the Bell notifications popover.
  useEffect(() => {
    return registerCommentOpener(note.id, (threadId) => selectThread(threadId))
  }, [note.id, selectThread])

  useEffect(() => {
    if (!editor) return
    const requested = takeCommentOpenRequest(note.id)
    if (requested) selectThread(requested)
  }, [editor, note.id, selectThread])

  const startDraft = useCallback(() => {
    if (!editor || editor.isDestroyed || readOnly) return
    clearTimeout(hoverTimerRef.current)
    setHoveredThreadId(null)
    const { from, to } = editor.state.selection
    if (from === to) {
      setOverviewOpen(true)
      return
    }
    const anchor = captureSelectionAnchor(editor, { from, to }, live)
    if (!anchor) return
    // Collapse the text selection so the selection BubbleMenu doesn't overlap the comment popover.
    editor.commands.setTextSelection(to)
    setOverviewOpen(false)
    setActiveThreadId(null)
    setDraft(anchor)
  }, [editor, live, readOnly])

  const toggleOverview = useCallback(() => {
    clearTimeout(hoverTimerRef.current)
    setHoveredThreadId(null)
    setDraft(null)
    setOverviewOpen((prev) => {
      const next = !prev
      if (next) setActiveThreadId(null)
      return next
    })
  }, [])

  const closePopover = useCallback(() => {
    setActiveThreadId(null)
    setDraft(null)
  }, [])

  const closeOverview = useCallback(() => {
    setOverviewOpen(false)
  }, [])

  const getThreadAnchorRect = useCallback(
    (threadId: string): AnchorRect | null => {
      if (!editor || editor.isDestroyed) return null
      const range = rangesRef.current.get(threadId)
      if (!range) return null
      return getRangeRect(editor, range, threadId)
    },
    [editor],
  )

  const getDraftAnchorRect = useCallback((): AnchorRect | null => {
    if (!editor || editor.isDestroyed || !draft) return null
    return getRangeRect(editor, { from: draft.editorFrom, to: draft.editorTo })
  }, [draft, editor])

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
      // Seed the range immediately so the thread popover anchors on its very first frame
      // before syncHighlights' effect dispatches highlight decorations.
      rangesRef.current.set(thread.id, { from: anchor.editorFrom, to: anchor.editorTo })
      if (live && editor && !editor.isDestroyed) {
        addYCommentThread(live.session.doc, thread)
        setActiveThreadId(thread.id)
        await live.persist(editor.getMarkdown(), { immediate: true })
        const mentionIds = [...new Set(mentions.map((m) => m.userId))]
        if (!useLlm.getState().localOnly) {
          void sharedContext()
            ?.shared.notifyComment(live.sharedId, thread.id, mentionIds, false)
            .catch(() => undefined)
        }
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
        if (!useLlm.getState().localOnly) {
          void sharedContext()
            ?.shared.notifyComment(live.sharedId, threadId, mentionIds, true)
            .catch(() => undefined)
        }
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
      if (status === 'resolved' && activeThreadId === threadId && !overviewOpen) {
        setActiveThreadId(null)
      }
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
    [activeThreadId, editor, live, note.id, overviewOpen, readOnly, repo, threads],
  )

  const deleteMessage = useCallback(
    async (threadId: string, messageId: string) => {
      if (readOnly) return
      const existing = threads.find((th) => th.id === threadId)
      const deletingLast = existing ? existing.messages.length <= 1 : false
      if (deletingLast && activeThreadId === threadId) setActiveThreadId(null)
      if (live && editor && !editor.isDestroyed) {
        deleteYCommentMessage(live.session.doc, threadId, messageId)
        await live.persist(editor.getMarkdown(), { immediate: true })
        return
      }
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
    [activeThreadId, editor, live, note.id, readOnly, repo, threads],
  )

  // Sort threads by document position so navigation & overview follow the reading order.
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
    overviewOpen,
    threads: orderedThreads,
    activeThreadId,
    hoveredThreadId,
    unreadThreadIds,
    orphanThreadIds,
    collaborators,
    currentUser,
    draft,
    getThreadAnchorRect,
    getDraftAnchorRect,
    toggleOverview,
    openOverview: () => {
      setDraft(null)
      setActiveThreadId(null)
      setOverviewOpen(true)
    },
    closeOverview,
    closePopover,
    selectThread,
    handleHoverThread,
    startDraft,
    cancelDraft: () => setDraft(null),
    createThread: (body: string, mentions: CommentMention[]) => void createThread(body, mentions),
    reply: (threadId: string, body: string, mentions: CommentMention[]) =>
      void reply(threadId, body, mentions),
    setStatus: (threadId: string, status: 'open' | 'resolved') => void setStatus(threadId, status),
    deleteMessage: (threadId: string, messageId: string) => void deleteMessage(threadId, messageId),
  }
}
