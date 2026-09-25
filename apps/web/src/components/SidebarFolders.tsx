import type { Folder } from '@fixnote/core'
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
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useUi } from '../app/store'
import { useFolderMutations, useFolders } from '../lib/queries'

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
  let settled = false
  const finish = (name: string | null) => {
    if (settled) return
    settled = true
    onDone(name?.trim() ? name.trim() : null)
  }
  return (
    <div className="flex h-8 items-center gap-2.5 pr-2" style={{ paddingLeft: 10 + depth * 14 }}>
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
  const folders = useFolders().data ?? []
  const { create, rename, remove } = useFolderMutations()
  const route = useUi((s) => s.route)
  const navigate = useUi((s) => s.navigate)
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined)
  const [renaming, setRenaming] = useState<string | null>(null)
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<Folder | null>(null)

  const children = useMemo(() => {
    const map = new Map<string | null, Folder[]>()
    for (const f of folders) {
      const list = map.get(f.parentId) ?? []
      list.push(f)
      map.set(f.parentId, list)
    }
    return map
  }, [folders])

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode => (
    <>
      {(children.get(parentId) ?? []).map((f) => {
        const kids = children.get(f.id)?.length ?? 0
        const open = !collapsed.has(f.id)
        const active = route.kind === 'folder' && route.id === f.id
        return (
          <div key={f.id}>
            {renaming === f.id ? (
              <NameInput
                initial={f.name}
                depth={depth}
                onDone={(name) => {
                  setRenaming(null)
                  if (name && name !== f.name) rename.mutate({ id: f.id, name })
                }}
              />
            ) : (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      'group mb-0.5 flex h-8 items-center rounded-md pr-1 text-[13.5px] text-sidebar-foreground hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent',
                      active && 'bg-sidebar-accent font-medium text-foreground',
                    )}
                    // Same left edge as Inbox and tags; subfolders step in. The expand arrow
                    // sits on the right, so a folder without subfolders has no gap before it.
                    style={{ paddingLeft: 10 + depth * 14 }}
                  >
                    <button
                      type="button"
                      onClick={() => navigate({ kind: 'folder', id: f.id })}
                      onDoubleClick={() => setRenaming(f.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left"
                    >
                      <FolderIcon className="size-4 shrink-0 opacity-70" />
                      <span className="truncate">{f.name}</span>
                    </button>
                    {kids ? (
                      <button
                        type="button"
                        aria-label={f.name}
                        aria-expanded={open}
                        onClick={() => toggle(f.id)}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight
                          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
                        />
                      </button>
                    ) : null}
                    <span className="px-1 text-xs text-muted-foreground tabular-nums group-hover:hidden">
                      {f.noteCount || ''}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="hidden size-6 group-hover:inline-flex data-[state=open]:inline-flex"
                          aria-label={t('sidebar.folderActions')}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" onCloseAutoFocus={keepFocus}>
                        <DropdownMenuItem onSelect={startEdit(() => setCreatingIn(f.id))}>
                          <FolderPlus />
                          {t('sidebar.newSubfolder')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={startEdit(() => setRenaming(f.id))}>
                          <Pencil />
                          {t('common.rename')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setConfirm(f)}>
                          <Trash2 />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent onCloseAutoFocus={keepFocus}>
                  <ContextMenuItem onSelect={startEdit(() => setCreatingIn(f.id))}>
                    <FolderPlus />
                    {t('sidebar.newSubfolder')}
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={startEdit(() => setRenaming(f.id))}>
                    <Pencil />
                    {t('common.rename')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem destructive onSelect={() => setConfirm(f)}>
                    <Trash2 />
                    {t('common.delete')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}
            {open ? renderLevel(f.id, depth + 1) : null}
            {creatingIn === f.id ? (
              <NameInput
                depth={depth + 1}
                onDone={(name) => {
                  setCreatingIn(undefined)
                  if (name) {
                    setCollapsed((s) => {
                      const next = new Set(s)
                      next.delete(f.id)
                      return next
                    })
                    create.mutate({ name, parentId: f.id })
                  }
                }}
              />
            ) : null}
          </div>
        )
      })}
    </>
  )

  return (
    <div className="mt-5">
      <div className="group flex items-center justify-between pr-1 pb-1 pl-2.5">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('sidebar.folders')}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6"
          aria-label={t('sidebar.newFolder')}
          onClick={() => setCreatingIn(null)}
        >
          <FolderPlus />
        </Button>
      </div>
      {renderLevel(null, 0)}
      {creatingIn === null ? (
        <NameInput
          depth={0}
          onDone={(name) => {
            setCreatingIn(undefined)
            if (name) create.mutate({ name })
          }}
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
        title={t('sidebar.deleteFolderTitle', { name: confirm?.name ?? '' })}
        description={t('sidebar.deleteFolderBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          if (!confirm) return
          if (route.kind === 'folder') navigate({ kind: 'inbox' }, { replace: true })
          remove.mutate(confirm.id)
          setConfirm(null)
        }}
      />
    </div>
  )
}
