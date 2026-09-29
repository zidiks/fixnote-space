/** Public, build-time configuration. See .env.example at the repo root. */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  /** Telegram capture bot username, without @. */
  telegramBot: (import.meta.env.VITE_TELEGRAM_BOT as string | undefined) || undefined,
  /** Where the web app is hosted; shared links open there. The desktop app needs it. */
  webUrl: (import.meta.env.VITE_WEB_URL as string | undefined) || undefined,
  /** FixNote's voice server (services/voice): speech to text and the assistant's voice, on Pro. */
  voiceUrl: (import.meta.env.VITE_VOICE_URL as string | undefined)?.replace(/\/$/, '') || undefined,
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
