import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { Users } from 'lucide-react'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { toast } from 'sonner'
import { joinLive, type LiveEditing } from '../lib/collab/live'

/** Live editing of one note on the account's devices: join, leave, and the session while open. */
export function useLiveNote(noteId: string) {
  const { t } = useTranslation()
  const [live, setLive] = useState<LiveEditing | null>(null)
  const [joining, setJoining] = useState(false)

  // Leaving the note (or the live mode) closes the room.
  useEffect(() => () => live?.session.destroy(), [live])
  // biome-ignore lint/correctness/useExhaustiveDependencies: another note means another room
  useEffect(() => () => setLive(null), [noteId])

  const start = useCallback(async () => {
    setJoining(true)
    try {
      const joined = await joinLive(noteId)
      if (joined) setLive(joined)
      else toast.error(t('live.unavailable'))
    } finally {
      setJoining(false)
    }
  }, [noteId, t])
  const stop = useCallback(() => setLive(null), [])
  return { live, joining, start, stop }
}

/** Under the note header while editing live: how many devices are in, the round trip, leave. */
export function LiveBar({
  live,
  joining,
  onLeave,
}: {
  live: LiveEditing | null
  joining: boolean
  onLeave: () => void
}) {
  const { t } = useTranslation()
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!live) return
    live.session.awareness.on('change', refresh)
    live.session.onRtt = refresh
    return () => {
      live.session.awareness.off('change', refresh)
      live.session.onRtt = undefined
    }
  }, [live])
  if (!live && !joining) return null

  const devices = live?.session.devices() ?? 1
  const rtt = live?.session.rtt
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      <span className="min-w-0 flex-1">
        {joining
          ? t('live.connecting')
          : devices > 1
            ? [
                t('live.devices', { count: devices }),
                rtt !== null && rtt !== undefined
                  ? t('live.latency', { ms: Math.round(rtt / 2) })
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : t('live.alone')}
      </span>
      {live ? (
        <Button size="sm" variant="ghost" onClick={onLeave}>
          <Users />
          {t('live.leave')}
        </Button>
      ) : null}
    </div>
  )
}
