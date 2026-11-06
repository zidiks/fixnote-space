import { folderPath, folderTree, standaloneUrl } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
} from '@fixnote/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Folder, FolderPlus, Link2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { type ListRoute, useUi } from '../app/store'
import { notifyNotesChanged } from '../lib/assistant/assistant'
import { useDb } from '../lib/db'
import { errorMessage } from '../lib/errors'
import { type LinkSaveDeps, moveLink, saveLinkWithToast, useLinkMove } from '../lib/link-save'
import { useCounts, useFolders, useLinkFolders } from '../lib/queries'

/** What saving and moving links need, from the app's database and query cache. */
function useLinkDeps(): LinkSaveDeps {
  const { driver, repo, links } = useDb()
  const qc = useQueryClient()
  return useMemo(
    () => ({
      db: driver,
      repo,
      previews: links,
      refresh: () => {
        notifyNotesChanged()
        return qc.invalidateQueries()
      },
    }),
    [driver, repo, links, qc],
  )
}

/**
 * The top of the Links list: a field to save a link by pasting it, and the topics (the folders
 * that hold links, most first) to narrow the list to one.
 */
export function LinksBar({ list }: { list: Extract<ListRoute, { kind: 'links' }> }) {
  const { t } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const folders = useFolders().data ?? []
  const topics = useLinkFolders().data ?? []
  const total = useCounts().data?.links
  const chip = (on: boolean) =>
    cn(
      'h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:h-8',
      on
        ? 'border-foreground/15 bg-card shadow-xs'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    )
  return (
    <div className="space-y-2">
      <AddLink />
      {topics.length > 1 || list.folder ? (
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          <button
            type="button"
            aria-pressed={!list.folder}
            className={chip(!list.folder)}
            onClick={() => navigate({ kind: 'links' }, { replace: true })}
          >
            {t('links.all')}
            {total ? <span className="ml-1.5 tabular-nums opacity-60">{total}</span> : null}
          </button>
          {topics.map(({ folderId, count }) => {
            if (!folderId) return null
            const path = folderPath(folders, folderId)
            if (!path.length) return null
            const on = list.folder === folderId
            return (
              <button
                key={folderId}
                type="button"
                aria-pressed={on}
                title={path.join(' ▸ ')}
                className={chip(on)}
                onClick={() => navigate({ kind: 'links', folder: folderId }, { replace: true })}
              >
                {path.at(-1)}
                <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** Paste a link, Enter: saved and placed like one from the browser extension. */
function AddLink() {
  const { t } = useTranslation()
  const deps = useLinkDeps()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const url = standaloneUrl(value)
    if (!url) {
      toast.error(t('links.invalid'))
      return
    }
    setBusy(true)
    try {
      await saveLinkWithToast(deps, { url })
      setValue('')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 pointer-coarse:h-10">
        <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('links.addPlaceholder')}
          aria-label={t('links.add')}
          inputMode="url"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground pointer-coarse:text-base"
        />
      </label>
      <Button type="submit" size="sm" variant="outline" loading={busy} disabled={!value.trim()}>
        {t('links.add')}
      </Button>
    </form>
  )
}

/** "Change" in the toast after saving a link: pick its folder, or make one. */
export function LinkMoveDialog() {
  const { t } = useTranslation()
  const target = useLinkMove((s) => s.target)
  const deps = useLinkDeps()
  const folders = useFolders().data ?? []
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const close = () => {
    useLinkMove.setState({ target: null })
    setName('')
  }
  const own = folderTree(folders.filter((f) => f.access !== 'view'))

  const pick = async (key: string, folderId: () => Promise<string>) => {
    if (!target) return
    setBusy(key)
    try {
      await moveLink(deps, target, await folderId())
      close()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="max-w-sm p-5" data-back-layer>
        <DialogTitle className="font-semibold">{t('links.moveTitle')}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {t('links.moveBody')}
        </DialogDescription>
        <form
          className="mt-4 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            const clean = name.trim()
            if (clean) void pick('new', async () => (await deps.repo.createFolder(clean)).id)
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('links.newFolder')}
            aria-label={t('links.newFolder')}
            className="h-8"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!name.trim() || busy !== null}
            loading={busy === 'new'}
          >
            <FolderPlus />
            {t('links.create')}
          </Button>
        </form>
        <ul className="mt-3 max-h-72 overflow-y-auto">
          {own.map(({ folder: f, depth }) => (
            <li key={f.id}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'w-full justify-start font-normal',
                  f.id === target?.from && 'bg-accent font-medium',
                )}
                style={{ paddingInlineStart: `${0.5 + depth}rem` }}
                disabled={busy !== null}
                loading={busy === f.id}
                onClick={() => void pick(f.id, async () => f.id)}
              >
                <Folder />
                <span className="truncate">{f.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
