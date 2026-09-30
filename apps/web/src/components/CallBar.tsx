import { useTranslation } from '@fixnote/i18n'
import { Button, ConfirmDialog, Spinner } from '@fixnote/ui'
import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useUi } from '../app/store'
import { useRepo } from '../lib/db'
import { usePlatform } from '../lib/platform'
import { useInvalidateNotes, writableFolder } from '../lib/queries'
import { cancelCall, setCallDeps, stopCall, useCall } from '../lib/voice/call'
import { useVoice } from '../lib/voice/voice'

function elapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const clock = `${Math.floor((s % 3600) / 60)}:${String(s % 60).padStart(2, '0')}`
  return s >= 3600 ? `${Math.floor(s / 3600)}:${clock.padStart(5, '0')}` : clock
}

/** A side's level: a short bar that follows the voice. */
function Level({ label, level }: { label: string; level: number }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <span className="h-1 w-8 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className="block h-full rounded-full bg-destructive transition-[width] duration-100"
          style={{ width: `${Math.min(100, Math.round(level * 100))}%` }}
        />
      </span>
    </span>
  )
}

/**
 * Wires call notes to the app and shows a call's state at the bottom: recording (both sides'
 * levels), then transcribing the rest and writing it up.
 */
export function CallBar() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  const status = useCall((s) => s.status)
  const startedAt = useCall((s) => s.startedAt)
  const me = useCall((s) => s.me)
  const them = useCall((s) => s.them)
  const left = useCall((s) => s.left)
  const [now, setNow] = useState(Date.now())
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    setCallDeps({
      transcriber: platform.transcriber,
      ...(platform.systemAudio ? { systemAudio: platform.systemAudio } : {}),
      dictating: () => useVoice.getState().status !== 'idle',
      save: async (markdown) => {
        const route = useUi.getState().route
        const note = await repo.createNote({
          content: markdown,
          folderId: await writableFolder(repo, route.kind === 'folder' ? route.id : null),
        })
        await invalidate()
        useUi.getState().navigate({ kind: 'note', id: note.id })
      },
    })
  }, [platform, repo, invalidate])

  useEffect(() => {
    if (status !== 'recording') return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [status])

  if (status === 'idle') return null

  return (
    <div
      role="status"
      title={t('voice.local')}
      className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border bg-popover py-1.5 pr-1.5 pl-4 text-sm text-popover-foreground shadow-float animate-in fade-in-0 slide-in-from-bottom-2"
    >
      {status === 'recording' ? (
        <>
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
          <span className="font-medium">{t('call.recording')}</span>
          <span className="text-muted-foreground tabular-nums">
            {elapsed(Math.max(0, now - startedAt))}
          </span>
          <span className="flex items-center gap-3 max-sm:hidden">
            <Level label={t('call.me')} level={me} />
            {platform.systemAudio ? <Level label={t('call.them')} level={them} /> : null}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            onClick={() => setConfirm(true)}
          >
            <X />
            {t('call.cancel')}
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => void stopCall()}>
            <Check />
            {t('call.stop')}
          </Button>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={t('call.cancelTitle')}
            description={t('call.cancelBody')}
            confirmLabel={t('call.cancel')}
            cancelLabel={t('common.cancel')}
            destructive
            onConfirm={() => {
              setConfirm(false)
              cancelCall()
            }}
          />
        </>
      ) : (
        <span className="flex items-center gap-2 py-1.5 pr-3 text-muted-foreground">
          <Spinner />
          {status === 'transcribing' && left > 0
            ? t('call.transcribing', { count: left })
            : t('call.summarizing')}
        </span>
      )}
    </div>
  )
}
