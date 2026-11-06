/** Public, build-time configuration. See .env.example at the repo root. */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  /** Telegram capture bot username, without @. */
  telegramBot: (import.meta.env.VITE_TELEGRAM_BOT as string | undefined) || undefined,
  /** The Discord capture app's id (functions/discord-bot); no Discord card without it. */
  discordAppId: (import.meta.env.VITE_DISCORD_APP_ID as string | undefined) || undefined,
  /** The browser extension's store page, for "Install"; none until it is published. */
  extensionUrl: (import.meta.env.VITE_EXTENSION_URL as string | undefined) || undefined,
  /** Where the web app is hosted; shared links open there. The desktop app needs it. */
  webUrl: (import.meta.env.VITE_WEB_URL as string | undefined) || undefined,
  /** The remote MCP relay (apps/relay, docs/remote-mcp.md). */
  mcpUrl: (import.meta.env.VITE_MCP_URL as string | undefined) || 'https://mcp.fixnote.space',
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
