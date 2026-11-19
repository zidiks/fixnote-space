/**
 * Site analytics, on fixnote.space only (never in the app). The privacy policy (section `cookies`)
 * describes exactly these: change it with this file.
 *
 * Cloudflare Web Analytics sets no cookies and identifies nobody, so it loads for every visitor,
 * without the banner. The value is the site's beacon token (Cloudflare dashboard → Analytics &
 * Logs → Web Analytics); null loads nothing. The daily metrics report reads its numbers, and counts
 * downloads from the requests to /download/* (functions/metrics-digest).
 *
 * Google Analytics 4 sets cookies, so it loads only after the visitor accepts the banner
 * (Base.astro, `consent` in i18n); the choice is kept in localStorage `fixnote.consent` and changed
 * with "Cookies" in the footer. With GA4_ID null there is no banner. Events sent by the click
 * handler in Base.astro: `download` (platform: windows, mac-arm, mac-intel) for /download/* links
 * and `open_app` for links to the web app.
 */
export const CLOUDFLARE_BEACON: string | null = '484ff12e866c4d4b83a289e17d55290d'
export const GA4_ID: string | null = 'G-D3V577XS4T'

/** Analytics that need consent: the banner shows only then. */
export const ANALYTICS = GA4_ID !== null
