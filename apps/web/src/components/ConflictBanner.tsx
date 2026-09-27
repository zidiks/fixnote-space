import {
  type ConflictChoice,
  conflictCopyBody,
  diffLines,
  type Note,
  type SyncConflict,
} from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GitCompareArrows } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { useRepo } from '../lib/db'
import { useInvalidateNotes } from '../lib/queries'
import { DiffView } from './editor/AiEdit'

/**
 * Shown on a note (or on its conflict copy) when sync kept two versions of it: the note was changed
 * in the same place on two devices. Compare opens both side by side as a word diff.
 */
export function ConflictBanner({ note }: { note: Note }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const [open, setOpen] = useState(false)
  const conflict = useQuery({
    queryKey: ['conflicts', note.id],
    queryFn: async () => (await repo.conflicts(note.id))[0] ?? null,
  }).data
  if (!conflict) return null
  const isCopy = conflict.copyId === note.id

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
      <GitCompareArrows className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">{isCopy ? t('sync.bannerCopy') : t('sync.banner')}</span>
      <Button size="sm" variant="brand" onClick={() => setOpen(true)}>
        {t('sync.review')}
      </Button>
      {open ? <CompareDialog conflict={conflict} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

function CompareDialog({ conflict, onClose }: { conflict: SyncConflict; onClose: () => void }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const [busy, setBusy] = useState(false)
  const notes = useQuery({
    queryKey: ['conflict-notes', conflict.copyId],
    queryFn: async () => ({
      note: await repo.getNote(conflict.noteId),
      copy: await repo.getNote(conflict.copyId),
    }),
    staleTime: 0,
  }).data

  const settle = async (choice: ConflictChoice) => {
    setBusy(true)
    try {
      await repo.settleConflict(conflict.copyId, choice)
      await qc.invalidateQueries({ queryKey: ['conflicts'] })
      await invalidate()
      // The copy is gone (unless both are kept): show the note itself.
      const ui = useUi.getState()
      if (choice !== 'both' && ui.route.kind === 'note' && ui.route.id === conflict.copyId)
        ui.navigate({ kind: 'note', id: conflict.noteId })
      toast(t('sync.settled'))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const body = (n: Note | null | undefined) => n?.content ?? ''
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col p-6">
        <DialogTitle className="font-semibold">{t('sync.compareTitle')}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {t('sync.compareBody')}
        </DialogDescription>
        <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
          {notes ? (
            <DiffView
              className="max-h-[55vh]"
              parts={diffLines(body(notes.note), conflictCopyBody(body(notes.copy)))}
            />
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void settle('both')}>
            {t('sync.keepBoth')}
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void settle('note')}>
            {t('sync.keepNote')}
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void settle('copy')}>
            {t('sync.keepCopy')}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void settle('combined')}>
            {t('sync.combine')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
