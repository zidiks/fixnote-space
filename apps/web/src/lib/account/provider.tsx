import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { notifyNotesChanged } from '../assistant/assistant'
import { useDb } from '../db'
import { env } from '../env'
import { platform } from '../platform'
import { supabase } from '../supabase'
import { initAccount } from './account'
import type { AccountBackend } from './backend'
import { supabaseBackend } from './backend'

async function pickBackend(): Promise<AccountBackend | null> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('dev-backend')) {
    return (await import('./dev-backend')).devBackend
  }
  return supabase
    ? supabaseBackend(supabase, {
        url: env.supabaseUrl as string,
        anonKey: env.supabaseAnonKey as string,
      })
    : null
}

/** Starts the account (session, keys, sync) once the local database is open. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { driver, attachments } = useDb()
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
        onRemoteChange: () => {
          void qc.invalidateQueries()
          notifyNotesChanged()
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [driver, attachments, qc])

  return <>{children}</>
}
