/**
 * Connecting an AI app (ChatGPT, claude.ai…) to FixNote: Supabase Auth's OAuth server sends the
 * browser to the connect page (`/oauth/consent?authorization_id=…`), which can hand the question
 * to the FixNote app with `fixnote://connect?authorization_id=…`. The app asks, answers Supabase
 * with its own session and leaves the redirect at the relay (`POST /api/consent/<id>`); the page
 * picks it up (`GET /consent/<id>`) and goes back to the AI app. Shared by the relay, the page and
 * the app, so nothing here imports anything. See docs/remote-mcp.md.
 */

/** How long the relay keeps an answer for the page to pick up. */
export const CONSENT_TTL_MS = 2 * 60_000
/** How often the connect page asks the relay. */
export const CONSENT_POLL_MS = 1500
/** The page stops asking after this long (the authorization itself expires soon after). */
export const CONSENT_POLL_FOR_MS = 3 * 60_000
/** Reads one handoff answers before refusing (≈ 3 min of polling with room to spare). */
export const CONSENT_MAX_READS = 200

/** Supabase authorization ids are UUIDs; anything printable and short is accepted, nothing else. */
const ID = /^[A-Za-z0-9_-]{8,128}$/

export const isAuthorizationId = (id: unknown): id is string =>
  typeof id === 'string' && ID.test(id)

/** The link the connect page opens to ask the FixNote app. */
export const connectLink = (authorizationId: string) =>
  `fixnote://connect?authorization_id=${encodeURIComponent(authorizationId)}`

/**
 * `fixnote://connect?authorization_id=…` → the id; null for any other link. Any page can open such
 * a link, so the app only ever asks with it, never acts on it by itself.
 */
export function parseConnectLink(url: string): string | null {
  const m = /^fixnote:\/\/connect\/?\?(.*)$/i.exec(url.trim())
  if (!m) return null
  const id = new URLSearchParams((m[1] ?? '').split('#')[0]).get('authorization_id')
  return isAuthorizationId(id) ? id : null
}

/**
 * What the app leaves at the relay: where the page should send the browser (Supabase's redirect
 * back to the AI app, with a code or `error=access_denied`), and whether it was allowed. The
 * redirect may be null when the person declined something Supabase had already approved.
 */
export interface ConsentResult {
  approved: boolean
  redirect: string | null
}

/** Only http(s) URLs: the page navigates to it. */
export function isRedirectUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 4096) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export function parseConsentResult(value: unknown): ConsentResult | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as { approved?: unknown; redirect?: unknown }
  if (typeof v.approved !== 'boolean') return null
  if (v.redirect === null || v.redirect === undefined) {
    return v.approved ? null : { approved: false, redirect: null }
  }
  return isRedirectUrl(v.redirect) ? { approved: v.approved, redirect: v.redirect } : null
}

/** The host a redirect goes back to, shown before allowing (a look-alike name is not enough). */
export function redirectHost(uri: string): string {
  try {
    return new URL(uri).host
  } catch {
    return uri
  }
}
