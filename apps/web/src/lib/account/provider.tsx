import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { useDb } from '../db'
import { platform } from '../platform'
import { supabase } from '../supabase'
import { initAccount } from './account'
import type { AccountBackend } from './backend'
import { supabaseBackend } from './backend'

async function pickBackend(): Promise<AccountBackend | null> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('dev-backend')) {
    return (await import('./dev-backend')).devBackend
  }
  return supabase ? supabaseBackend(supabase) : null
}

/** Starts the account (session, keys, sync) once the local database is open. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { driver } = useDb()
  const qc = useQueryClient()

  useEffect(() => {
    let cancelled = false
    void pickBackend().then((backend) => {
      if (cancelled) return
      void initAccount({
        backend,
        db: driver,
        keyStore: platform.keyStore,
        onRemoteChange: () => void qc.invalidateQueries(),
      })
    })
    return () => {
      cancelled = true
    }
  }, [driver, qc])

  return <>{children}</>
}
