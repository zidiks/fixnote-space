import type { SharedInvite } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Folder as FolderIcon, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { sharedContext, useAccount } from '../lib/account/account'
import { errorMessage } from '../lib/errors'

const INVITES = 'shared-invites'

/**
 * The bell in the title bar: invitations to shared notes and folders. They join this account's
 * notes only when accepted here, so nobody can fill someone's notes without asking. Invitations
 * not answered in 30 days expire and are not shown.
 */
export function NotificationsButton() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const pending = useAccount((s) => s.invites)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const ctx = sharedContext()
  const invites = useQuery({
    queryKey: [INVITES, pending.join()],
    queryFn: () => (ctx ? ctx.shared.invites() : []),
    enabled: open && Boolean(ctx) && pending.length > 0,
  })
  const list = pending.length ? (invites.data ?? []) : []

  const answer = async (invite: SharedInvite, accept: boolean) => {
    if (!ctx) return
    const { sharedId } = invite
    setBusy(sharedId)
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
              {pending.length ? (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-0.5 text-[9px] font-semibold leading-none text-brand-foreground">
                  {pending.length}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('notifications.open')}</TooltipContent>
      </Tooltip>
      <PopoverContent>
        <div className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
          {t('notifications.title')}
        </div>
        {list.length ? (
          <ul>
            {list.map((inv) => (
              <li key={inv.sharedId} className="flex gap-2.5 rounded-md px-2.5 py-2">
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
                  {inv.title ? <p className="truncate text-sm font-medium">{inv.title}</p> : null}
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void answer(inv, true)}
                    >
                      {t('notifications.accept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => void answer(inv, false)}
                    >
                      {t('notifications.decline')}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2.5 pt-1 pb-3 text-sm text-muted-foreground">
            {pending.length && invites.isLoading ? '…' : t('notifications.empty')}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
