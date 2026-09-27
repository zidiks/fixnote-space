import { useTranslation } from '@fixnote/i18n'
import { Users } from 'lucide-react'
import { useEffect, useReducer, useState } from 'react'
import { useAccount } from '../lib/account/account'
import { type LiveEditing, openShared } from '../lib/collab/live'

/**
 * A shared note's live editing while it is open: the room is joined when the note opens (and the
 * account is unlocked) and left when it closes. `failed` when this device cannot open it (signed
 * out): the note is then edited as plain text and sync brings the edits in later.
 */
export function useSharedLive(sharedId: string | null) {
  const phase = useAccount((s) => s.phase)
  const [live, setLive] = useState<LiveEditing | null>(null)
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!sharedId || phase !== 'ready') {
      setFailed(Boolean(sharedId))
      return
    }
    let alive = true
    let opened: LiveEditing | null = null
    setOpening(true)
    setFailed(false)
    void openShared(sharedId)
      .then((l) => {
        if (!alive) {
          l?.session.destroy()
          return
        }
        opened = l
        setLive(l)
        setFailed(!l)
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setOpening(false))
    return () => {
      alive = false
      opened?.session.destroy()
      setLive(null)
    }
  }, [sharedId, phase])

  return { live, opening, failed }
}

/** Under the note header of a shared note: who else is in it now, read-only, latency. */
export function LiveBar({ live }: { live: LiveEditing }) {
  const { t } = useTranslation()
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    live.session.awareness.on('change', refresh)
    live.session.onRtt = refresh
    return () => {
      live.session.awareness.off('change', refresh)
      live.session.onRtt = undefined
    }
  }, [live])

  const self = live.session.doc.clientID
  const here = [
    ...new Set(
      [...live.session.awareness.getStates()]
        .filter(([id]) => id !== self)
        .map(([, state]) => (state as { user?: { name?: string } }).user?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ]
  const rtt = live.session.rtt
  const parts = [
    t('people.shared'),
    live.readOnly ? t('people.readOnly') : '',
    here.length ? t('people.here', { names: here.join(', ') }) : '',
    here.length && rtt !== null ? t('people.latency', { ms: Math.round(rtt / 2) }) : '',
  ].filter(Boolean)

  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm">
      <Users className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">{parts.join(' · ')}</span>
      {here.length ? (
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
      ) : null}
    </div>
  )
}
