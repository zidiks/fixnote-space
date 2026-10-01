import { folderTree, type NoteSummary } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@fixnote/ui'
import {
  CheckCheck,
  Folder,
  FolderInput,
  Inbox,
  Pin,
  PinOff,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { findSuggestions, refreshTidyCount } from '../lib/assistant/tidy'
import { useDb, useRepo } from '../lib/db'
import { useBackLayer } from '../lib/nav-history'
import { useFolders, useInvalidateNotes } from '../lib/queries'
import { endSelection, selectAll, useSelection } from '../lib/selection'

/**
 * What can be done with the notes picked in a list: pin, move, tidy up, delete (with Undo), pick
 * all of them, or stop picking. Notes shared to view only, or shared notes for deleting, are
 * left as they are.
 */
export function SelectionBar({ notes }: { notes: NoteSummary[] }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const { tidy } = useDb()
  const invalidate = useInvalidateNotes()
  const folders = useFolders().data ?? []
  const active = useSelection((s) => s.active)
  const ids = useSelection((s) => s.ids)
  const [busy, setBusy] = useState<string | null>(null)

  // Back, Escape or leaving the list stops picking.
  useBackLayer(active, endSelection)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
  useEffect(() => () => endSelection(), [])

  if (!active) return null
  const picked = notes.filter((n) => ids.includes(n.id))
  const writable = picked.filter((n) => !n.readOnly)
  const allPinned = picked.length > 0 && picked.every((n) => n.pinnedAt !== null)

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const pin = () =>
    run('pin', async () => {
      for (const n of picked) await repo.setPinned(n.id, !allPinned)
      await invalidate()
      endSelection()
    })

  const move = (folderId: string | null) =>
    run('move', async () => {
      for (const n of writable) await repo.moveNote(n.id, folderId)
      await invalidate()
      endSelection()
    })

  const tidyUp = () =>
    run('tidy', async () => {
      const found = await findSuggestions(tidy, { noteIds: picked.map((n) => n.id) })
      if (found === 'signed-out') {
        toast(t('tidy.signIn'))
        return
      }
      await refreshTidyCount(tidy)
      endSelection()
      useUi.getState().navigate({ kind: 'tidy' })
    })

  const remove = () =>
    run('delete', async () => {
      // A shared note is deleted (or left) on its own, with what that means for the others.
      const gone = writable.filter((n) => !n.sharedId)
      for (const n of gone) await repo.deleteNote(n.id)
      await invalidate()
      endSelection()
      const skipped = picked.length - gone.length
      // Undo goes through the repo directly: the toast outlives this bar.
      toast(t('select.deleted', { count: gone.length }), {
        ...(skipped ? { description: t('select.skipped', { count: skipped }) } : {}),
        action: {
          label: t('common.undo'),
          onClick: () =>
            void (async () => {
              for (const n of gone) await repo.restoreNote(n.id)
              await invalidate()
            })(),
        },
      })
    })

  const disabled = busy !== null || !picked.length
  const label = 'max-sm:sr-only'

  return (
    <div
      role="toolbar"
      aria-label={t('select.count', { count: picked.length })}
      className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 rounded-full border bg-popover p-1.5 text-sm text-popover-foreground shadow-float animate-in fade-in-0 slide-in-from-bottom-2"
    >
      <Button
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        onClick={endSelection}
        aria-label={t('select.done')}
        title={t('select.done')}
      >
        <X />
      </Button>
      <span className="px-1.5 font-medium whitespace-nowrap tabular-nums">
        {t('select.count', { count: picked.length })}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="rounded-full"
        disabled={busy !== null || picked.length === notes.length}
        onClick={() => selectAll(notes.map((n) => n.id))}
        title={t('select.all')}
      >
        <CheckCheck />
        <span className={label}>{t('select.all')}</span>
      </Button>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <Button
        size="sm"
        variant="ghost"
        className="rounded-full"
        disabled={disabled}
        loading={busy === 'pin'}
        onClick={() => void pin()}
        title={allPinned ? t('pin.unpin') : t('pin.pin')}
      >
        {allPinned ? <PinOff /> : <Pin />}
        <span className={label}>{allPinned ? t('pin.unpin') : t('pin.pin')}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            disabled={busy !== null || !writable.length}
            loading={busy === 'move'}
            title={t('menu.moveTo')}
          >
            <FolderInput />
            <span className={label}>{t('menu.moveTo')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="max-h-80 overflow-y-auto">
          <DropdownMenuItem onSelect={() => void move(null)}>
            <Inbox />
            {t('common.noFolder')}
          </DropdownMenuItem>
          {folderTree(folders.filter((f) => f.access !== 'view')).map(({ folder: f, depth }) => (
            <DropdownMenuItem
              key={f.id}
              onSelect={() => void move(f.id)}
              style={{ paddingInlineStart: `${0.5 + depth}rem` }}
            >
              <Folder />
              {f.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="ghost"
        className="rounded-full"
        disabled={disabled}
        loading={busy === 'tidy'}
        onClick={() => void tidyUp()}
        title={t('select.tidy')}
      >
        <WandSparkles />
        <span className={label}>{t('select.tidy')}</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="rounded-full text-destructive hover:text-destructive"
        disabled={busy !== null || !writable.some((n) => !n.sharedId)}
        loading={busy === 'delete'}
        onClick={() => void remove()}
        title={t('select.delete')}
      >
        <Trash2 />
        <span className={label}>{t('select.delete')}</span>
      </Button>
    </div>
  )
}
