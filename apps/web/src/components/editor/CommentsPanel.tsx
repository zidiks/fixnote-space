import {
  type CommentMention,
  type CommentMessage,
  type CommentThread,
  emailDisplayName,
  parseCommentBody,
  type SharedMember,
} from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn } from '@fixnote/ui'
import { ArrowUp, Check, List, MessageSquare, RotateCcw, Trash2, X } from 'lucide-react'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { docking, useUi } from '../../app/store'
import { colorFor, initials, onColor } from '../../lib/collab/people'
import { formatRelative } from '../../lib/time'
import { type AnchorRect, type CapturedAnchor, findScrollParent } from './comments-highlight'

const VIEWPORT_MARGIN = 12
const POPOVER_GAP = 10

type PlacementMode =
  | { kind: 'below' }
  | { kind: 'above' }
  /** Tall fragment (e.g. a large code block) where neither below nor above fits in view. */
  | { kind: 'pinned'; offsetFromTop: number }

/**
 * Popover anchored to a text fragment inside the editor's scroll container (`position: absolute`).
 * Living in the same scroll layer as the text gives 0ms compositor-locked scroll tracking, and
 * locking the vertical placement mode on mount prevents flipping between above/below on large
 * selections (such as multi-line code blocks) while typing or scrolling.
 */
function AnchoredCard({
  getAnchor,
  interactive,
  className,
  children,
  onClose,
}: {
  getAnchor: () => AnchorRect | null
  interactive: boolean
  className?: string
  children: ReactNode
  onClose?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const getAnchorRef = useRef(getAnchor)
  getAnchorRef.current = getAnchor
  const modeRef = useRef<PlacementMode | null>(null)

  const place = useCallback(() => {
    const el = ref.current
    const anchor = getAnchorRef.current()
    if (!el || !anchor) return
    const container = el.offsetParent as HTMLElement | null
    if (!container) return
    const cr = container.getBoundingClientRect()
    const scroller = findScrollParent(container)
    const sr = scroller
      ? scroller.getBoundingClientRect()
      : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight }
    const visLeft = Math.max(sr.left, 0)
    const visRight = Math.min(sr.right, window.innerWidth)
    const visTop = Math.max(sr.top, 0)
    const visBottom = Math.min(sr.bottom, window.innerHeight)

    const width = el.offsetWidth || 340
    const height = el.offsetHeight || 160

    const maxViewLeft = Math.max(visLeft + VIEWPORT_MARGIN, visRight - width - VIEWPORT_MARGIN)
    const viewLeft = Math.max(visLeft + VIEWPORT_MARGIN, Math.min(anchor.left, maxViewLeft))
    const x = Math.round(viewLeft - cr.left)

    const anchorDocTop = anchor.top - cr.top
    const anchorDocBottom = anchor.bottom - cr.top

    if (!modeRef.current) {
      const belowViewY = anchor.bottom + POPOVER_GAP
      const aboveViewY = anchor.top - POPOVER_GAP - height
      const topInView = anchor.top >= visTop - 4 && anchor.top <= visBottom
      const bottomInView = anchor.bottom >= visTop && anchor.bottom <= visBottom + 4
      const fullyOffscreen =
        !topInView && !bottomInView && (anchor.bottom < visTop || anchor.top > visBottom)

      if (bottomInView && belowViewY + height <= visBottom - VIEWPORT_MARGIN) {
        modeRef.current = { kind: 'below' }
      } else if (topInView && aboveViewY >= visTop + VIEWPORT_MARGIN) {
        modeRef.current = { kind: 'above' }
      } else if (fullyOffscreen) {
        // Off-screen thread currently being scrolled into view from the overview/bell.
        modeRef.current = { kind: 'below' }
      } else {
        // Tall fragment (e.g. large code block) where neither below nor above fits cleanly.
        // Anchor once inside the visible portion and keep it locked in document coordinates.
        const maxViewY = Math.max(visTop + VIEWPORT_MARGIN, visBottom - height - VIEWPORT_MARGIN)
        let viewY: number
        if (bottomInView) {
          viewY = Math.max(visTop + VIEWPORT_MARGIN, Math.min(belowViewY, maxViewY))
        } else if (topInView) {
          viewY = Math.max(visTop + VIEWPORT_MARGIN, Math.min(anchor.top + POPOVER_GAP, maxViewY))
        } else {
          viewY = Math.max(
            visTop + VIEWPORT_MARGIN,
            Math.min(visTop + Math.round((visBottom - visTop - height) * 0.35), maxViewY),
          )
        }
        modeRef.current = { kind: 'pinned', offsetFromTop: viewY - cr.top - anchorDocTop }
      }
    }

    const mode = modeRef.current
    const docY =
      mode.kind === 'below'
        ? anchorDocBottom + POPOVER_GAP
        : mode.kind === 'above'
          ? anchorDocTop - POPOVER_GAP - height
          : anchorDocTop + mode.offsetFromTop

    el.style.transform = `translate3d(${x}px, ${Math.round(docY)}px, 0)`
    el.style.visibility = 'visible'
  }, [])

  useLayoutEffect(() => {
    place()
    const el = ref.current
    if (!el) return
    const container = el.offsetParent as HTMLElement | null
    const scroller = findScrollParent(container)
    const ro = new ResizeObserver(place)
    ro.observe(el)
    if (container) ro.observe(container)
    if (scroller) ro.observe(scroller)
    window.addEventListener('resize', place)
    // Inner scrollers (e.g. horizontal scroll inside a wide <pre> code block) shift anchor.left.
    container?.addEventListener('scroll', place, { capture: true, passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
      container?.removeEventListener('scroll', place, true)
    }
  }, [place])

  useEffect(() => {
    if (!interactive || !onClose) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (ref.current?.contains(target)) return
      if (target.closest('[data-comment-thread]')) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [interactive, onClose])

  return (
    <div
      ref={ref}
      style={{ top: 0, left: 0, visibility: 'hidden' }}
      className={cn(
        'absolute z-40 cursor-default select-auto will-change-transform',
        !interactive && 'pointer-events-none',
      )}
    >
      <div
        className={cn(
          'rounded-2xl border bg-popover text-popover-foreground shadow-float animate-in fade-in-0 duration-120 ease-out',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Finds an active `@query` immediately preceding the caret, if any. */
function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/[\s([{]/.test(before[at - 1] ?? '')) return null
  const query = before.slice(at + 1)
  if (query.length > 48 || /[\r\n]/.test(query)) return null
  return { start: at, query }
}

function CommentText({
  msg,
  allEmails,
  clamp = false,
}: {
  msg: CommentMessage
  allEmails: string[]
  clamp?: boolean
}) {
  const parts = parseCommentBody(msg.body, msg.mentions, allEmails)
  let offset = 0
  return (
    <p
      className={cn(
        'mt-0.5 whitespace-pre-wrap text-[13.5px] leading-snug text-foreground/90 [overflow-wrap:anywhere]',
        clamp && 'line-clamp-3',
      )}
    >
      {parts.map((part) => {
        const key = `${msg.id}-${offset}`
        offset += part.text.length
        return part.kind === 'mention' ? (
          <span
            key={key}
            title={part.email}
            className="rounded bg-brand/15 px-1 py-0.5 font-medium text-brand"
          >
            {part.text}
          </span>
        ) : (
          <span key={key}>{part.text}</span>
        )
      })}
    </p>
  )
}

/** Figma-style inline bottom composer: avatar + auto-growing input + circular send arrow. */
function InlineComposer({
  currentUser,
  placeholder,
  collaborators,
  allEmails,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  currentUser: { id: string; email: string }
  placeholder: string
  collaborators: SharedMember[]
  allEmails: string[]
  autoFocus?: boolean
  onSubmit: (body: string, mentions: CommentMention[]) => void
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')
  const [mentions, setMentions] = useState<CommentMention[]>([])
  const [mentionTrigger, setMentionTrigger] = useState<{ start: number; query: string } | null>(
    null,
  )
  const [selectedIndex, setSelectedIndex] = useState(0)

  const candidates = useMemo(() => {
    if (!mentionTrigger || !collaborators.length) return []
    const q = mentionTrigger.query.trim().toLowerCase()
    return collaborators
      .map((m) => ({ member: m, display: emailDisplayName(m.email, allEmails) }))
      .filter(
        ({ member, display }) =>
          !q || display.toLowerCase().includes(q) || member.email.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [allEmails, collaborators, mentionTrigger])

  // Focus after the anchored popover is visible and any closing menu (e.g. Radix ContextMenu)
  // has finished restoring focus to the editor, without scroll-jumping.
  useEffect(() => {
    if (!autoFocus) return
    const focusNow = () => {
      const el = ref.current
      if (el && document.activeElement !== el) el.focus({ preventScroll: true })
    }
    focusNow()
    const raf = requestAnimationFrame(focusNow)
    const timer = setTimeout(focusNow, 60)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [autoFocus])

  // Auto-grow textarea height smoothly up to 4 lines without jumping layout.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = value ? `${Math.min(el.scrollHeight, 104)}px` : ''
  }, [value])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed, mentions)
    setValue('')
    setMentions([])
    setMentionTrigger(null)
  }

  const insertMention = (member: SharedMember, display: string) => {
    const el = ref.current
    if (!el || !mentionTrigger) return
    const caret = el.selectionStart ?? value.length
    const before = value.slice(0, mentionTrigger.start)
    const after = value.slice(caret)
    const inserted = `@${display} `
    const nextValue = before + inserted + after
    const nextMentions = mentions.some((m) => m.userId === member.userId)
      ? mentions
      : [...mentions, { userId: member.userId, email: member.email }]
    setValue(nextValue)
    setMentions(nextMentions)
    setMentionTrigger(null)
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const handleChange = (next: string, caret: number) => {
    const lower = next.toLowerCase()
    const kept = mentions.filter((m) => {
      const display = emailDisplayName(m.email, allEmails).toLowerCase()
      return lower.includes(`@${display}`) || lower.includes(`@${m.email.toLowerCase()}`)
    })
    setValue(next)
    setMentions(kept)
    setMentionTrigger(collaborators.length ? activeMentionQuery(next, caret) : null)
    setSelectedIndex(0)
  }

  const bg = colorFor(currentUser.id || 'local')
  const fg = onColor(bg)
  const avatarText = initials(currentUser.email || t('comments.you'))
  const hasText = value.trim().length > 0

  return (
    <div className="relative border-t px-3 py-2.5">
      {candidates.length > 0 ? (
        <div
          role="listbox"
          className="absolute right-3 bottom-full left-3 z-20 mb-1.5 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-float"
        >
          {candidates.map(({ member, display }, i) => {
            const cbg = colorFor(member.userId)
            const cfg = onColor(cbg)
            return (
              <button
                key={member.userId}
                type="button"
                role="option"
                aria-selected={i === selectedIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(member, display)
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                  i === selectedIndex && 'bg-accent',
                )}
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: cbg, color: cfg }}
                >
                  {initials(member.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-tight">
                    {display}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground leading-tight">
                    {member.email}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <span
          className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
          style={{ background: bg, color: fg }}
          title={currentUser.email || undefined}
        >
          {avatarText}
        </span>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(e) =>
            handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }
          onKeyUp={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              setMentionTrigger(
                collaborators.length
                  ? activeMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
                  : null,
              )
            }
          }}
          onKeyDown={(e) => {
            if (candidates.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex((i) => (i + 1) % candidates.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex((i) => (i - 1 + candidates.length) % candidates.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                const pick = candidates[selectedIndex]
                if (pick) insertMention(pick.member, pick.display)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMentionTrigger(null)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape' && onCancel) {
              e.preventDefault()
              e.stopPropagation()
              onCancel()
            }
          }}
          className="min-h-7 max-h-28 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[13.5px] leading-5 outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          disabled={!hasText}
          onClick={submit}
          aria-label={t('comments.send')}
          className={cn(
            'mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
            hasText
              ? 'bg-brand text-brand-foreground hover:opacity-90'
              : 'bg-muted text-muted-foreground/50',
          )}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** Figma-style message list with vertical connector line between avatars and zero hover jitter. */
function ThreadMessages({
  thread,
  allEmails,
  readOnly,
  isShared,
  currentUserId,
  onDeleteMessage,
  scrollable = true,
}: {
  thread: CommentThread
  allEmails: string[]
  readOnly: boolean
  isShared: boolean
  currentUserId: string
  onDeleteMessage: (threadId: string, messageId: string) => void
  scrollable?: boolean
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className={cn('px-3.5 py-3', scrollable && 'max-h-[min(320px,46dvh)] overflow-y-auto')}>
      {thread.messages.map((msg, idx) => {
        const isLast = idx === thread.messages.length - 1
        const display = msg.authorEmail
          ? emailDisplayName(msg.authorEmail, allEmails)
          : t('comments.you')
        const bg = colorFor(msg.authorId || 'local')
        const fg = onColor(bg)
        const canDelete = !readOnly && (!isShared || msg.authorId === currentUserId)
        return (
          <div key={msg.id} className="group flex gap-2.5">
            <div className="flex w-7 shrink-0 flex-col items-center">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ background: bg, color: fg }}
                title={msg.authorEmail || undefined}
              >
                {initials(msg.authorEmail || display)}
              </span>
              {!isLast ? <span aria-hidden className="my-1.5 w-px flex-1 bg-border" /> : null}
            </div>
            <div className={cn('min-w-0 flex-1', !isLast && 'pb-3')}>
              <div className="flex h-5 items-center gap-1.5">
                <span
                  className="truncate text-[13px] font-semibold"
                  title={msg.authorEmail || undefined}
                >
                  {display}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelative(msg.createdAt, i18n.resolvedLanguage)}
                </span>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => onDeleteMessage(thread.id, msg.id)}
                    aria-label={t('common.delete')}
                    // Fixed size + opacity transition only: zero layout shift on hover.
                    className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <CommentText msg={msg} allEmails={allEmails} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export interface CommentsLayerProps {
  overviewOpen: boolean
  readOnly: boolean
  isShared: boolean
  currentUser: { id: string; email: string }
  threads: CommentThread[]
  activeThreadId: string | null
  hoveredThreadId: string | null
  unreadThreadIds: Set<string>
  orphanThreadIds: Set<string>
  collaborators: SharedMember[]
  draft: CapturedAnchor | null
  getThreadAnchorRect: (threadId: string) => AnchorRect | null
  getDraftAnchorRect: () => AnchorRect | null
  onCloseOverview: () => void
  onOpenOverview: () => void
  onClosePopover: () => void
  onSelectThread: (threadId: string) => void
  onCreateThread: (body: string, mentions: CommentMention[]) => void
  onCreateNoteThread: (body: string, mentions: CommentMention[]) => void
  onCancelDraft: () => void
  onReply: (threadId: string, body: string, mentions: CommentMention[]) => void
  onSetStatus: (threadId: string, status: 'open' | 'resolved') => void
  onDeleteMessage: (threadId: string, messageId: string) => void
}

export function CommentsLayer({
  overviewOpen,
  readOnly,
  isShared,
  currentUser,
  threads,
  activeThreadId,
  hoveredThreadId,
  unreadThreadIds,
  orphanThreadIds,
  collaborators,
  draft,
  getThreadAnchorRect,
  getDraftAnchorRect,
  onCloseOverview,
  onOpenOverview,
  onClosePopover,
  onSelectThread,
  onCreateThread,
  onCreateNoteThread,
  onCancelDraft,
  onReply,
  onSetStatus,
  onDeleteMessage,
}: CommentsLayerProps) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const narrow = useUi((s) => s.narrow)
  const width = useUi((s) => s.width)
  const layout = useUi((s) => s.layout)
  const listWidth = useUi((s) => s.listWidth)
  const overlay = docking({ narrow, width, layout, listWidth, chatOpen: true }).chatOverlay

  const openThreads = useMemo(() => threads.filter((th) => th.status === 'open'), [threads])
  const resolvedThreads = useMemo(() => threads.filter((th) => th.status === 'resolved'), [threads])
  const visibleOverview = tab === 'open' ? openThreads : resolvedThreads

  // If the resolved tab empties (e.g. last resolved thread deleted or reopened), return to Open.
  useEffect(() => {
    if (tab === 'resolved' && resolvedThreads.length === 0) setTab('open')
  }, [resolvedThreads.length, tab])

  const allEmails = useMemo(() => {
    const set = new Set<string>()
    if (currentUser.email) set.add(currentUser.email)
    for (const c of collaborators) if (c.email) set.add(c.email)
    for (const th of threads) {
      for (const m of th.messages) {
        if (m.authorEmail) set.add(m.authorEmail)
        for (const mn of m.mentions) if (mn.email) set.add(mn.email)
      }
    }
    return [...set]
  }, [collaborators, currentUser.email, threads])

  const mentionable = useMemo(
    () => (isShared ? collaborators.filter((c) => c.userId !== currentUser.id) : []),
    [collaborators, currentUser.id, isShared],
  )

  const activeThread = useMemo(
    () => (activeThreadId ? (threads.find((th) => th.id === activeThreadId) ?? null) : null),
    [activeThreadId, threads],
  )

  const hoveredThread = useMemo(() => {
    if (!hoveredThreadId || overviewOpen || draft || hoveredThreadId === activeThreadId) return null
    return threads.find((th) => th.id === hoveredThreadId) ?? null
  }, [activeThreadId, draft, hoveredThreadId, overviewOpen, threads])

  // Close sidebar on Escape (only when no reply composer handles Escape itself).
  useEffect(() => {
    if (!overviewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseOverview()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCloseOverview, overviewOpen])

  const showAnchoredThread = Boolean(
    activeThread && !overviewOpen && !orphanThreadIds.has(activeThread.id) && activeThread.quote,
  )

  return (
    <>
      {/* 1. Compact Figma-style hover preview card */}
      {hoveredThread ? (
        <AnchoredCard
          key={hoveredThread.id}
          getAnchor={() => getThreadAnchorRect(hoveredThread.id)}
          interactive={false}
          className="w-[min(300px,calc(100vw-24px))] px-3.5 py-3"
        >
          {(() => {
            const first = hoveredThread.messages[0]
            if (!first) return null
            const display = first.authorEmail
              ? emailDisplayName(first.authorEmail, allEmails)
              : t('comments.you')
            const bg = colorFor(first.authorId || 'local')
            const fg = onColor(bg)
            const extra = hoveredThread.messages.length - 1
            const isUnread = unreadThreadIds.has(hoveredThread.id)
            return (
              <div className="flex items-stretch gap-2.5">
                <div className="flex w-7 shrink-0 flex-col items-center">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{ background: bg, color: fg }}
                  >
                    {initials(first.authorEmail || display)}
                  </span>
                  {extra > 0 ? (
                    <span
                      aria-hidden
                      className="mt-1.5 h-6 w-px shrink-0 bg-gradient-to-b from-border to-transparent"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold">{display}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(first.createdAt, i18n.resolvedLanguage)}
                    </span>
                    {isUnread ? (
                      <span className="ml-auto size-2 shrink-0 rounded-full bg-brand" />
                    ) : null}
                  </div>
                  <CommentText msg={first} allEmails={allEmails} clamp />
                  {extra > 0 ? (
                    <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                      {t('comments.moreReplies', { count: extra })}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          })()}
        </AnchoredCard>
      ) : null}

      {/* 2. Anchored "Add comment" popover next to the selected fragment */}
      {draft && !readOnly ? (
        <AnchoredCard
          key={`${draft.editorFrom}-${draft.editorTo}`}
          getAnchor={getDraftAnchorRect}
          interactive
          onClose={onCancelDraft}
          className="w-[min(360px,calc(100vw-24px))]"
        >
          <div className="flex items-center justify-between border-b px-3.5 py-2.5">
            <span className="text-[13px] font-semibold">{t('comments.add')}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onCancelDraft}
              aria-label={t('window.close')}
            >
              <X />
            </Button>
          </div>
          <div className="px-3.5 pt-2.5 pb-1">
            <blockquote className="line-clamp-2 border-l-2 border-brand pl-2 text-xs text-muted-foreground">
              {draft.quote}
            </blockquote>
          </div>
          <InlineComposer
            currentUser={currentUser}
            placeholder={t('comments.placeholder')}
            collaborators={mentionable}
            allEmails={allEmails}
            autoFocus
            onSubmit={onCreateThread}
            onCancel={onCancelDraft}
          />
        </AnchoredCard>
      ) : null}

      {/* 3. Anchored Figma-style thread popover right next to the highlighted fragment */}
      {showAnchoredThread && activeThread ? (
        <AnchoredCard
          key={activeThread.id}
          getAnchor={() => getThreadAnchorRect(activeThread.id)}
          interactive
          onClose={onClosePopover}
          className="w-[min(370px,calc(100vw-24px))]"
        >
          <div className="flex items-center gap-1 border-b px-3.5 py-2">
            <span className="text-[13px] font-semibold">{t('comments.title')}</span>
            <div className="ml-auto flex items-center gap-0.5">
              {threads.length > 1 ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenOverview}
                  title={t('comments.allComments')}
                  aria-label={t('comments.allComments')}
                >
                  <List />
                </Button>
              ) : null}
              {!readOnly ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    onSetStatus(
                      activeThread.id,
                      activeThread.status === 'open' ? 'resolved' : 'open',
                    )
                  }
                  title={
                    activeThread.status === 'open' ? t('comments.resolve') : t('comments.reopen')
                  }
                  aria-label={
                    activeThread.status === 'open' ? t('comments.resolve') : t('comments.reopen')
                  }
                >
                  {activeThread.status === 'open' ? <Check /> : <RotateCcw />}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClosePopover}
                aria-label={t('window.close')}
              >
                <X />
              </Button>
            </div>
          </div>
          <ThreadMessages
            thread={activeThread}
            allEmails={allEmails}
            readOnly={readOnly}
            isShared={isShared}
            currentUserId={currentUser.id}
            onDeleteMessage={onDeleteMessage}
          />
          {!readOnly && activeThread.status === 'open' ? (
            <InlineComposer
              currentUser={currentUser}
              placeholder={t('comments.replyPlaceholder')}
              collaborators={mentionable}
              allEmails={allEmails}
              onSubmit={(body, mentions) => onReply(activeThread.id, body, mentions)}
              onCancel={onClosePopover}
            />
          ) : null}
        </AnchoredCard>
      ) : null}

      {/* 4. Right-side Comments sidebar (docked like ChatPanel, Figma 1236:72434 layout) */}
      {overviewOpen
        ? (() => {
            const slot = document.getElementById('comments-panel-slot') ?? document.body
            const panel = (
              <aside
                aria-label={t('comments.title')}
                className={cn(
                  'mt-1 mr-2 mb-2 ml-1.5 flex min-h-0 w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground',
                  overlay && 'shadow-float',
                  'max-sm:m-0 max-sm:w-full max-sm:rounded-none max-sm:border-0',
                )}
              >
                {/* Header */}
                <header className="flex h-[52px] shrink-0 items-center justify-between border-b px-4">
                  <h2 className="truncate text-[15px] font-semibold">{t('comments.title')}</h2>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onCloseOverview}
                    aria-label={t('window.close')}
                  >
                    <X />
                  </Button>
                </header>

                {/* Filter chips row (never wraps or clips) */}
                {resolvedThreads.length > 0 ? (
                  <div className="flex shrink-0 items-center gap-1.5 border-b px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setTab('open')}
                      className={cn(
                        'inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors',
                        tab === 'open'
                          ? 'border-border bg-background text-foreground shadow-2xs'
                          : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )}
                    >
                      <span>{t('comments.openTab', { count: openThreads.length })}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('resolved')}
                      className={cn(
                        'inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors',
                        tab === 'resolved'
                          ? 'border-border bg-background text-foreground shadow-2xs'
                          : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )}
                    >
                      <span>{t('comments.resolvedTab', { count: resolvedThreads.length })}</span>
                    </button>
                  </div>
                ) : null}

                {/* Thread cards list */}
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
                  {visibleOverview.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-12 text-center">
                      <MessageSquare className="size-6 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground/80">
                        {tab === 'resolved' ? t('comments.emptyResolved') : t('comments.empty')}
                      </p>
                      {tab === 'open' && !readOnly ? (
                        <p className="text-xs text-muted-foreground">{t('comments.emptyHint')}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {visibleOverview.map((thread) => {
                    const isUnread = unreadThreadIds.has(thread.id)
                    const isOrphan = orphanThreadIds.has(thread.id)
                    const isActive = activeThreadId === thread.id
                    const isReplying = replyingId === thread.id
                    const hasQuote = Boolean(thread.quote)
                    return (
                      <div
                        key={thread.id}
                        className={cn(
                          'overflow-hidden rounded-xl border bg-background/70 transition-colors',
                          isActive ? 'border-brand/50 bg-background' : 'border-border',
                        )}
                      >
                        <div className="flex items-start gap-2 border-b border-border/60 px-3 py-2">
                          {hasQuote ? (
                            <button
                              type="button"
                              onClick={() => onSelectThread(thread.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="line-clamp-2 border-l-2 border-brand/70 pl-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                                {thread.quote}
                                {isOrphan ? (
                                  <span className="ml-1 italic opacity-75">
                                    ({t('comments.fragmentDeleted')})
                                  </span>
                                ) : null}
                              </p>
                            </button>
                          ) : (
                            <span className="min-w-0 flex-1 py-0.5 text-[11.5px] font-medium text-muted-foreground">
                              {t('comments.noteComment')}
                            </span>
                          )}
                          <div className="flex shrink-0 items-center gap-1">
                            {isUnread ? (
                              <span
                                className="size-2 shrink-0 rounded-full bg-brand"
                                title={t('comments.unread')}
                              />
                            ) : null}
                            {!readOnly ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onSetStatus(
                                    thread.id,
                                    thread.status === 'open' ? 'resolved' : 'open',
                                  )
                                }
                                title={
                                  thread.status === 'open'
                                    ? t('comments.resolve')
                                    : t('comments.reopen')
                                }
                                aria-label={
                                  thread.status === 'open'
                                    ? t('comments.resolve')
                                    : t('comments.reopen')
                                }
                                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                {thread.status === 'open' ? (
                                  <Check className="size-3.5" />
                                ) : (
                                  <RotateCcw className="size-3.5" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <ThreadMessages
                          thread={thread}
                          allEmails={allEmails}
                          readOnly={readOnly}
                          isShared={isShared}
                          currentUserId={currentUser.id}
                          onDeleteMessage={onDeleteMessage}
                          scrollable={false}
                        />

                        {!readOnly && thread.status === 'open' ? (
                          isReplying ? (
                            <InlineComposer
                              currentUser={currentUser}
                              placeholder={t('comments.replyPlaceholder')}
                              collaborators={mentionable}
                              allEmails={allEmails}
                              autoFocus
                              onSubmit={(body, mentions) => {
                                onReply(thread.id, body, mentions)
                                setReplyingId(null)
                              }}
                              onCancel={() => setReplyingId(null)}
                            />
                          ) : (
                            <div className="border-t border-border/60 px-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => setReplyingId(thread.id)}
                                className="w-full rounded-md py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                {t('comments.replyPlaceholder')}
                              </button>
                            </div>
                          )
                        ) : null}
                      </div>
                    )
                  })}
                </div>

                {/* Bottom composer for general note-level comments */}
                {!readOnly ? (
                  <InlineComposer
                    currentUser={currentUser}
                    placeholder={t('comments.notePlaceholder')}
                    collaborators={mentionable}
                    allEmails={allEmails}
                    onSubmit={(body, mentions) => {
                      setTab('open')
                      onCreateNoteThread(body, mentions)
                    }}
                  />
                ) : null}
              </aside>
            )
            return createPortal(
              overlay ? (
                <>
                  <button
                    type="button"
                    aria-label={t('window.close')}
                    className="fixed inset-0 z-30 bg-scrim"
                    onClick={onCloseOverview}
                  />
                  <div className="fixed inset-y-0 right-0 z-40 flex max-w-full max-sm:left-0">
                    {panel}
                  </div>
                </>
              ) : (
                panel
              ),
              slot,
            )
          })()
        : null}
    </>
  )
}
