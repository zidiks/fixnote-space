import { type Note, PersonNotFoundError, type SharedRole } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Users, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { requestSync, sharedContext } from '../lib/account/account'
import { errorMessage } from '../lib/errors'
import { useInvalidateNotes } from '../lib/queries'

const MEMBERS = 'shared-members'

/**
 * People a note is shared with: invite by email (they must have a FixNote account), change what
 * they may do, remove them; a member can leave. The note key goes to each person sealed to their
 * own key, so the server never reads the note.
 */
export function PeopleSection({ note, onDone }: { note: Note; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const ctx = sharedContext()
  const sharedId = note.sharedId
  const members = useQuery({
    queryKey: [MEMBERS, sharedId],
    queryFn: () => (ctx && sharedId ? ctx.shared.members(sharedId) : []),
    enabled: Boolean(ctx && sharedId),
    // Someone may have left or been added on another device since: always ask when opened.
    refetchOnMount: 'always',
  })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'edit' | 'view'>('edit')
  const [busy, setBusy] = useState(false)
  if (!ctx) return null

  const myRole: SharedRole = sharedId
    ? (members.data?.find((m) => m.userId === ctx.userId)?.role ?? 'view')
    : 'owner'
  const owner = myRole === 'owner'

  const act = async (task: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try {
      await task()
      await qc.invalidateQueries({ queryKey: [MEMBERS] })
      await invalidate()
      requestSync()
      if (done) toast(done)
      return true
    } catch (err) {
      toast.error(
        err instanceof PersonNotFoundError
          ? t('people.notFound', { email: err.email })
          : t('people.failed', { error: errorMessage(err) }),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  const invite = () =>
    act(
      async () => {
        const address = email.trim()
        if (address.toLowerCase() === ctx.email.toLowerCase()) throw new Error(t('people.self'))
        const id = sharedId ?? (await ctx.shared.share(note.id))
        await ctx.shared.invite(id, address, role)
        setEmail('')
      },
      t('people.invited', { email: email.trim() }),
    )

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-muted-foreground" />
          {t('people.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('people.body')}</p>
      </div>

      {owner ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (email.includes('@') && !busy) void invite()
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder={t('people.emailPlaceholder')}
            aria-label={t('people.emailPlaceholder')}
            className="min-w-0 flex-1 basis-48"
          />
          <Select value={role} onValueChange={(v) => setRole(v as 'edit' | 'view')}>
            <SelectTrigger className="w-auto" aria-label={t('people.role')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="edit">{t('people.roleEdit')}</SelectItem>
              <SelectItem value="view">{t('people.roleView')}</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={busy || !email.includes('@')}>
            <UserPlus />
            {t('people.invite')}
          </Button>
        </form>
      ) : null}

      {members.data?.length ? (
        <ul className="divide-y rounded-lg border">
          {members.data.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {m.email}
                {m.userId === ctx.userId ? (
                  <span className="text-muted-foreground"> · {t('people.you')}</span>
                ) : null}
              </span>
              {m.role === 'owner' ? (
                <span className="text-muted-foreground">{t('people.owner')}</span>
              ) : owner && sharedId ? (
                <>
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      void act(() => ctx.shared.setRole(sharedId, m.userId, v as 'edit' | 'view'))
                    }
                  >
                    <SelectTrigger className="h-8 w-auto" aria-label={t('people.role')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="edit">{t('people.roleEdit')}</SelectItem>
                      <SelectItem value="view">{t('people.roleView')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('people.remove', { email: m.email })}
                    disabled={busy}
                    onClick={() => void act(() => ctx.shared.removeMember(sharedId, m.userId))}
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {m.role === 'edit' ? t('people.roleEdit') : t('people.roleView')}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {sharedId ? (
        <div className="flex justify-end">
          {owner ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void act(() => ctx.shared.unshare(sharedId), t('people.unshared'))}
            >
              {t('people.unshare')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (await act(() => ctx.shared.leave(sharedId), t('people.left'))) {
                  onDone()
                  useUi.getState().navigate({ kind: 'home' })
                }
              }}
            >
              {t('people.leave')}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  )
}
