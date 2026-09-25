import { env } from '../env'
import { supabase } from '../supabase'
import { type AccountBackend, supabaseBackend } from './backend'

/** `?dev-backend` in `pnpm dev`: the fake server in localStorage (code 123456). */
export const usesDevBackend = () =>
  import.meta.env.DEV && new URLSearchParams(location.search).has('dev-backend')

/** The configured server, or null in a build without Supabase settings. */
export async function pickBackend(): Promise<AccountBackend | null> {
  if (usesDevBackend()) return (await import('./dev-backend')).devBackend
  return supabase
    ? supabaseBackend(supabase, {
        url: env.supabaseUrl as string,
        anonKey: env.supabaseAnonKey as string,
      })
    : null
}
