import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from './env'

/** Set while an account is signed in on this device (`requireSession`). */
let sessionRequired = false

/**
 * While signed in, every request must carry the account's token. supabase-js sends the anon key
 * instead when it has no token at hand (a token refresh failed on a bad connection, or the session
 * ended): RLS then answers such a request with no rows, which sync would take for "nothing shared
 * with you any more" and remove shared notes. Such a request fails as a network error instead,
 * so sync reports offline and tries again.
 */
export function requireSession(on: boolean) {
  sessionRequired = on
}

/** The REST, Storage and Edge Function paths that answer with the caller's rows. */
const DATA_PATHS = ['/rest/v1/', '/storage/v1/', '/functions/v1/']

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

/** `base` with the rule of `requireSession`: no data request without the account's token. */
export function guardFetch(base: typeof fetch, anonKey: string): typeof fetch {
  return (input, init) => {
    if (sessionRequired) {
      const url = urlOf(input)
      const auth =
        new Headers(init?.headers).get('Authorization') ??
        (input instanceof Request ? input.headers.get('Authorization') : null)
      if (DATA_PATHS.some((p) => url.includes(p)) && (!auth || auth === `Bearer ${anonKey}`))
        return Promise.reject(new TypeError('Failed to fetch: no session token'))
    }
    return base(input, init)
  }
}

/**
 * Null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. The app is local-first and must
 * work without it; every caller handles the null case.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl as string, env.supabaseAnonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: guardFetch((...args) => fetch(...args), env.supabaseAnonKey as string) },
    })
  : null
