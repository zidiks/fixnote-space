/** Where the extension talks to: our edge function, the web app and the site (build-time). */

declare const __FUNCTIONS_URL__: string
declare const __SITE_URL__: string
declare const __APP_URL__: string

export const FUNCTIONS_URL: string =
  typeof __FUNCTIONS_URL__ === 'string'
    ? __FUNCTIONS_URL__
    : 'https://nsteehqbmljuczxgkvae.supabase.co/functions/v1/capture-extension'

export const SITE_URL: string =
  typeof __SITE_URL__ === 'string' ? __SITE_URL__ : 'https://fixnote.space'

/** The web app, where "Connect" asks to confirm (VITE_WEB_URL; a local `pnpm dev` for testing). */
export const APP_URL: string =
  typeof __APP_URL__ === 'string' ? __APP_URL__ : 'https://app.fixnote.space'

/** The social sites' Save buttons, kept on the site so a changed layout is fixed without a release. */
export const SITES_URL = `${SITE_URL}/extension/sites.json`
