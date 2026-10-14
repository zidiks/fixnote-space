import { i18n } from '@fixnote/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { toast } from 'sonner'
import { useUi } from '../../app/store'
import { notifyNotesChanged } from '../assistant/assistant'
import { appendToToday, captureToDaily } from '../daily'
import { useDb } from '../db'
import { currentListRoute } from '../layout'
import { platform } from '../platform'
import { initAccount, onSharedSync } from './account'
import { pickBackend } from './pick'

/** Starts the account (session, keys, sync) once the local database is open. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { driver, attachments, repo } = useDb()
  const qc = useQueryClient()

  // Someone's shared folder went away while it was open here (removed, or no longer shared).
  useEffect(
    () =>
      onSharedSync(({ removedFolders }) => {
        // The folder on screen, or (notes layout) listed beside the open note.
        const list = currentListRoute()
        if (list?.kind !== 'folder' || !removedFolders.includes(list.id)) return
        const { navigate } = useUi.getState()
        navigate({ kind: 'home' }, { replace: true })
        toast(i18n.t('people.lostFolder'))
      }),
    [],
  )
  useEffect(() => {
    let cancelled = false
    void pickBackend().then((backend) => {
      if (cancelled) return
      void initAccount({
        backend,
        db: driver,
        blobs: platform.blobs,
        keyStore: platform.keyStore,
        attachments,
        repo,
        saveCaptured: async (content, receivedAt) => {
          if (await captureToDaily(driver, 'telegram')) await appendToToday(repo, content)
          else await repo.createNote({ content, createdAt: receivedAt })
        },
        transcribe: async (audio) =>
          (
            await (
              await platform.transcriber()
            ).transcribe(audio, {
              prefer: i18n.language.slice(0, 2),
            })
          ).text,
        onCaptured: (count) => toast(i18n.t('capture.imported', { count })),
        onRemoteChange: () => {
          void qc.invalidateQueries()
          notifyNotesChanged()
        },
        onConflicts: (count) =>
          toast(i18n.t('sync.conflictsFound', { count }), {
            duration: 15_000,
            action: {
              label: i18n.t('sync.review'),
              onClick: () =>
                void repo.conflicts().then(([first]) => {
                  if (first) useUi.getState().navigate({ kind: 'note', id: first.noteId })
                }),
            },
          }),
      })
    })
    return () => {
      cancelled = true
    }
  }, [driver, attachments, repo, qc])

  return <>{children}</>
}
