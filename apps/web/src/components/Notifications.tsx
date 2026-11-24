import { type CommentNotification, emailDisplayName, type SharedInvite } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, Bell, CheckCheck, Folder as FolderIcon, MessageSquare, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { sharedContext, useAccount } from '../lib/account/account'
import { colorFor, initials, onColor } from '../lib/collab/people'
import { markCommentsRead, requestOpenComment, useCommentAlerts } from '../lib/comments/store'
import { useDb } from '../lib/db'
import { errorMessage } from '../lib/errors'
import { formatRelative } from '../lib/time'

const INVITES = 'shared-invites'

/**
 * The bell in the title bar: invitations to shared notes/folders and unread comment/@mention
 * notifications. Invitations join this account's notes only when accepted; clicking a comment
 * notification opens the note and jumps to the thread.
 */
export function NotificationsButton() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { driver } = useDb()
  const pending = useAccount((s) => s.invites)
  const commentEvents = useCommentAlerts((s) => s.events)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const ctx = sharedContext()

  const invites = useQuery({
    queryKey: [INVITES, pending.join()],
    queryFn: () => (ctx ? ctx.shared.invites() : []),
    enabled: open && Boolean(ctx) && pending.length > 0,
  })
  const list = pending.length ? (invites.data ?? []) : []

  // Resolve local note id + title for each unread comment notification.
  const sharedIds = useMemo(
    () => [...new Set(commentEvents.map((e) => e.sharedNoteId))].sort(),
    [commentEvents],
  )
  const { data: noteMap } = useQuery({
    queryKey: ['comment-notif-notes', sharedIds.join(',')],
    enabled: open && sharedIds.length > 0,
    queryFn: async () => {
      const placeholders = sharedIds.map(() => '?').join(',')
      const rows = await driver.query<{ id: string; shared_id: string; title: string }>(
        `SELECT id, shared_id, title FROM notes WHERE shared_id IN (${placeholders}) AND deleted_at IS NULL`,
        sharedIds,
      )
      const map = new Map<string, { id: string; title: string }>()
      for (const r of rows) map.set(r.shared_id, { id: r.id, title: r.title })
      return map
    },
  })

  const allActorEmails = useMemo(
    () => commentEvents.map((e) => e.actorEmail).filter(Boolean),
    [commentEvents],
  )

  const totalCount = pending.length + commentEvents.length

  const answer = async (invite: SharedInvite, accept: boolean) => {
    if (!ctx) return
    const { sharedId } = invite
    setBusy(`${sharedId}:${accept ? 'accept' : 'decline'}`)
    try {
      const folder = invite.kind === 'folder'
      if (accept) {
        const id = folder
          ? await ctx.shared.acceptFolder(sharedId)
          : await ctx.shared.accept(sharedId)
        setOpen(false)
        useUi.getState().navigate(folder ? { kind: 'folder', id } : { kind: 'note', id })
      } else if (folder) await ctx.shared.declineFolder(sharedId)
      else await ctx.shared.decline(sharedId)
      useAccount.setState((s) => ({ invites: s.invites.filter((id) => id !== sharedId) }))
      await qc.invalidateQueries()
      if (!accept) toast(t('notifications.declined'))
    } catch (err) {
      toast.error(t('people.failed', { error: errorMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const openComment = (ev: CommentNotification) => {
    const target = noteMap?.get(ev.sharedNoteId)
    setOpen(false)
    void markCommentsRead(ctx?.shared ?? null, ev.sharedNoteId, ev.threadId)
    if (target) requestOpenComment(target.id, ev.threadId)
  }

  const markAllCommentsRead = () => {
    void markCommentsRead(ctx?.shared ?? null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="relative"
              aria-label={t('notifications.open')}
            >
              <Bell />
              {totalCount ? (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-0.5 text-[9px] font-semibold leading-none text-brand-foreground tabular-nums">
                  {totalCount > 99 ? '99+' : totalCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('notifications.open')}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 p-1.5">
        <div className="flex items-center justify-between px-2 pt-1 pb-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t('notifications.title')}
          </span>
          {commentEvents.length > 0 ? (
            <button
              type="button"
              onClick={markAllCommentsRead}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <CheckCheck className="size-3" />
              {t('comments.markAllRead')}
            </button>
          ) : null}
        </div>
        {list.length || commentEvents.length ? (
          <div className="max-h-[min(60dvh,420px)] overflow-y-auto">
            {list.length ? (
              <ul>
                {list.map((inv) => (
                  <li key={inv.sharedId} className="flex gap-2.5 rounded-md px-2 py-2">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                      {inv.kind === 'folder' ? (
                        <FolderIcon className="size-3.5" />
                      ) : (
                        <Users className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        {t(
                          inv.kind === 'folder'
                            ? inv.role === 'view'
                              ? 'notifications.folderView'
                              : 'notifications.folderEdit'
                            : inv.role === 'view'
                              ? 'notifications.inviteView'
                              : 'notifications.inviteEdit',
                          { from: inv.from },
                        )}
                      </p>
                      {inv.title ? (
                        <p className="truncate text-sm font-medium">{inv.title}</p>
                      ) : null}
                      <div className="mt-2 flex gap-1.5">
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          loading={busy === `${inv.sharedId}:accept`}
                          onClick={() => void answer(inv, true)}
                        >
                          {t('notifications.accept')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          loading={busy === `${inv.sharedId}:decline`}
                          onClick={() => void answer(inv, false)}
                        >
                          {t('notifications.decline')}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {commentEvents.length ? (
              <ul className={list.length ? 'mt-1 border-t pt-1' : undefined}>
                {commentEvents.map((ev) => {
                  const target = noteMap?.get(ev.sharedNoteId)
                  const display = emailDisplayName(ev.actorEmail, allActorEmails)
                  const bg = colorFor(ev.actorId)
                  const fg = onColor(bg)
                  const isMention = ev.kind === 'mention'
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => openComment(ev)}
                        className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                      >
                        <span
                          className="relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                          style={{ background: bg, color: fg }}
                          title={ev.actorEmail}
                        >
                          {initials(ev.actorEmail)}
                          <span
                            className={
                              isMention
                                ? 'absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-brand text-brand-foreground ring-2 ring-popover'
                                : 'absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-popover'
                            }
                          >
                            {isMention ? (
                              <AtSign className="size-2.5" />
                            ) : (
                              <MessageSquare className="size-2.5" />
                            )}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] leading-snug">
                            <span className="font-medium" title={ev.actorEmail}>
                              {display}
                            </span>{' '}
                            <span className="text-muted-foreground">
                              {t(
                                ev.kind === 'mention'
                                  ? 'comments.notifMention'
                                  : ev.kind === 'reply'
                                    ? 'comments.notifReply'
                                    : 'comments.notifComment',
                              )}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="truncate font-medium text-foreground/80">
                              {target?.title || t('common.untitled')}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0">
                              {formatRelative(ev.createdAt, i18n.resolvedLanguage)}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="flex items-center gap-2 px-2.5 pt-1 pb-3 text-sm text-muted-foreground">
            {pending.length && invites.isLoading ? (
              <>
                <Spinner />
                {t('common.loading')}
              </>
            ) : (
              t('notifications.empty')
            )}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
