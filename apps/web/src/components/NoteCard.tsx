import type { NoteSummary } from '@fixnote/core'
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
  SquareArrowOutUpRight,
  Trash2,
} from 'lucide-react'
import { useUi } from '../app/store'
import { useDeleteWithUndo, useFolders, useMoveNote } from '../lib/queries'
import { formatCardDate } from '../lib/time'

export function NoteCard({ note }: { note: NoteSummary }) {
  const { t, i18n } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const folders = useFolders().data ?? []
  const move = useMoveNote()
  const deleteWithUndo = useDeleteWithUndo()
  const Icon = note.type === 'daily' ? CalendarDays : FileText
  const open = () => navigate({ kind: 'note', id: note.id })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={open}
          className="group flex h-full max-h-60 min-h-32 w-full flex-col overflow-hidden rounded-xl border bg-card p-4 text-left shadow-xs transition-shadow outline-none hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:ring-2 data-[state=open]:ring-ring/40"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5" />
            <span>{formatCardDate(note.updatedAt, i18n.resolvedLanguage)}</span>
            {note.tasks ? (
              <span className="ml-auto flex items-center gap-1 tabular-nums">
                <CheckSquare className="size-3.5" />
                {note.tasks.done}/{note.tasks.total}
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              'mt-2 line-clamp-2 font-medium leading-snug',
              !note.title && 'text-muted-foreground',
            )}
          >
            {note.title || t('common.untitled')}
          </p>
          {note.excerpt ? (
            <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed text-muted-foreground">
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
            {folders.map((f) => (
              <ContextMenuItem
                key={f.id}
                onSelect={() => move.mutate({ id: note.id, folderId: f.id })}
              >
                <Folder />
                <span className="flex-1">{f.name}</span>
                <Check className={cn(note.folderId !== f.id && 'invisible')} />
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onSelect={() => void deleteWithUndo(note.id)}>
          <Trash2 />
          {t('note.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
