import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from './env'

/**
 * Null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. The app is local-first and must
 * work without it; every caller handles the null case.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl as string, env.supabaseAnonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null
