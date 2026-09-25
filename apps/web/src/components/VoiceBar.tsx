import { useTranslation } from '@fixnote/i18n'
import { Button, isApple, Kbd } from '@fixnote/ui'
import { Check, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { useRepo } from '../lib/db'
import { usePlatform } from '../lib/platform'
import { useInvalidateNotes } from '../lib/queries'
import { cancelVoice, setVoiceDeps, stopVoice, useVoice } from '../lib/voice/voice'

export const VOICE_KEYS = `${isApple ? '⌘' : 'Ctrl'}+Shift+Space`

function elapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Level meter: five bars that follow the voice. */
function Meter({ level }: { level: number }) {
  return (
    <span className="flex h-4 items-center gap-0.5" aria-hidden>
      {[0.5, 0.8, 1, 0.8, 0.5].map((w, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed set of bars
          key={i}
          className="w-0.5 rounded-full bg-destructive transition-[height] duration-75"
          style={{ height: `${Math.max(3, Math.min(16, level * w * 22))}px` }}
        />
      ))}
    </span>
  )
}

/**
 * Wires dictation to the app (where new voice notes go) and shows its state: a small bar at the
 * bottom while recording, transcribing or downloading the speech model.
 */
export function VoiceBar() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  const status = useVoice((s) => s.status)
  const level = useVoice((s) => s.level)
  const startedAt = useVoice((s) => s.startedAt)
  const download = useVoice((s) => s.download)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setVoiceDeps({
      transcriber: platform.transcriber,
      createNote: async (text) => {
        const route = useUi.getState().route
        const note = await repo.createNote({
          content: text,
          folderId: route.kind === 'folder' ? route.id : null,
        })
        await invalidate()
        useUi.getState().navigate({ kind: 'note', id: note.id })
        toast(t('voice.saved'), {
          action: {
            label: t('voice.tidy'),
            onClick: () => useUi.getState().requestAi({ noteId: note.id, action: 'structure' }),
          },
        })
      },
    })
  }, [platform, repo, invalidate, t])

  useEffect(() => {
    if (status !== 'recording') return
    const timer = setInterval(() => setNow(Date.now()), 250)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelVoice()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearInterval(timer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [status])

  if (status === 'idle') return null

  return (
    <div
      role="status"
      title={t('voice.local')}
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-popover py-1.5 pr-1.5 pl-4 text-sm text-popover-foreground shadow-float animate-in fade-in-0 slide-in-from-bottom-2"
    >
      {status === 'recording' ? (
        <>
          <span className="size-2 animate-pulse rounded-full bg-destructive" />
          <span className="font-medium">{t('voice.recording')}</span>
          <span className="w-10 text-muted-foreground tabular-nums">
            {elapsed(Math.max(0, now - startedAt))}
          </span>
          <Meter level={level} />
          {download !== null ? (
            <span className="text-xs text-muted-foreground">
              {t('voice.downloading', { percent: Math.round(download * 100) })}
            </span>
          ) : null}
          <Button size="sm" variant="ghost" className="rounded-full" onClick={cancelVoice}>
            <X />
            {t('voice.cancel')}
            <Kbd>Esc</Kbd>
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => void stopVoice()}>
            <Check />
            {t('voice.done')}
          </Button>
        </>
      ) : (
        <span className="flex items-center gap-2 py-1.5 pr-3 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {download !== null
            ? t('voice.downloading', { percent: Math.round(download * 100) })
            : t('voice.transcribing')}
        </span>
      )}
    </div>
  )
}
