import type { NoteSummary } from '@fixnote/core'
import { attachmentIdFromUrl, folderTree, linkHost } from '@fixnote/core'
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
import {
  CalendarDays,
  Check,
  CheckSquare,
  FileText,
  Folder,
  FolderInput,
  Inbox,
  Link2,
  MessageSquare,
  Pin,
  PinOff,
  SquareArrowOutUpRight,
  Trash2,
  Users,
} from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { useUi } from '../app/store'
import { useLlm } from '../lib/assistant/llm'
import { acquireAttachmentUrl, releaseAttachmentUrl } from '../lib/attachments'
import { useCommentAlerts } from '../lib/comments/store'
import { useDb } from '../lib/db'
import { useDeleteWithUndo, useFolders, useMoveNote, useSetPinned } from '../lib/queries'
import { useNotePress } from '../lib/selection'
import { formatCardDate } from '../lib/time'
import { SLIDING_INDICATOR } from './SlidingIndicator'

const LOCAL_IMG_SRC = /^(data:image\/|blob:)/i

/** The note's first image: attachments resolve to a ref-counted object URL; remote URLs respect localOnly. */
function useCoverUrl(src: string): string | null {
  const { attachments } = useDb()
  const localOnly = useLlm((s) => s.localOnly)
  const id = attachmentIdFromUrl(src)
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setResolved(null)
      return
    }
    let alive = true
    void acquireAttachmentUrl(attachments, id).then((file) => {
      if (!alive) return
      setResolved(file?.mime.startsWith('image/') ? file.url : null)
    })
    return () => {
      alive = false
      releaseAttachmentUrl(id)
    }
  }, [attachments, id])

  if (id) return resolved
  if (localOnly && !LOCAL_IMG_SRC.test(src)) return null
  return src || null
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

function Thumb({ src, small = false }: { src: string; small?: boolean }) {
  const resolved = useCoverUrl(src)
  if (!resolved) return null
  return (
    <img
      src={resolved}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      className={cn(
        'shrink-0 rounded-lg border object-cover',
        small ? 'mt-0.5 size-11 self-start rounded-md' : 'size-16 self-center',
      )}
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

/** Lazy menu body: only subscribes to folders & mutations when right-click menu is open. */
function NoteMenuBody({ note }: { note: NoteSummary }) {
  const { t } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const folders = useFolders().data ?? []
  const move = useMoveNote()
  const deleteWithUndo = useDeleteWithUndo()
  const setPinned = useSetPinned()
  const pinned = note.pinnedAt !== null
  const open = () => navigate({ kind: 'note', id: note.id })

  return (
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
  )
}

/** Right-click menu of a note in a list, the same for every view. */
function NoteMenu({ note, children }: { note: NoteSummary; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <ContextMenu onOpenChange={setOpen}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {open ? <NoteMenuBody note={note} /> : null}
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

/** Unread comment/mention pill for a shared note; subscribes selectively to avoid re-renders. */
function CommentBadge({ sharedId }: { sharedId: string | null }) {
  const { t } = useTranslation()
  const unread = useCommentAlerts((s) => (sharedId ? s.bySharedId[sharedId] : undefined))
  if (!unread) return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums',
        unread.mentions > 0 ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground',
      )}
      title={t('comments.unreadBadge', { count: unread.total })}
    >
      <MessageSquare className="size-2.5" />
      {unread.total > 99 ? '99+' : unread.total}
    </span>
  )
}

/** Small marks after the date: pinned, shared, unread comments, the subfolder. */
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
      <CommentBadge sharedId={note.sharedId} />
      {note.url ? (
        <span className="flex min-w-0 items-center gap-1" title={note.url}>
          <Link2 className="size-3.5 shrink-0" aria-label={t('links.badge')} />
          <span className="truncate">{linkHost(note.url)}</span>
        </span>
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
  'outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset data-[state=open]:bg-accent/60 data-[selected]:bg-brand/10 [-webkit-touch-callout:none]'

/** While picking notes: an empty circle, or a checked one. */
function SelectMark({ selected, className }: { selected: boolean; className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      role="img"
      aria-label={selected ? t('select.selected') : t('select.notSelected')}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected
          ? 'border-brand bg-brand text-brand-foreground'
          : 'border-muted-foreground/50 bg-card',
        className,
      )}
    >
      {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </span>
  )
}

/** Cards view: a card with the first image, the title and a long excerpt. */
function NoteCardView({ note, inFolder, date = 'edited' }: ItemProps) {
  const { t, i18n } = useTranslation()
  const marks = useMarks(note, inFolder)
  const press = useNotePress(note)
  const Icon = note.type === 'daily' ? CalendarDays : FileText

  return (
    <NoteMenu note={note}>
      <button
        type="button"
        {...press.props}
        className="group relative flex h-full min-h-32 w-full flex-col rounded-lg border bg-card p-5 text-left shadow-xs outline-none [-webkit-touch-callout:none] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-float after:opacity-0 after:transition-opacity after:duration-150 after:ease-[var(--ease-apple)] hover:after:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 data-[selected]:border-brand data-[selected]:ring-2 data-[selected]:ring-brand/40 data-[state=open]:ring-2 data-[state=open]:ring-ring/40"
      >
        {press.selecting ? (
          <SelectMark selected={press.selected} className="absolute top-3 right-3 z-10" />
        ) : null}
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
            'mt-2 line-clamp-2 font-medium leading-[22px] [overflow-wrap:anywhere]',
            !note.title && 'text-muted-foreground',
          )}
        >
          {note.title || t('common.untitled')}
        </p>
        {note.excerpt ? (
          <p className="mt-1.5 line-clamp-7 text-[13px] leading-[22px] text-muted-foreground [overflow-wrap:anywhere]">
            {note.excerpt}
          </p>
        ) : null}
      </button>
    </NoteMenu>
  )
}

/** List view: a row with the title, two lines of the text, the date and a thumbnail. */
function NoteRowView({ note, inFolder, date = 'edited' }: ItemProps) {
  const { t, i18n } = useTranslation()
  const marks = useMarks(note, inFolder)
  const press = useNotePress(note)

  return (
    <NoteMenu note={note}>
      <button
        type="button"
        {...press.props}
        className={cn('flex w-full gap-4 px-4 py-3 text-left hover:bg-accent', itemClass)}
      >
        {press.selecting ? <SelectMark selected={press.selected} className="self-center" /> : null}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate font-medium leading-[22px]',
              !note.title && 'text-muted-foreground',
            )}
          >
            {note.title || t('common.untitled')}
          </span>
          {note.excerpt ? (
            <span className="mt-0.5 line-clamp-2 text-[13px] leading-[22px] text-muted-foreground [overflow-wrap:anywhere]">
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
function NoteLineView({ note, inFolder, date = 'edited' }: ItemProps) {
  const { t, i18n } = useTranslation()
  const marks = useMarks(note, inFolder)
  const press = useNotePress(note)
  const Icon = note.type === 'daily' ? CalendarDays : FileText

  return (
    <NoteMenu note={note}>
      <button
        type="button"
        {...press.props}
        className={cn(
          'flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm hover:bg-accent',
          itemClass,
        )}
      >
        {press.selecting ? (
          <SelectMark selected={press.selected} />
        ) : (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        )}
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

/**
 * The notes layout's middle column: a compact card with the title, two lines of the text (or the
 * search match), the date, marks and a small thumbnail. `active`: the note open beside it.
 */
function NoteSnippetView({
  note,
  inFolder,
  date = 'edited',
  active = false,
  excerpt,
}: ItemProps & { active?: boolean; excerpt?: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  const marks = useMarks(note, inFolder)
  const press = useNotePress(note)
  const text = excerpt ?? note.excerpt

  return (
    <NoteMenu note={note}>
      <button
        type="button"
        {...press.props}
        aria-current={active ? 'page' : undefined}
        data-active={active ? 'true' : undefined}
        className={cn(
          'relative flex w-full gap-3 rounded-lg px-4 py-3 text-left transition-colors data-[selected]:bg-brand/10',
          !active && 'hover:bg-accent/70',
          !SLIDING_INDICATOR && 'aria-[current=page]:bg-accent',
          itemClass,
        )}
      >
        {press.selecting ? <SelectMark selected={press.selected} className="mt-0.5" /> : null}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-medium',
              !note.title && 'text-muted-foreground',
            )}
          >
            {note.title || t('common.untitled')}
          </span>
          {text ? (
            <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
              {text}
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
        {note.cover ? <Thumb src={note.cover} small /> : null}
      </button>
    </NoteMenu>
  )
}

// Card hooks use refs for pointer gestures, which can make the compiler skip these functions.
// Explicit boundaries keep a selection change from rendering every other loaded note.
export const NoteCard = memo(NoteCardView)
export const NoteRow = memo(NoteRowView)
export const NoteLine = memo(NoteLineView)
export const NoteSnippet = memo(NoteSnippetView)
