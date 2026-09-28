import { useTranslation } from '@fixnote/i18n'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@fixnote/ui'
import { Users } from 'lucide-react'
import { useEffect, useReducer, useRef, useState } from 'react'
import { toast } from 'sonner'
import { onSharedSync, useAccount } from '../lib/account/account'
import { type LiveEditing, openShared } from '../lib/collab/live'
import { initials, type LiveUser, othersIn } from '../lib/collab/people'

/**
 * A shared note's live editing while it is open: the room is joined when the note opens (and the
 * account is unlocked) and left when it closes. `failed` when this device cannot open it (signed
 * out): the note is then edited as plain text and sync brings the edits in later. When the owner
 * changes this account's role, the room is joined again with the new one (which also makes the
 * server check the channel access again); `onLost` when access is taken away.
 */
export function useSharedLive(sharedId: string | null, onLost?: () => void) {
  const { t } = useTranslation()
  const phase = useAccount((s) => s.phase)
  const [live, setLive] = useState<LiveEditing | null>(null)
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)
  const [generation, reopen] = useReducer((n: number) => n + 1, 0)
  const lost = useRef(onLost)
  lost.current = onLost
  const current = useRef(live)
  current.current = live

  useEffect(() => {
    if (!sharedId) return
    return onSharedSync((report) => {
      if (report.removed.some((r) => r.sharedId === sharedId && !r.kept)) {
        lost.current?.()
        return
      }
      const change = report.roles.find((r) => r.sharedId === sharedId)
      if (change) {
        toast(t(change.role === 'view' ? 'people.nowView' : 'people.nowEdit'))
        reopen()
      } else if (report.pulled) void current.current?.refresh()
    })
  }, [sharedId, t])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` rejoins the room
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
  }, [sharedId, phase, generation])

  return { live, opening, failed }
}

/** How many faces the stack shows before "+N". */
const MAX_FACES = 4

/** Under the note header of a shared note: that it is shared, and who is in it now (you too). */
export function LiveBar({ live }: { live: LiveEditing }) {
  const { t } = useTranslation()
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    live.session.awareness.on('change', refresh)
    return () => live.session.awareness.off('change', refresh)
  }, [live])

  // Everyone in the note now, this person last (as the others see them).
  const people: (LiveUser & { clientId: number; self?: boolean })[] = [
    ...othersIn(live.session.awareness),
    { ...live.user, clientId: live.session.doc.clientID, self: true },
  ]
  const shown = people.slice(-MAX_FACES)
  const rest = people.slice(0, -MAX_FACES)
  const who = (u: LiveUser & { self?: boolean }) =>
    `${u.email || u.name}${u.self ? ` · ${t('people.you')}` : ''}`
  const roleLabel = (u: LiveUser) =>
    u.role === 'owner'
      ? t('people.owner')
      : u.role === 'view'
        ? t('people.roleView')
        : t('people.roleEdit')

  return (
    <div className="mt-3 flex min-h-11 items-center gap-2.5 rounded-lg border bg-card px-3 py-1.5 text-sm">
      <Users className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1 truncate">
        {t('people.shared')}
        {live.readOnly ? (
          <span className="text-muted-foreground"> · {t('people.readOnly')}</span>
        ) : null}
      </span>
      <div className="flex shrink-0 items-center -space-x-1.5">
        {rest.length ? (
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className="flex size-7 cursor-default items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-2 ring-card">
                +{rest.length}
              </span>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" align="end" className="space-y-1.5">
              {rest.map((u) => (
                <div key={u.clientId}>
                  <p className="font-medium">{who(u)}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel(u)}</p>
                </div>
              ))}
            </HoverCardContent>
          </HoverCard>
        ) : null}
        {shown.map((u) => (
          <HoverCard key={u.clientId}>
            <HoverCardTrigger asChild>
              <span
                className="flex size-7 cursor-default items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-card"
                style={{ backgroundColor: u.color }}
              >
                {initials(u.email || u.name)}
              </span>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" align="end">
              <p className="font-medium">{who(u)}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(u)}</p>
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
    </div>
  )
}
