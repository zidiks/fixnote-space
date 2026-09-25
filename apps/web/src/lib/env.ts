/** Public, build-time configuration. See .env.example at the repo root. */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
