import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { useAccount } from '../account/account'
import { useDb } from '../db'
import { kvStore } from '../kv'
import { platform } from '../platform'
import { initAssistant } from './assistant'
import { initLlm, useLlm } from './llm'
import { acceptWithUndo, maybeRunScheduled, refreshTidyCount } from './tidy'

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { driver, tidy, audit } = useDb()
  const qc = useQueryClient()
  const signedIn = useAccount((s) => s.phase === 'ready')
  const ownModel = useLlm((s) => s.settings.kind !== 'fixnote')

  useEffect(() => {
    void initLlm(kvStore(driver))
    void initAssistant({ db: driver, embedder: () => platform.embedder() })
    void refreshTidyCount(tidy)
  }, [driver, tidy])

  // Tidy looks for suggestions every few days, once the model is reachable.
  useEffect(() => {
    if (!signedIn && !ownModel) return
    const timer = setTimeout(async () => {
      await maybeRunScheduled(tidy, kvStore(driver))
      // Auto mode: what the background run found is applied, with Undo in a toast.
      if (useLlm.getState().mode !== 'auto') return
      const found = await tidy.pending()
      if (!found.length) return
      await acceptWithUndo(found, {
        tidy,
        audit,
        refresh: async () => {
          await qc.invalidateQueries()
        },
      })
    }, 20_000)
    return () => clearTimeout(timer)
  }, [signedIn, ownModel, tidy, driver, audit, qc])

  return <>{children}</>
}
