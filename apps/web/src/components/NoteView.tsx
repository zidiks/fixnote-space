import { folderTree, type Note, ReadOnlyError } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronRight,
  Folder,
  FolderInput,
  FolderPlus,
  Inbox,
  Link2,
  Mic,
  Pin,
  PinOff,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { useAccount } from '../lib/account/account'
import { useLlm } from '../lib/assistant/llm'
import { suggestForNewNote } from '../lib/assistant/tidy'
import { useDb, useRepo } from '../lib/db'
import { registerDropSink } from '../lib/drop'
import {
  keys,
  useDeleteWithUndo,
  useFolderMutations,
  useFolders,
  useInvalidateNotes,
  useMoveNote,
  useNote,
  useSetPinned,
} from '../lib/queries'
import { formatRelative } from '../lib/time'
import { registerVoiceSink, toggleVoice, useVoice } from '../lib/voice/voice'
import { ConflictBanner } from './ConflictBanner'
import { DailyBar } from './DailyBar'
import { NoteEditor, type NoteEditorHandle, type SaveState } from './editor/NoteEditor'
import { LiveBar, useSharedLive } from './LiveBar'
import { NewFolderDialog } from './NewFolderDialog'
import { ShareDialog } from './ShareDialog'
import { VOICE_KEYS } from './VoiceBar'

export function NoteView({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const repo = useRepo()
  const { tidy, audit } = useDb()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const navigate = useUi((s) => s.navigate)
  const note = useNote(id, { fresh: true })
  const folders = useFolders().data ?? []
  const move = useMoveNote()
  const { create: createFolder } = useFolderMutations()
  const [newFolder, setNewFolder] = useState(false)
  const deleteWithUndo = useDeleteWithUndo()
  const setPinned = useSetPinned()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const editor = useRef<NoteEditorHandle>(null)
  const voice = useVoice((s) => s.status)
  const aiRequest = useUi((s) => s.aiRequest)
  const [sharing, setSharing] = useState(false)
  // A shared note is always edited live with the people it is shared with.
  const shared = useSharedLive(note.data?.sharedId ?? null, () => {
    toast(t('people.lost'))
    navigate({ kind: 'home' })
  })
  // Links live on the server: not in a build without one, and never in local-only mode.
  const hasServer = useAccount((s) => s.phase !== 'disabled')
  const localOnly = useLlm((s) => s.localOnly)
  const canShare = hasServer && !localOnly

  // While this note is open, dictation goes into it.
  useEffect(() => registerVoiceSink('note', (text) => editor.current?.insertText(text)), [])
  // Anything dropped onto the window goes into this note.
  useEffect(
    () =>
      registerDropSink({ insert: (markdown, at) => editor.current?.insertDropped(markdown, at) }),
    [],
  )

  // "Tidy up" asked for from elsewhere (a toast after dictation).
  useEffect(() => {
    if (aiRequest?.noteId !== id || !note.isFetchedAfterMount) return
    useUi.getState().requestAi(null)
    // Let the editor mount first when the note has just been opened.
    const timer = setTimeout(() => editor.current?.openAi('note', aiRequest.action), 50)
    return () => clearTimeout(timer)
  }, [aiRequest, id, note.isFetchedAfterMount])

  if (!note.isFetchedAfterMount) return null
  if (!note.data) {
    return <p className="p-10 text-center text-sm text-muted-foreground">{t('note.notFound')}</p>
  }
  const n = note.data
  const folder = folders.find((f) => f.id === n.folderId)

  // Shared notes: leaving or unsharing is handled there too.
  const onDelete = () => void deleteWithUndo(n.id)
  const pinned = n.pinnedAt !== null

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-32 sm:px-10">
      <header className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-[13px] text-muted-foreground">
        {/* The path shrinks (the title truncates) before the actions wrap to a new line. */}
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-2">
          <button
            type="button"
            className="flex max-w-[40%] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground"
            onClick={() =>
              navigate(
                folder ? { kind: 'folder', id: folder.id } : { kind: 'home', filter: 'inbox' },
              )
            }
          >
            {folder ? (
              <Folder className="size-3.5 shrink-0" />
            ) : (
              <Inbox className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{folder?.name ?? t('common.noFolder')}</span>
          </button>
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          <span className="min-w-0 truncate text-foreground">
            {n.title || t('common.untitled')}
          </span>
        </div>

        {/* Status and actions: one group, which wraps below the path in a narrow window. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="shrink-0 tabular-nums" aria-live="polite">
            {saveState === 'saving'
              ? t('note.saving')
              : t('note.edited', { time: formatRelative(n.updatedAt, i18n.resolvedLanguage) })}
          </span>

          {/* View only: nothing that would change the note. */}
          {n.readOnly ? null : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void toggleVoice('note')}
                    aria-label={t('voice.dictate')}
                    aria-pressed={voice === 'recording'}
                    className={cn(voice === 'recording' && 'text-destructive')}
                  >
                    <Mic />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('voice.dictateHint', { keys: VOICE_KEYS })}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => editor.current?.openAi('note')}
                    aria-label={t('ai.title')}
                  >
                    <Sparkles />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('ai.title')}</TooltipContent>
              </Tooltip>
            </>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setPinned.mutate({ id: n.id, pinned: !pinned })}
                aria-label={pinned ? t('pin.unpin') : t('pin.pin')}
                aria-pressed={pinned}
                className={cn(pinned && 'text-brand')}
              >
                {pinned ? <PinOff /> : <Pin />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{pinned ? t('pin.unpin') : t('pin.pin')}</TooltipContent>
          </Tooltip>

          {n.readOnly ? null : (
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
                <DropdownMenuItem
                  // After the menu has closed, so the dialog gets focus.
                  onSelect={() => setTimeout(() => setNewFolder(true), 0)}
                >
                  <FolderPlus />
                  {t('menu.moveToNewFolder')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => move.mutate({ id: n.id, folderId: null })}>
                  <Inbox />
                  <span className="flex-1">{t('common.noFolder')}</span>
                  <Check className={cn(n.folderId !== null && 'invisible')} />
                </DropdownMenuItem>
                {folderTree(folders.filter((f) => f.shared !== 'view')).map(
                  ({ folder: f, depth }) => (
                    <DropdownMenuItem
                      key={f.id}
                      onSelect={() => move.mutate({ id: n.id, folderId: f.id })}
                      style={{ paddingInlineStart: `${0.5 + depth}rem` }}
                    >
                      <Folder />
                      <span className="flex-1">{f.name}</span>
                      <Check className={cn(n.folderId !== f.id && 'invisible')} />
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canShare ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSharing(true)}
                  aria-label={t('share.button')}
                >
                  <Link2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('share.button')}</TooltipContent>
            </Tooltip>
          ) : null}

          {n.readOnly ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void onDelete()}
                  aria-label={t('note.delete')}
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('note.delete')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>
      {canShare ? <ShareDialog note={n} open={sharing} onOpenChange={setSharing} /> : null}
      <NewFolderDialog
        open={newFolder}
        onOpenChange={setNewFolder}
        onCreate={async (name) => {
          const folder = await createFolder.mutateAsync({ name })
          move.mutate({ id: n.id, folderId: folder.id })
        }}
      />

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

      {n.type === 'daily' && n.dailyDate ? <DailyBar note={n} /> : null}
      <ConflictBanner note={n} />
      {shared.live ? <LiveBar live={shared.live} /> : null}

      <div className="mt-6">
        {n.sharedId && !shared.live && !shared.failed ? (
          <p className="text-sm text-muted-foreground">{t('people.connecting')}</p>
        ) : (
          <NoteEditor
            // Opening a shared note's live document builds the editor anew (its content source changes).
            key={`${n.id}:${shared.live ? 'live' : 'solo'}`}
            ref={editor}
            note={n}
            live={shared.live ?? undefined}
            onStateChange={setSaveState}
            onRepeat={async (task, rule) => {
              // The days after this one that exist already follow the new rule too.
              const changed = await repo.applyRecurrence(n.dailyDate as string, task, rule)
              for (const c of changed) qc.setQueryData(keys.note(c.id), c)
              if (changed.length) void invalidate()
            }}
            onSave={async (markdown, base) => {
              // View only: what shows here are the others' edits; sync writes them to the note.
              if (n.readOnly) return n
              let saved: Note
              try {
                saved = await repo.updateContent(n.id, markdown, { base })
              } catch (err) {
                // Made view only while open (the last save of the editor being closed).
                if (err instanceof ReadOnlyError) return n
                throw err
              }
              // A shared note: its document goes to the others (the Markdown is this device's copy).
              await shared.live?.persist(saved.content)
              qc.setQueryData(keys.note(n.id), saved)
              void invalidate()
              return saved
            }}
            onLeave={(markdown) => {
              // A shared note belongs to its people: never thrown away or tidied from here.
              if (n.sharedId) return
              // A note left blank is not worth keeping: nothing to remember, nothing to tidy later.
              if (n.type === 'text' && !markdown.trim()) {
                void repo.deleteNote(n.id).then(invalidate)
                return
              }
              // A fresh note without a folder: offer a folder, tags and a title for it.
              const fresh = Date.now() - n.createdAt < 2 * 3600_000
              if (
                n.type === 'text' &&
                fresh &&
                n.folderId === null &&
                markdown.trim().length >= 80
              ) {
                void suggestForNewNote(n, {
                  tidy,
                  audit,
                  refresh: async () => {
                    await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['tidy'] })])
                  },
                  review: () => useUi.getState().navigate({ kind: 'tidy' }),
                })
              }
            }}
          />
        )}
      </div>
    </div>
  )
}
