// Vite turns `?url` imports into the final URL of the emitted asset.
declare module '*?url' {
  const url: string
  export default url
}

// Build-time values that Vite substitutes (see apps/web/vite.config.ts `envPrefix`).
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly TAURI_ENV_PLATFORM?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
