import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Folder, FolderInput, Inbox, Sparkles, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useUi } from '../app/store'
import { useRepo } from '../lib/db'
import {
  keys,
  useDeleteWithUndo,
  useFolders,
  useInvalidateNotes,
  useMoveNote,
  useNote,
} from '../lib/queries'
import { formatRelative } from '../lib/time'
import type { AiEditHandle } from './editor/AiEdit'
import { NoteEditor, type SaveState } from './editor/NoteEditor'

export function NoteView({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const navigate = useUi((s) => s.navigate)
  const note = useNote(id, { fresh: true })
  const folders = useFolders().data ?? []
  const move = useMoveNote()
  const deleteWithUndo = useDeleteWithUndo()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const ai = useRef<AiEditHandle>(null)

  if (!note.isFetchedAfterMount) return null
  if (!note.data) {
    return <p className="p-10 text-center text-sm text-muted-foreground">{t('note.notFound')}</p>
  }
  const n = note.data
  const folder = folders.find((f) => f.id === n.folderId)

  const onDelete = () => void deleteWithUndo(n.id)

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-32 sm:px-10">
      <header className="flex h-10 items-center gap-2 text-[13px] text-muted-foreground">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground"
          onClick={() => navigate(folder ? { kind: 'folder', id: folder.id } : { kind: 'inbox' })}
        >
          {folder ? <Folder className="size-3.5" /> : <Inbox className="size-3.5" />}
          {folder?.name ?? t('sidebar.inbox')}
        </button>
        <ChevronRight className="size-3.5 opacity-50" />
        <span className="truncate text-foreground">{n.title || t('common.untitled')}</span>

        <span className="ml-auto shrink-0 tabular-nums" aria-live="polite">
          {saveState === 'saving'
            ? t('note.saving')
            : t('note.edited', { time: formatRelative(n.updatedAt, i18n.resolvedLanguage) })}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => ai.current?.open('note')}
              aria-label={t('ai.title')}
            >
              <Sparkles />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('ai.title')}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={t('note.moveTo')}>
                  <FolderInput />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('note.moveTo')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>{t('note.moveTo')}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => move.mutate({ id: n.id, folderId: null })}>
              <Inbox />
              <span className="flex-1">{t('sidebar.inbox')}</span>
              <Check className={cn(n.folderId !== null && 'invisible')} />
            </DropdownMenuItem>
            {folders.map((f) => (
              <DropdownMenuItem
                key={f.id}
                onSelect={() => move.mutate({ id: n.id, folderId: f.id })}
              >
                <Folder />
                <span className="flex-1">{f.name}</span>
                <Check className={cn(n.folderId !== f.id && 'invisible')} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label={t('note.delete')}>
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('note.delete')}</TooltipContent>
        </Tooltip>
      </header>

      {n.tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {n.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => navigate({ kind: 'tag', name: tag })}
              className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brand hover:bg-brand/15"
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        <NoteEditor
          key={n.id}
          ref={ai}
          note={n}
          onStateChange={setSaveState}
          onSave={async (markdown, base) => {
            const saved = await repo.updateContent(n.id, markdown, { base })
            qc.setQueryData(keys.note(n.id), saved)
            void invalidate()
            return saved
          }}
          onLeave={(markdown) => {
            // A note left blank is not worth keeping: nothing to remember, nothing to tidy later.
            if (n.type === 'text' && !markdown.trim()) {
              void repo.deleteNote(n.id).then(invalidate)
            }
          }}
        />
      </div>
    </div>
  )
}
