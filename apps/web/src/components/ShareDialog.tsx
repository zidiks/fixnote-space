import type { Note } from '@fixnote/core'
import { i18n, useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { useAccount } from '../lib/account/account'
import { errorMessage, isServerOutdated } from '../lib/errors'
import { listShares, publishShare, revokeShare } from '../lib/share'

export const SHARES_KEY = ['shares'] as const

/** What went wrong, in words; a server without the shares migration gets its own message. */
export function shareError(err: unknown): string {
  return isServerOutdated(err)
    ? i18n.t('share.serverOutdated')
    : i18n.t('share.failed', { error: errorMessage(err) })
}

/** The signed-in user's shared links; empty when signed out. */
export function useShares(enabled = true) {
  const phase = useAccount((s) => s.phase)
  return useQuery({
    queryKey: [...SHARES_KEY, phase],
    queryFn: listShares,
    enabled: enabled && phase === 'ready',
    staleTime: 30_000,
  })
}

export function ShareDialog({
  note,
  open,
  onOpenChange,
}: {
  note: Note
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const phase = useAccount((s) => s.phase)
  const shares = useShares(open)
  const share = shares.data?.find((s) => s.noteId === note.id)
  const [busy, setBusy] = useState(false)

  const run = async (task: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try {
      await task()
      await qc.invalidateQueries({ queryKey: SHARES_KEY })
      if (done) toast(done)
    } catch (err) {
      toast(shareError(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url)
    toast(t('share.copied'))
  }

  const snapshot = { title: note.title, content: note.content }
  const sharedAt = share ? Date.parse(share.updatedAt) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md space-y-4 p-6">
        <DialogTitle className="flex items-center gap-2 font-semibold">
          <Link2 className="size-4 text-muted-foreground" />
          {t('share.title')}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {t('share.body')}
        </DialogDescription>

        {phase !== 'ready' ? (
          <div className="space-y-3">
            <p className="text-sm">{t('share.signIn')}</p>
            <Button
              onClick={() => {
                onOpenChange(false)
                useUi.getState().openSettings('account')
              }}
            >
              {t('share.signInButton')}
            </Button>
          </div>
        ) : shares.isPending ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : share ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={share.url}
                aria-label={t('share.title')}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={() => void copy(share.url)}>
                <Copy />
                {t('share.copy')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('share.snapshot', {
                time: new Date(sharedAt).toLocaleString(i18n.resolvedLanguage, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}{' '}
              {note.updatedAt > sharedAt ? t('share.outdated') : null}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => publishShare(note.id, snapshot, share.id), t('share.updated'))
                }
              >
                {t('share.update')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={() => void run(() => revokeShare(share.id), t('share.stopped'))}
              >
                {t('share.stop')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const url = await publishShare(note.id, snapshot)
                await copy(url).catch(() => undefined)
              })
            }
          >
            <Link2 />
            {busy ? t('share.working') : t('share.create')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
