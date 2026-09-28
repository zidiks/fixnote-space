import {
  type Note,
  PersonNotFoundError,
  type SharedMember,
  type SharedNotes,
  type SharedRole,
} from '@fixnote/core'
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
import { FolderOpen, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { requestSync, sharedContext } from '../lib/account/account'
import { errorMessage } from '../lib/errors'
import { useFolders, useInvalidateNotes } from '../lib/queries'

const MEMBERS = 'shared-members'

/** What is shared: a note, or a folder (with all its notes). */
export type PeopleTarget = { kind: 'note'; note: Note } | { kind: 'folder'; folderId: string }

/** The calls for a note or a folder, so the section below is the same for both. */
function actions(shared: SharedNotes, target: PeopleTarget) {
  if (target.kind === 'note')
    return {
      share: () => shared.share(target.note.id),
      members: (id: string) => shared.members(id),
      invite: (id: string, email: string, role: 'edit' | 'view') => shared.invite(id, email, role),
      setRole: (id: string, user: string, role: 'edit' | 'view') => shared.setRole(id, user, role),
      remove: (id: string, user: string) => shared.removeMember(id, user),
      leave: (id: string) => shared.leave(id),
      unshare: (id: string) => shared.unshare(id),
    }
  return {
    share: () => shared.shareFolder(target.folderId),
    members: (id: string) => shared.folderMembers(id),
    invite: (id: string, email: string, role: 'edit' | 'view') =>
      shared.inviteToFolder(id, email, role),
    setRole: (id: string, user: string, role: 'edit' | 'view') =>
      shared.setFolderRole(id, user, role),
    remove: (id: string, user: string) => shared.removeFolderMember(id, user),
    leave: (id: string) => shared.leaveFolder(id),
    unshare: (id: string) => shared.unshareFolder(id),
  }
}

/**
 * People a note or folder is shared with: invite by email (they must have a FixNote account and
 * accept), change what they may do, remove them; a member can leave. The key goes to each person
 * sealed to their own key, so the server never reads the notes.
 */
export function PeopleSection({ target, onDone }: { target: PeopleTarget; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const folders = useFolders().data ?? []
  const ctx = sharedContext()
  // The shared note or folder behind it, and (for a note) the shared folder it came through.
  const info = useQuery({
    queryKey: [
      MEMBERS,
      'info',
      target.kind,
      target.kind === 'note' ? target.note.id : target.folderId,
      // Shared for the first time from here: ask again once the note knows its shared id.
      target.kind === 'note' ? target.note.sharedId : null,
    ],
    queryFn: async () => {
      if (!ctx) return null
      if (target.kind === 'folder') {
        const folder = await ctx.shared.folder(target.folderId)
        return { sharedId: folder?.sharedId ?? null, viaFolder: null }
      }
      const doc = target.note.sharedId ? await ctx.shared.doc(target.note.sharedId) : null
      const via = doc?.folderSharedId ? await ctx.shared.folderOf(target.note.folderId) : null
      return { sharedId: target.note.sharedId, viaFolder: via?.folderId ?? null }
    },
    enabled: Boolean(ctx),
  })
  const sharedId = info.data?.sharedId ?? null
  const members = useQuery({
    queryKey: [MEMBERS, target.kind, sharedId],
    queryFn: () => (ctx && sharedId ? actions(ctx.shared, target).members(sharedId) : []),
    enabled: Boolean(ctx && sharedId),
    // Someone may have left or been added on another device since: always ask when opened.
    refetchOnMount: 'always',
  })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'edit' | 'view'>('edit')
  // The action running now (its button shows a spinner; the others wait).
  const [busy, setBusy] = useState<string | null>(null)
  if (!ctx || !info.data) return null
  const calls = actions(ctx.shared, target)
  const viaFolder = folders.find((f) => f.id === info.data?.viaFolder)

  const myRole: SharedRole = sharedId
    ? (members.data?.find((m) => m.userId === ctx.userId)?.role ?? 'view')
    : 'owner'
  const owner = myRole === 'owner'

  const act = async (key: string, task: () => Promise<unknown>, done?: string) => {
    setBusy(key)
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
      setBusy(null)
    }
  }

  const invite = (address: string, as: 'edit' | 'view', key = 'invite') =>
    act(
      key,
      async () => {
        if (address.toLowerCase() === ctx.email.toLowerCase()) throw new Error(t('people.self'))
        const id = sharedId ?? (await calls.share())
        await calls.invite(id, address, as)
        setEmail('')
      },
      target.kind === 'folder'
        ? t('people.invitedFolder', { email: address })
        : t('people.invited', { email: address }),
    )

  const status = (m: SharedMember) =>
    m.accepted ? null : ctx.shared.isExpired(m) ? t('people.expired') : t('people.pending')

  return (
    <section className="space-y-3">
      {viaFolder ? (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <FolderOpen className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>{t('people.inFolder', { name: viaFolder.name })}</span>
        </p>
      ) : null}

      {owner ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (email.includes('@') && !busy) void invite(email.trim(), role)
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
          <Button
            type="submit"
            loading={busy === 'invite'}
            disabled={busy !== null || !email.includes('@')}
          >
            <UserPlus />
            {t('people.invite')}
          </Button>
        </form>
      ) : null}

      {members.data?.length ? (
        <ul className="divide-y rounded-lg border">
          {members.data.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {m.email}
                  {m.userId === ctx.userId ? (
                    <span className="text-muted-foreground"> · {t('people.you')}</span>
                  ) : null}
                </span>
                {status(m) ? (
                  <span className="block text-xs text-muted-foreground">{status(m)}</span>
                ) : null}
              </span>
              {owner && sharedId && m.role !== 'owner' && ctx.shared.isExpired(m) ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={busy !== null}
                  loading={busy === `again:${m.userId}`}
                  onClick={() =>
                    void invite(m.email, m.role === 'view' ? 'view' : 'edit', `again:${m.userId}`)
                  }
                >
                  {t('people.inviteAgain')}
                </Button>
              ) : null}
              {m.role === 'owner' ? (
                <span className="text-muted-foreground">{t('people.owner')}</span>
              ) : owner && sharedId ? (
                <>
                  <Select
                    value={m.role}
                    disabled={busy !== null}
                    onValueChange={(v) =>
                      void act(`role:${m.userId}`, () =>
                        calls.setRole(sharedId, m.userId, v as 'edit' | 'view'),
                      )
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
                    disabled={busy !== null}
                    loading={busy === `remove:${m.userId}` || busy === `role:${m.userId}`}
                    onClick={() =>
                      void act(`remove:${m.userId}`, () => calls.remove(sharedId, m.userId))
                    }
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

      {sharedId && members.data?.length ? (
        <div className="flex justify-end">
          {owner ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              loading={busy === 'unshare'}
              onClick={() =>
                void act(
                  'unshare',
                  () => calls.unshare(sharedId),
                  target.kind === 'folder' ? t('people.unsharedFolder') : t('people.unshared'),
                )
              }
            >
              {t('people.unshare')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              loading={busy === 'leave'}
              onClick={async () => {
                const done = target.kind === 'folder' ? t('people.leftFolder') : t('people.left')
                if (await act('leave', () => calls.leave(sharedId), done)) {
                  onDone()
                  useUi.getState().navigate({ kind: 'home' })
                }
              }}
            >
              {target.kind === 'folder' ? t('people.leaveFolder') : t('people.leave')}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  )
}
