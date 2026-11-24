import {
  type CommentMention,
  type CommentThread,
  emailDisplayName,
  parseCommentBody,
  type SharedMember,
} from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn, isApple } from '@fixnote/ui'
import { AtSign, Check, MessageSquare, RotateCcw, Send, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { colorFor, initials, onColor } from '../../lib/collab/people'
import { formatRelative } from '../../lib/time'

export interface CommentDraft {
  quote: string
}

interface MentionTextareaProps {
  value: string
  mentions: CommentMention[]
  onChange: (value: string, mentions: CommentMention[]) => void
  onSubmit: () => void
  onCancel?: () => void
  placeholder: string
  collaborators: SharedMember[]
  allEmails: string[]
  autoFocus?: boolean
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

function MentionTextarea({
  value,
  mentions,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  collaborators,
  allEmails,
  autoFocus = false,
}: MentionTextareaProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mentionTrigger, setMentionTrigger] = useState<{ start: number; query: string } | null>(
    null,
  )
  const [selectedIndex, setSelectedIndex] = useState(0)

  const candidates = useMemo(() => {
    if (!mentionTrigger || !collaborators.length) return []
    const q = mentionTrigger.query.trim().toLowerCase()
    return collaborators
      .map((m) => ({
        member: m,
        display: emailDisplayName(m.email, allEmails),
      }))
      .filter(
        ({ member, display }) =>
          !q || display.toLowerCase().includes(q) || member.email.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [allEmails, collaborators, mentionTrigger])

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
    onChange(nextValue, nextMentions)
    setMentionTrigger(null)
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const handleChange = (next: string, caret: number) => {
    // Drop mentions whose `@display` is no longer present in the text.
    const lower = next.toLowerCase()
    const kept = mentions.filter((m) => {
      const display = emailDisplayName(m.email, allEmails).toLowerCase()
      return lower.includes(`@${display}`) || lower.includes(`@${m.email.toLowerCase()}`)
    })
    onChange(next, kept)
    setMentionTrigger(collaborators.length ? activeMentionQuery(next, caret) : null)
    setSelectedIndex(0)
  }

  return (
    <div className="relative">
      {candidates.length > 0 ? (
        <div
          role="listbox"
          className="absolute right-0 bottom-full left-0 z-10 mb-1.5 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-float"
        >
          {candidates.map(({ member, display }, i) => {
            const bg = colorFor(member.userId)
            const fg = onColor(bg)
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
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                  i === selectedIndex && 'bg-accent',
                )}
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: bg, color: fg }}
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

      <textarea
        ref={ref}
        // biome-ignore lint/a11y/noAutofocus: explicit user action to compose a comment or reply
        autoFocus={autoFocus}
        rows={2}
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
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (value.trim()) onSubmit()
          } else if (e.key === 'Escape' && onCancel) {
            e.preventDefault()
            onCancel()
          }
        }}
        className="w-full resize-none rounded-lg border bg-background px-2.5 py-2 text-[13px] leading-snug outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      {collaborators.length > 0 ? (
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <AtSign className="size-3" />
            {t('comments.mentionHint')}
          </span>
          <span className="opacity-75">{isApple ? '⌘↵' : 'Ctrl+↵'}</span>
        </div>
      ) : null}
    </div>
  )
}

export interface CommentsPanelProps {
  open: boolean
  readOnly: boolean
  isShared: boolean
  currentUserId: string
  threads: CommentThread[]
  activeThreadId: string | null
  unreadThreadIds: Set<string>
  orphanThreadIds: Set<string>
  collaborators: SharedMember[]
  draft: CommentDraft | null
  onClose: () => void
  onSelectThread: (threadId: string) => void
  onCreateThread: (body: string, mentions: CommentMention[]) => void
  onCancelDraft: () => void
  onReply: (threadId: string, body: string, mentions: CommentMention[]) => void
  onSetStatus: (threadId: string, status: 'open' | 'resolved') => void
  onDeleteMessage: (threadId: string, messageId: string) => void
}

export function CommentsPanel({
  open,
  readOnly,
  isShared,
  currentUserId,
  threads,
  activeThreadId,
  unreadThreadIds,
  orphanThreadIds,
  collaborators,
  draft,
  onClose,
  onSelectThread,
  onCreateThread,
  onCancelDraft,
  onReply,
  onSetStatus,
  onDeleteMessage,
}: CommentsPanelProps) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const [draftBody, setDraftBody] = useState('')
  const [draftMentions, setDraftMentions] = useState<CommentMention[]>([])
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyMentions, setReplyMentions] = useState<CommentMention[]>([])
  const activeCardRef = useRef<HTMLDivElement>(null)

  // Reset composer when a new draft starts.
  useEffect(() => {
    if (draft) {
      setDraftBody('')
      setDraftMentions([])
      setTab('open')
    }
  }, [draft])

  // Switch tab automatically if the focused thread is resolved.
  useEffect(() => {
    if (!activeThreadId) return
    const thread = threads.find((th) => th.id === activeThreadId)
    if (thread) setTab((prev) => (thread.status !== prev ? thread.status : prev))
    requestAnimationFrame(() => {
      activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [activeThreadId, threads])

  // Close panel on Escape (when not focused inside an input/textarea).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const openThreads = useMemo(() => threads.filter((th) => th.status === 'open'), [threads])
  const resolvedThreads = useMemo(() => threads.filter((th) => th.status === 'resolved'), [threads])
  const visible = tab === 'open' ? openThreads : resolvedThreads

  // All emails involved (collaborators + message authors) for consistent collision disambiguation.
  const allEmails = useMemo(() => {
    const set = new Set<string>()
    for (const c of collaborators) if (c.email) set.add(c.email)
    for (const th of threads) {
      for (const m of th.messages) {
        if (m.authorEmail) set.add(m.authorEmail)
        for (const mn of m.mentions) if (mn.email) set.add(mn.email)
      }
    }
    return [...set]
  }, [collaborators, threads])

  // People you can @mention (other collaborators in a shared note).
  const mentionable = useMemo(
    () => (isShared ? collaborators.filter((c) => c.userId !== currentUserId) : []),
    [collaborators, currentUserId, isShared],
  )

  if (!open) return null

  const submitDraft = () => {
    const trimmed = draftBody.trim()
    if (!trimmed) return
    onCreateThread(trimmed, draftMentions)
    setDraftBody('')
    setDraftMentions([])
  }

  const submitReply = (threadId: string) => {
    const trimmed = replyBody.trim()
    if (!trimmed) return
    onReply(threadId, trimmed, replyMentions)
    setReplyBody('')
    setReplyMentions([])
    setReplyFor(null)
  }

  return createPortal(
    <aside
      aria-label={t('comments.title')}
      className="fixed top-12 right-3 bottom-3 z-40 flex w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-float animate-in fade-in-0 slide-in-from-right-3 duration-[var(--duration-spring-fast)] ease-[var(--ease-apple)]"
    >
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">{t('comments.title')}</span>
        {resolvedThreads.length > 0 ? (
          <div className="ml-auto flex items-center rounded-md bg-muted/60 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTab('open')}
              className={cn(
                'rounded px-2 py-0.5 font-medium transition-colors',
                tab === 'open'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('comments.openTab', { count: openThreads.length })}
            </button>
            <button
              type="button"
              onClick={() => setTab('resolved')}
              className={cn(
                'rounded px-2 py-0.5 font-medium transition-colors',
                tab === 'resolved'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('comments.resolvedTab', { count: resolvedThreads.length })}
            </button>
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label={t('window.close')}
          className={resolvedThreads.length > 0 ? '' : 'ml-auto'}
        >
          <X />
        </Button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {draft && !readOnly ? (
          <div className="rounded-lg border border-brand/40 bg-card p-3 shadow-2xs">
            <blockquote className="mb-2 line-clamp-2 border-l-2 border-brand pl-2 text-xs text-muted-foreground">
              {draft.quote}
            </blockquote>
            <MentionTextarea
              value={draftBody}
              mentions={draftMentions}
              onChange={(v, m) => {
                setDraftBody(v)
                setDraftMentions(m)
              }}
              onSubmit={submitDraft}
              onCancel={onCancelDraft}
              placeholder={t('comments.placeholder')}
              collaborators={mentionable}
              allEmails={allEmails}
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={onCancelDraft}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" disabled={!draftBody.trim()} onClick={submitDraft}>
                <Send className="size-3.5" />
                {t('comments.send')}
              </Button>
            </div>
          </div>
        ) : null}

        {visible.length === 0 && !draft ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <MessageSquare className="size-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground/80">
              {tab === 'resolved' ? t('comments.emptyResolved') : t('comments.empty')}
            </p>
            {tab === 'open' && !readOnly ? (
              <p className="text-xs text-muted-foreground">{t('comments.emptyHint')}</p>
            ) : null}
          </div>
        ) : null}

        {visible.map((thread) => {
          const isActive = thread.id === activeThreadId
          const isUnread = unreadThreadIds.has(thread.id)
          const isOrphan = orphanThreadIds.has(thread.id)
          const replying = replyFor === thread.id
          return (
            <div
              key={thread.id}
              ref={isActive ? activeCardRef : undefined}
              className={cn(
                'rounded-lg border bg-card p-3 transition-colors',
                isActive ? 'border-brand/50 ring-1 ring-brand/25' : 'hover:border-border/80',
              )}
            >
              <div className="mb-2 flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onSelectThread(thread.id)}
                  className={cn(
                    'min-w-0 flex-1 line-clamp-2 border-l-2 pl-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground',
                    isActive ? 'border-brand' : 'border-muted-foreground/30',
                  )}
                >
                  {thread.quote}
                  {isOrphan ? (
                    <span className="ml-1.5 text-[10px] italic opacity-70">
                      ({t('comments.fragmentDeleted')})
                    </span>
                  ) : null}
                </button>
                {isUnread ? (
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full bg-brand"
                    title={t('comments.unread')}
                  />
                ) : null}
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSetStatus(thread.id, thread.status === 'open' ? 'resolved' : 'open')
                    }
                    title={thread.status === 'open' ? t('comments.resolve') : t('comments.reopen')}
                    aria-label={
                      thread.status === 'open' ? t('comments.resolve') : t('comments.reopen')
                    }
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {thread.status === 'open' ? (
                      <Check className="size-3.5" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                  </button>
                ) : null}
              </div>

              <div className="space-y-2.5">
                {thread.messages.map((msg) => {
                  const display = msg.authorEmail
                    ? emailDisplayName(msg.authorEmail, allEmails)
                    : t('comments.you')
                  const bg = colorFor(msg.authorId || 'local')
                  const fg = onColor(bg)
                  const canDelete = !readOnly && (!isShared || msg.authorId === currentUserId)
                  const parts = parseCommentBody(msg.body, msg.mentions, allEmails)
                  return (
                    <div key={msg.id} className="group flex gap-2">
                      <span
                        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                        style={{ background: bg, color: fg }}
                        title={msg.authorEmail || undefined}
                      >
                        {initials(msg.authorEmail || display)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="truncate text-xs font-medium"
                            title={msg.authorEmail || undefined}
                          >
                            {display}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatRelative(msg.createdAt, i18n.resolvedLanguage)}
                          </span>
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteMessage(thread.id, msg.id)
                              }}
                              aria-label={t('common.delete')}
                              className="ml-auto hidden size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive group-hover:inline-flex"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-foreground/90 [overflow-wrap:anywhere]">
                          {(() => {
                            let offset = 0
                            return parts.map((part) => {
                              const key = `${msg.id}-${offset}`
                              offset += part.text.length
                              return part.kind === 'mention' ? (
                                <span
                                  key={key}
                                  title={part.email}
                                  className="rounded bg-brand/12 px-1 py-0.5 font-medium text-brand"
                                >
                                  {part.text}
                                </span>
                              ) : (
                                <span key={key}>{part.text}</span>
                              )
                            })
                          })()}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {!readOnly && thread.status === 'open' ? (
                replying ? (
                  <div className="mt-2.5 border-t pt-2.5">
                    <MentionTextarea
                      value={replyBody}
                      mentions={replyMentions}
                      onChange={(v, m) => {
                        setReplyBody(v)
                        setReplyMentions(m)
                      }}
                      onSubmit={() => submitReply(thread.id)}
                      onCancel={() => {
                        setReplyFor(null)
                        setReplyBody('')
                        setReplyMentions([])
                      }}
                      placeholder={t('comments.replyPlaceholder')}
                      collaborators={mentionable}
                      allEmails={allEmails}
                      autoFocus
                    />
                    <div className="mt-2 flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReplyFor(null)
                          setReplyBody('')
                          setReplyMentions([])
                        }}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={!replyBody.trim()}
                        onClick={() => submitReply(thread.id)}
                      >
                        {t('comments.reply')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 border-t pt-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectThread(thread.id)
                        setReplyFor(thread.id)
                        setReplyBody('')
                        setReplyMentions([])
                      }}
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t('comments.reply')}
                    </button>
                  </div>
                )
              ) : null}
            </div>
          )
        })}
      </div>
    </aside>,
    document.body,
  )
}
