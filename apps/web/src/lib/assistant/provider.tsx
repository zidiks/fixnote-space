import { type ReactNode, useEffect } from 'react'
import { useDb } from '../db'
import { platform } from '../platform'
import { initAssistant } from './assistant'

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { driver } = useDb()
  useEffect(() => {
    void initAssistant({ db: driver, embedder: () => platform.embedder() })
  }, [driver])
  return <>{children}</>
}
