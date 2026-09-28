import type { NoteSummary } from '@fixnote/core'
import { attachmentIdFromUrl, folderTree } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  cn,
} from '@fixnote/ui'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Check,
  CheckSquare,
  FileText,
  Folder,
  FolderInput,
  Inbox,
  Pin,
  PinOff,
  SquareArrowOutUpRight,
  Trash2,
  Users,
} from 'lucide-react'
import { useUi } from '../app/store'
import { attachmentObjectUrl } from '../lib/attachments'
import { useDb } from '../lib/db'
import { useDeleteWithUndo, useFolders, useMoveNote, useSetPinned } from '../lib/queries'
import { formatCardDate } from '../lib/time'

/** The note's first image: attachments resolve to a local object URL, web images load as is. */
function Cover({ src }: { src: string }) {
  const { attachments } = useDb()
  const id = attachmentIdFromUrl(src)
  const url = useQuery({
    queryKey: ['attachment-url', id],
    queryFn: () => (id ? attachmentObjectUrl(attachments, id) : null),
    enabled: id !== null,
    staleTime: Number.POSITIVE_INFINITY,
  }).data
  if (id && url && !url.mime.startsWith('image/')) return null
  const resolved = id ? url?.url : src
  if (!resolved) return null
  return (
    <img
      src={resolved}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      className="-mx-2.5 -mt-2.5 mb-3 h-28 w-[calc(100%+1.25rem)] max-w-none rounded-lg object-cover"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

export function NoteCard({ note, inFolder }: { note: NoteSummary; inFolder?: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const folders = useFolders().data ?? []
  const move = useMoveNote()
  const deleteWithUndo = useDeleteWithUndo()
  const setPinned = useSetPinned()
  const pinned = note.pinnedAt !== null
  const Icon = note.type === 'daily' ? CalendarDays : FileText
  // Listed in a parent folder: say which subfolder the note is in.
  const subfolder =
    inFolder && note.folderId && note.folderId !== inFolder
      ? folders.find((f) => f.id === note.folderId)?.name
      : undefined
  const open = () => navigate({ kind: 'note', id: note.id })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={open}
          className="group flex h-full min-h-32 w-full flex-col overflow-hidden rounded-xl border bg-card p-4 text-left shadow-xs transition-shadow outline-none hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:ring-2 data-[state=open]:ring-ring/40"
        >
          {note.cover ? <Cover src={note.cover} /> : null}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5" />
            <span>{formatCardDate(note.updatedAt, i18n.resolvedLanguage)}</span>
            {pinned ? <Pin className="size-3.5 text-brand" aria-label={t('pin.pinned')} /> : null}
            {note.sharedId ? (
              <Users className="size-3.5 text-brand" aria-label={t('people.badge')} />
            ) : null}
            {subfolder ? (
              <span className="flex min-w-0 items-center gap-1">
                <Folder className="size-3.5 shrink-0" />
                <span className="truncate">{subfolder}</span>
              </span>
            ) : null}
            {note.tasks ? (
              <span className="ml-auto flex items-center gap-1 tabular-nums">
                <CheckSquare className="size-3.5" />
                {note.tasks.done}/{note.tasks.total}
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              'mt-2 line-clamp-2 font-medium leading-snug [overflow-wrap:anywhere]',
              !note.title && 'text-muted-foreground',
            )}
          >
            {note.title || t('common.untitled')}
          </p>
          {note.excerpt ? (
            <p className="mt-1.5 line-clamp-7 text-[13px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {note.excerpt}
            </p>
          ) : null}
          {note.tags.length ? (
            <div className="mt-auto flex flex-wrap gap-1 pt-2">
              {note.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={open}>
          <SquareArrowOutUpRight />
          {t('menu.open')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => setPinned.mutate({ id: note.id, pinned: !pinned })}>
          {pinned ? <PinOff /> : <Pin />}
          {pinned ? t('pin.unpin') : t('pin.pin')}
        </ContextMenuItem>
        {/* View only: no moving or deleting it from here. */}
        {note.readOnly ? null : (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderInput />
                {t('menu.moveTo')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => move.mutate({ id: note.id, folderId: null })}>
                  <Inbox />
                  <span className="flex-1">{t('common.noFolder')}</span>
                  <Check className={cn(note.folderId !== null && 'invisible')} />
                </ContextMenuItem>
                {folderTree(folders.filter((f) => f.access !== 'view')).map(
                  ({ folder: f, depth }) => (
                    <ContextMenuItem
                      key={f.id}
                      onSelect={() => move.mutate({ id: note.id, folderId: f.id })}
                      style={{ paddingInlineStart: `${0.5 + depth}rem` }}
                    >
                      <Folder />
                      <span className="flex-1">{f.name}</span>
                      <Check className={cn(note.folderId !== f.id && 'invisible')} />
                    </ContextMenuItem>
                  ),
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem destructive onSelect={() => void deleteWithUndo(note.id)}>
              <Trash2 />
              {t('note.delete')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
