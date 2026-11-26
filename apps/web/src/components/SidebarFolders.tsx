import { type Folder, subtreeCounts } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  ConfirmDialog,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@fixnote/ui'
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { requestSync, sharedContext, useAccount } from '../lib/account/account'
import { useFolderCommentCounts } from '../lib/comments/store'
import { useRepo } from '../lib/db'
import { useDeleteKeyHandler } from '../lib/delete-key'
import { errorMessage } from '../lib/errors'
import { useListRoute } from '../lib/layout'
import { draggedNoteIds, isNoteDrag, moveNotes } from '../lib/note-drag'
import { useFolderMutations, useFolders, useInvalidateNotes } from '../lib/queries'
import { endSelection } from '../lib/selection'
import { FolderShareDialog } from './FolderShareDialog'
import { VirtualList } from './VirtualList'

/** Holding dragged notes over a folded folder this long unfolds it. */
const UNFOLD_MS = 700
const FOLDER_ROW_PX = 38

/** Whether the folder can be deleted (or left) from here. */
const deletable = (f: Folder) => !(f.access === 'view' && !f.shared)

type FolderRow =
  | { key: string; kind: 'folder'; folder: Folder; depth: number }
  | { key: string; kind: 'input'; parentId: string | null; depth: number }

const EMPTY_FOLDERS: Folder[] = []
const folderKey = (id: string) => `folder:${id}`
const inputKey = (parentId: string | null) => `input:${parentId ?? 'root'}`

function NameInput({
  initial = '',
  depth,
  onDone,
}: {
  initial?: string
  depth: number
  onDone: (name: string | null) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  const settled = useRef(false)
  const finish = (name: string | null) => {
    if (settled.current) return
    settled.current = true
    onDone(name?.trim() ? name.trim() : null)
  }
  return (
    <div
      className="flex items-center gap-2.5 pr-2"
      style={{ height: FOLDER_ROW_PX, paddingLeft: 10 + depth * 14 }}
    >
      <FolderIcon className="size-4 shrink-0 opacity-70" />
      <input
        // biome-ignore lint/a11y/noAutofocus: the input appears in response to an explicit action
        autoFocus
        value={value}
        placeholder={t('sidebar.folderName')}
        aria-label={t('sidebar.folderName')}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(value)
          if (e.key === 'Escape') finish(null)
        }}
        onBlur={() => finish(value)}
        className="h-7 min-w-0 flex-1 rounded-md border border-ring/50 bg-background px-2 text-[13px] outline-none"
      />
    </div>
  )
}

export function SidebarFolders() {
  const { t } = useTranslation()
  const folders = useFolders().data ?? EMPTY_FOLDERS
  const { create, rename, remove } = useFolderMutations()
  // The folder listed: on screen, or (notes layout) beside the open note.
  const list = useListRoute()
  const navigate = useUi((s) => s.navigate)
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; kind: 'context' | 'dropdown' } | null>(null)
  // A menu item that opens a name field: the field appears only once the menu has closed and
  // let go of focus, or the menu pulls focus back to its trigger and the field closes at once.
  const pendingEdit = useRef<(() => void) | null>(null)
  const startEdit = (fn: () => void) => () => {
    pendingEdit.current = fn
  }
  const keepFocus = (e: Event) => {
    const edit = pendingEdit.current
    if (!edit) return
    pendingEdit.current = null
    e.preventDefault()
    edit()
  }
  // Folded folders stay folded after a restart (kept with the other UI settings of this device).
  const collapsedList = useUi((s) => s.collapsedFolders)
  const toggle = useUi((s) => s.toggleFolder)
  const collapsed = useMemo(() => new Set(collapsedList), [collapsedList])
  const [confirm, setConfirm] = useState<Folder | null>(null)
  const [sharing, setSharing] = useState<Folder | null>(null)
  // Sharing needs the account (keys and server).
  const canShare = useAccount((s) => s.phase === 'ready')
  const invalidate = useInvalidateNotes()
  // Someone else's folder: deleting it means leaving it.
  const leaving = confirm?.shared === 'edit' || confirm?.shared === 'view'
  const repo = useRepo()

  // Delete on the folder last clicked here.
  useDeleteKeyHandler('folder', (id) => {
    const f = folders.find((x) => x.id === id)
    if (f && deletable(f)) setConfirm(f)
  })

  // Notes dragged from a list: the folder under them lights up; a folded one unfolds after a
  // moment, as in Finder.
  const [dropOn, setDropOn] = useState<string | null>(null)
  const unfold = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const stopUnfold = () => {
    if (unfold.current) clearTimeout(unfold.current.timer)
    unfold.current = null
  }
  useEffect(() => {
    const end = () => {
      setDropOn(null)
      if (unfold.current) clearTimeout(unfold.current.timer)
      unfold.current = null
    }
    document.addEventListener('dragend', end)
    document.addEventListener('drop', end)
    return () => {
      document.removeEventListener('dragend', end)
      document.removeEventListener('drop', end)
    }
  }, [])

  const dropTarget = (f: Folder, kids: number, open: boolean) =>
    f.access === 'view'
      ? {}
      : {
          onDragOver: (e: React.DragEvent) => {
            if (!isNoteDrag(e.dataTransfer)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropOn(f.id)
            if (kids && !open && unfold.current?.id !== f.id) {
              stopUnfold()
              unfold.current = { id: f.id, timer: setTimeout(() => toggle(f.id), UNFOLD_MS) }
            }
          },
          onDragLeave: (e: React.DragEvent) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            setDropOn((id) => (id === f.id ? null : id))
            if (unfold.current?.id === f.id) stopUnfold()
          },
          onDrop: (e: React.DragEvent) => {
            if (!isNoteDrag(e.dataTransfer)) return
            e.preventDefault()
            setDropOn(null)
            stopUnfold()
            void dropNotes(draggedNoteIds(e.dataTransfer), f)
          },
        }

  const dropNotes = async (ids: string[], folder: Folder) => {
    const { moved, error } = await moveNotes(repo, ids, folder.id)
    if (error) toast.error(errorMessage(error))
    if (!moved.length) return
    await invalidate()
    endSelection()
    // Undo goes through the repo directly: the toast outlives anything on screen.
    toast(
      moved.length === 1
        ? t('drop.moved', { folder: folder.name })
        : t('drop.movedMany', { folder: folder.name, count: moved.length }),
      {
        action: {
          label: t('common.undo'),
          onClick: () =>
            void (async () => {
              for (const m of moved) await repo.moveNote(m.id, m.from)
              await invalidate()
            })(),
        },
      },
    )
  }

  // A folder counts the notes of its subfolders too, as its list shows them.
  const totals = useMemo(() => subtreeCounts(folders), [folders])
  const commentCounts = useFolderCommentCounts(folders)
  const children = useMemo(() => {
    const map = new Map<string | null, Folder[]>()
    for (const f of folders) {
      const list = map.get(f.parentId) ?? []
      list.push(f)
      map.set(f.parentId, list)
    }
    return map
  }, [folders])

  const rows = useMemo(() => {
    const visible: FolderRow[] = []
    const append = (parentId: string | null, depth: number) => {
      for (const folder of children.get(parentId) ?? EMPTY_FOLDERS) {
        visible.push({ key: folderKey(folder.id), kind: 'folder', folder, depth })
        if (!collapsed.has(folder.id)) append(folder.id, depth + 1)
        if (creatingIn === folder.id)
          visible.push({
            key: inputKey(folder.id),
            kind: 'input',
            parentId: folder.id,
            depth: depth + 1,
          })
      }
    }
    append(null, 0)
    if (creatingIn === null)
      visible.push({ key: inputKey(null), kind: 'input', parentId: null, depth: 0 })
    return visible
  }, [children, collapsed, creatingIn])

  const renderRow = (row: FolderRow) => {
    const { depth } = row
    if (row.kind === 'input') {
      const { parentId } = row
      return (
        <NameInput
          depth={depth}
          onDone={(name) => {
            setCreatingIn(undefined)
            if (name) {
              if (parentId && collapsed.has(parentId)) toggle(parentId)
              create.mutate(parentId ? { name, parentId } : { name })
            }
          }}
        />
      )
    }
    const f = row.folder
    const kids = children.get(f.id)?.length ?? 0
    const open = !collapsed.has(f.id)
    const active = list?.kind === 'folder' && list.id === f.id
    const unread = commentCounts.get(f.id)
    return renaming === f.id ? (
      <NameInput
        initial={f.name}
        depth={depth}
        onDone={(name) => {
          setRenaming(null)
          if (name && name !== f.name) rename.mutate({ id: f.id, name })
        }}
      />
    ) : (
      <ContextMenu onOpenChange={(open) => open && setMenu({ id: f.id, kind: 'context' })}>
        <ContextMenuTrigger asChild>
          <div
            data-folder-id={f.id}
            {...dropTarget(f, kids, open)}
            className={cn(
              'group flex items-center rounded-sm pr-1 text-[13px] text-sidebar-foreground transition-[background-color,transform] duration-75 ease-out hover:bg-sidebar-accent/70 active:scale-[0.992] data-[state=open]:bg-sidebar-accent motion-reduce:transition-none motion-reduce:active:scale-100',
              active && 'bg-sidebar-accent font-medium text-foreground',
              dropOn === f.id && 'bg-brand/10 text-foreground ring-2 ring-brand/40 ring-inset',
            )}
            // Same left edge as Inbox and tags; subfolders step in. The expand arrow
            // sits on the right, so a folder without subfolders has no gap before it.
            style={{ height: FOLDER_ROW_PX, paddingLeft: 10 + depth * 14 }}
          >
            <button
              type="button"
              onClick={() => navigate({ kind: 'folder', id: f.id })}
              onDoubleClick={() => f.access !== 'view' && setRenaming(f.id)}
              className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left pointer-coarse:py-2"
            >
              <FolderIcon className="size-4 shrink-0 opacity-70" />
              <span className="truncate">{f.name}</span>
              {f.shared ? (
                <Users
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-label={t('people.sharedFolder')}
                />
              ) : null}
              {unread ? (
                <span
                  className={cn(
                    'inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums',
                    unread.mentions > 0
                      ? 'bg-brand text-brand-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                  title={t('comments.unreadBadge', { count: unread.total })}
                >
                  <MessageSquare className="size-2.5" />
                  {unread.total > 99 ? '99+' : unread.total}
                </span>
              ) : null}
            </button>
            {kids ? (
              <button
                type="button"
                aria-label={f.name}
                aria-expanded={open}
                onClick={() => toggle(f.id)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground pointer-coarse:size-8"
              >
                <ChevronRight
                  className={cn('size-3.5 transition-transform', open && 'rotate-90')}
                />
              </button>
            ) : null}
            <span className="px-1 text-xs text-muted-foreground tabular-nums group-hover:hidden pointer-coarse:hidden">
              {totals.get(f.id) || ''}
            </span>
            <DropdownMenu onOpenChange={(open) => open && setMenu({ id: f.id, kind: 'dropdown' })}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="hidden size-6 group-hover:inline-flex data-[state=open]:inline-flex pointer-coarse:inline-flex pointer-coarse:size-8"
                  aria-label={t('sidebar.folderActions')}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              {menu?.id === f.id && menu.kind === 'dropdown' ? (
                <DropdownMenuContent align="start" onCloseAutoFocus={keepFocus}>
                  {f.access === 'view' ? null : (
                    <>
                      <DropdownMenuItem onSelect={startEdit(() => setCreatingIn(f.id))}>
                        <FolderPlus />
                        {t('sidebar.newSubfolder')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={startEdit(() => setRenaming(f.id))}>
                        <Pencil />
                        {t('common.rename')}
                      </DropdownMenuItem>
                    </>
                  )}
                  {/* A subfolder of a shared folder goes with it, not on its own. */}
                  {canShare && (f.shared || !f.access) ? (
                    <DropdownMenuItem onSelect={() => setSharing(f)}>
                      <Users />
                      {t('people.shareFolder')}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  {f.access === 'view' && !f.shared ? null : (
                    <DropdownMenuItem destructive onSelect={() => setConfirm(f)}>
                      {f.shared === 'edit' || f.shared === 'view' ? <LogOut /> : <Trash2 />}
                      {f.shared === 'edit' || f.shared === 'view'
                        ? t('people.leaveFolder')
                        : t('common.delete')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              ) : null}
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        {menu?.id === f.id && menu.kind === 'context' ? (
          <ContextMenuContent onCloseAutoFocus={keepFocus}>
            {f.access === 'view' ? null : (
              <>
                <ContextMenuItem onSelect={startEdit(() => setCreatingIn(f.id))}>
                  <FolderPlus />
                  {t('sidebar.newSubfolder')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={startEdit(() => setRenaming(f.id))}>
                  <Pencil />
                  {t('common.rename')}
                </ContextMenuItem>
              </>
            )}
            {/* A subfolder of a shared folder goes with it, not on its own. */}
            {canShare && (f.shared || !f.access) ? (
              <ContextMenuItem onSelect={() => setSharing(f)}>
                <Users />
                {t('people.shareFolder')}
              </ContextMenuItem>
            ) : null}
            <ContextMenuSeparator />
            {f.access === 'view' && !f.shared ? null : (
              <ContextMenuItem destructive onSelect={() => setConfirm(f)}>
                {f.shared === 'edit' || f.shared === 'view' ? <LogOut /> : <Trash2 />}
                {f.shared === 'edit' || f.shared === 'view'
                  ? t('people.leaveFolder')
                  : t('common.delete')}
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
    )
  }

  return (
    <div className="mt-5">
      <div className="group flex h-8 items-center justify-between pr-1 pl-2.5">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('sidebar.folders')}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 pointer-coarse:size-8"
          aria-label={t('sidebar.newFolder')}
          onClick={() => setCreatingIn(null)}
        >
          <FolderPlus />
        </Button>
      </div>
      {rows.length ? (
        <VirtualList
          items={rows}
          itemKey={(row) => row.key}
          estimate={() => FOLDER_ROW_PX}
          fixedSize
          render={renderRow}
          keepKey={
            creatingIn !== undefined ? inputKey(creatingIn) : renaming ? folderKey(renaming) : null
          }
        />
      ) : null}
      {!folders.length && creatingIn !== null ? (
        <p className="px-2.5 text-xs leading-relaxed text-muted-foreground/80">
          {t('sidebar.noFolders')}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          leaving
            ? t('people.leaveFolderTitle', { name: confirm?.name ?? '' })
            : t('sidebar.deleteFolderTitle', { name: confirm?.name ?? '' })
        }
        description={
          leaving
            ? t('people.leaveFolderBody')
            : confirm?.shared === 'owner'
              ? `${t('sidebar.deleteFolderBody')} ${t('people.deleteSharedFolder')}`
              : t('sidebar.deleteFolderBody')
        }
        confirmLabel={leaving ? t('people.leaveFolder') : t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        focusConfirm
        onConfirm={async () => {
          const folder = confirm
          if (!folder) return
          setConfirm(null)
          if (list?.kind === 'folder')
            navigate({ kind: 'home', filter: 'inbox' }, { replace: true })
          const ctx = folder.shared ? sharedContext() : null
          const shared = ctx ? await ctx.shared.folder(folder.id) : null
          if (!ctx || !shared) {
            remove.mutate(folder.id)
            return
          }
          // A shared folder: its owner stops sharing it first (the others lose it, the owner's
          // notes go to Inbox as usual); anyone else leaves, and their copy goes away.
          try {
            if (shared.owner) {
              await ctx.shared.unshareFolder(shared.sharedId)
              remove.mutate(folder.id)
            } else {
              await ctx.shared.leaveFolder(shared.sharedId)
              toast(t('people.leftFolder'))
            }
            await invalidate()
            requestSync()
          } catch (err) {
            toast.error(t('people.failed', { error: errorMessage(err) }))
          }
        }}
      />
      <FolderShareDialog folder={sharing} onOpenChange={(open) => !open && setSharing(null)} />
    </div>
  )
}
