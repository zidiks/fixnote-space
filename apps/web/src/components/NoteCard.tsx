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
function useCoverUrl(src: string): string | null {
  const { attachments } = useDb()
  const id = attachmentIdFromUrl(src)
  const url = useQuery({
    queryKey: ['attachment-url', id],
    queryFn: () => (id ? attachmentObjectUrl(attachments, id) : null),
    enabled: id !== null,
    staleTime: Number.POSITIVE_INFINITY,
  }).data
  if (id && url && !url.mime.startsWith('image/')) return null
  return (id ? url?.url : src) ?? null
}

function Cover({ src }: { src: string }) {
  const resolved = useCoverUrl(src)
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

function Thumb({ src }: { src: string }) {
  const resolved = useCoverUrl(src)
  if (!resolved) return null
  return (
    <img
      src={resolved}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      className="size-16 shrink-0 self-center rounded-lg border object-cover"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

/** Right-click menu of a note in a list, the same for every view. */
function NoteMenu({ note, children }: { note: NoteSummary; children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const folders = useFolders().data ?? []
  const move = useMoveNote()
  const deleteWithUndo = useDeleteWithUndo()
  const setPinned = useSetPinned()
  const pinned = note.pinnedAt !== null
  const open = () => navigate({ kind: 'note', id: note.id })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
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

interface ItemProps {
  note: NoteSummary
  /** The folder being listed: a note in one of its subfolders says which. */
  inFolder?: string | undefined
  /** The time shown: when the note was created (sorted by creation) or last edited. */
  date?: 'edited' | 'created'
}

/** Small marks after the date: pinned, shared, the subfolder. */
function useMarks(note: NoteSummary, inFolder: string | undefined) {
  const { t } = useTranslation()
  const folders = useFolders().data ?? []
  const subfolder =
    inFolder && note.folderId && note.folderId !== inFolder
      ? folders.find((f) => f.id === note.folderId)?.name
      : undefined
  return (
    <>
      {note.pinnedAt !== null ? (
        <Pin className="size-3.5 shrink-0 text-brand" aria-label={t('pin.pinned')} />
      ) : null}
      {note.sharedId ? (
        <Users className="size-3.5 shrink-0 text-brand" aria-label={t('people.badge')} />
      ) : null}
      {subfolder ? (
        <span className="flex min-w-0 items-center gap-1">
          <Folder className="size-3.5 shrink-0" />
          <span className="truncate">{subfolder}</span>
        </span>
      ) : null}
    </>
  )
}

function Tasks({ tasks }: { tasks: NoteSummary['tasks'] }) {
  return tasks ? (
    <span className="flex shrink-0 items-center gap-1 tabular-nums">
      <CheckSquare className="size-3.5" />
      {tasks.done}/{tasks.total}
    </span>
  ) : null
}

const itemClass =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset data-[state=open]:bg-accent/60'

/** Cards view: a card with the first image, the title and a long excerpt. */
export function NoteCard({ note, inFolder, date = 'edited' }: ItemProps) {
  const { t, i18n } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const marks = useMarks(note, inFolder)
  const Icon = note.type === 'daily' ? CalendarDays : FileText

  return (
    <NoteMenu note={note}>
      <button
        type="button"
        onClick={() => navigate({ kind: 'note', id: note.id })}
        className="group flex h-full min-h-32 w-full flex-col overflow-hidden rounded-xl border bg-card p-4 text-left shadow-xs transition-shadow outline-none hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:ring-2 data-[state=open]:ring-ring/40"
      >
        {note.cover ? <Cover src={note.cover} /> : null}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          <span>
            {formatCardDate(
              date === 'created' ? note.createdAt : note.updatedAt,
              i18n.resolvedLanguage,
            )}
          </span>
          {marks}
          {note.tasks ? (
            <span className="ml-auto">
              <Tasks tasks={note.tasks} />
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
      </button>
    </NoteMenu>
  )
}

/** List view: a row with the title, two lines of the text, the date and a thumbnail. */
export function NoteRow({ note, inFolder, date = 'edited' }: ItemProps) {
  const { t, i18n } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const marks = useMarks(note, inFolder)

  return (
    <NoteMenu note={note}>
      <button
        type="button"
        onClick={() => navigate({ kind: 'note', id: note.id })}
        className={cn('flex w-full gap-4 px-4 py-3 text-left hover:bg-accent/40', itemClass)}
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn('block truncate font-medium', !note.title && 'text-muted-foreground')}
          >
            {note.title || t('common.untitled')}
          </span>
          {note.excerpt ? (
            <span className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {note.excerpt}
            </span>
          ) : null}
          <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {note.type === 'daily' ? <CalendarDays className="size-3.5 shrink-0" /> : null}
            <span className="shrink-0">
              {formatCardDate(
                date === 'created' ? note.createdAt : note.updatedAt,
                i18n.resolvedLanguage,
              )}
            </span>
            {marks}
            <Tasks tasks={note.tasks} />
          </span>
        </span>
        {note.cover ? <Thumb src={note.cover} /> : null}
      </button>
    </NoteMenu>
  )
}

/** Compact view: one line per note, for long lists. */
export function NoteLine({ note, inFolder, date = 'edited' }: ItemProps) {
  const { t, i18n } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const marks = useMarks(note, inFolder)
  const Icon = note.type === 'daily' ? CalendarDays : FileText

  return (
    <NoteMenu note={note}>
      <button
        type="button"
        onClick={() => navigate({ kind: 'note', id: note.id })}
        className={cn(
          'flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm hover:bg-accent/40',
          itemClass,
        )}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn('shrink truncate font-medium', !note.title && 'text-muted-foreground')}>
          {note.title || t('common.untitled')}
        </span>
        {note.excerpt ? (
          <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">
            {note.excerpt}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {marks}
          <Tasks tasks={note.tasks} />
          <span className="w-20 text-right tabular-nums">
            {formatCardDate(
              date === 'created' ? note.createdAt : note.updatedAt,
              i18n.resolvedLanguage,
            )}
          </span>
        </span>
      </button>
    </NoteMenu>
  )
}
