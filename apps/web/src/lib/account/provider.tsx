import { i18n } from '@fixnote/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { toast } from 'sonner'
import { notifyNotesChanged } from '../assistant/assistant'
import { useDb } from '../db'
import { platform } from '../platform'
import { initAccount } from './account'
import { pickBackend } from './pick'

/** Starts the account (session, keys, sync) once the local database is open. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { driver, attachments, repo } = useDb()
  const qc = useQueryClient()

  useEffect(() => {
    let cancelled = false
    void pickBackend().then((backend) => {
      if (cancelled) return
      void initAccount({
        backend,
        db: driver,
        keyStore: platform.keyStore,
        attachments,
        repo,
        transcribe: async (audio) => (await (await platform.transcriber()).transcribe(audio)).text,
        onCaptured: (count) => toast(i18n.t('capture.imported', { count })),
        onRemoteChange: () => {
          void qc.invalidateQueries()
          notifyNotesChanged()
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [driver, attachments, repo, qc])

  return <>{children}</>
}
