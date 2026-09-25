import { type ReactNode, useEffect } from 'react'
import { useAccount } from '../account/account'
import { useDb } from '../db'
import { kvStore } from '../kv'
import { platform } from '../platform'
import { initAssistant } from './assistant'
import { initLlm, useLlm } from './llm'
import { maybeRunScheduled, refreshTidyCount } from './tidy'

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { driver, tidy } = useDb()
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
    const timer = setTimeout(() => void maybeRunScheduled(tidy, kvStore(driver)), 20_000)
    return () => clearTimeout(timer)
  }, [signedIn, ownModel, tidy, driver])

  return <>{children}</>
}
