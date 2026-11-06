import type { Note } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { ConfirmDialog } from '@fixnote/ui'
import { useState } from 'react'
import { useRepo } from '../lib/db'
import { useDeleteKey, useDeleteKeyHandler } from '../lib/delete-key'
import { useDeleteWithUndo } from '../lib/queries'

/**
 * The Delete key (`lib/delete-key.ts`) and its question for a single note: Enter deletes, with
 * Undo as from the note's menu. Folders ask in `SidebarFolders`, picked notes in `SelectionBar`.
 */
export function DeleteKey() {
  const { t } = useTranslation()
  const repo = useRepo()
  const deleteWithUndo = useDeleteWithUndo()
  const [note, setNote] = useState<Note | null>(null)

  useDeleteKey()
  useDeleteKeyHandler('note', (id) => {
    void repo.getNote(id).then((n) => {
      if (n && !n.readOnly) setNote(n)
    })
  })

  return (
    <ConfirmDialog
      open={note !== null}
      onOpenChange={(open) => !open && setNote(null)}
      title={t('note.deleteTitle', { title: note?.title || t('common.untitled') })}
      description={t('note.deleteBody')}
      confirmLabel={t('common.delete')}
      cancelLabel={t('common.cancel')}
      destructive
      focusConfirm
      onConfirm={() => {
        const id = note?.id
        setNote(null)
        if (id) void deleteWithUndo(id)
      }}
    />
  )
}
