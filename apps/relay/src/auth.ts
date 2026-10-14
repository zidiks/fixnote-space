/**
 * Who is calling the relay. Both kinds of caller carry a Supabase access token:
 * - an AI app (`client`): a token from Supabase Auth's OAuth 2.1 server, which has `client_id`;
 * - a FixNote device (`device`): the app's own session, which must not have `client_id`, so a token
 *   handed to an AI app can never pose as a device.
 * Supabase checks the signature and that the session still exists (`/auth/v1/user`), so a revoked
 * grant or a signed-out session stops working; the answer is kept for a minute per token.
 */

export interface AuthEnv {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  /** https://mcp.fixnote.space */
  PUBLIC_URL: string
}

export type Caller =
  | { ok: true; userId: string; clientId: string | null; issuedAt: number; pro: boolean }
  | { ok: false; status: 401; reason: string }

interface Claims {
  sub?: unknown
  iss?: unknown
  aud?: unknown
  exp?: unknown
  iat?: unknown
  role?: unknown
  client_id?: unknown
}

export function decodeJwt(token: string): Claims | null {
  const part = token.split('.')[1]
  if (!part || token.split('.').length !== 3) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)),
    )
    const v: unknown = JSON.parse(json)
    return typeof v === 'object' && v !== null ? (v as Claims) : null
  } catch {
    return null
  }
}

export const resourceUrl = (env: AuthEnv) => `${env.PUBLIC_URL}/mcp`
export const metadataUrl = (env: AuthEnv) =>
  `${env.PUBLIC_URL}/.well-known/oauth-protected-resource`
export const issuer = (env: AuthEnv) => `${env.SUPABASE_URL}/auth/v1`

/** The `WWW-Authenticate` value of a 401 from the MCP endpoint (RFC 9728 + RFC 6750). */
export function challenge(env: AuthEnv, error?: string): string {
  const parts = [`Bearer resource_metadata="${metadataUrl(env)}"`]
  if (error) parts.push(`error="invalid_token"`, `error_description="${error.replace(/"/g, "'")}"`)
  return parts.join(', ')
}

/** RFC 9728 protected resource metadata: Supabase Auth is the authorization server. */
export function resourceMetadata(env: AuthEnv) {
  return {
    resource: resourceUrl(env),
    authorization_servers: [issuer(env)],
    bearer_methods_supported: ['header'],
    resource_name: 'FixNote',
    resource_documentation: 'https://fixnote.space/privacy/',
  }
}

export interface Verified {
  userId: string
  pro: boolean
  until: number
}

/** Verified tokens of this isolate, by SHA-256 of the token. */
export class TokenCache {
  private readonly map = new Map<string, Verified>()
  constructor(private readonly max = 1000) {}
  get(key: string, now: number): Verified | null {
    const v = this.map.get(key)
    if (!v) return null
    if (v.until <= now) {
      this.map.delete(key)
      return null
    }
    return v
  }
  set(key: string, v: Verified) {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, v)
  }
}

const CACHE_MS = 60_000

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Checks a bearer token for the relay; `kind` says who may use it. */
export async function checkToken(
  token: string,
  kind: 'client' | 'device',
  env: AuthEnv,
  deps: { fetch: typeof fetch; now: () => number; cache: TokenCache },
): Promise<Caller> {
  const deny = (reason: string): Caller => ({ ok: false, status: 401, reason })
  const c = decodeJwt(token)
  if (!c || typeof c.sub !== 'string') return deny('Malformed token')
  if (typeof c.exp !== 'number' || c.exp * 1000 <= deps.now()) return deny('The token expired')
  if (c.iss !== issuer(env)) return deny('Wrong issuer')
  if (c.role !== 'authenticated') return deny('Not a user token')
  const auds = Array.isArray(c.aud) ? c.aud : [c.aud]
  if (!auds.some((a) => a === 'authenticated' || a === resourceUrl(env))) {
    return deny('Wrong audience')
  }
  const clientId = typeof c.client_id === 'string' && c.client_id ? c.client_id : null
  if (kind === 'client' && !clientId) return deny('Connect through OAuth')
  if (kind === 'device' && clientId) return deny('Not a FixNote session')
  const issuedAt = typeof c.iat === 'number' ? c.iat : 0

  const key = await sha256(token)
  const cached = deps.cache.get(key, deps.now())
  if (cached) {
    if (cached.userId !== c.sub) return deny('Token mismatch')
    return { ok: true, userId: cached.userId, clientId, issuedAt, pro: cached.pro }
  }
  const headers = { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY }
  const user = await deps.fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers })
  if (!user.ok) return deny('The session ended')
  const body = (await user.json().catch(() => null)) as { id?: unknown } | null
  if (body?.id !== c.sub) return deny('Token mismatch')
  const plan = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/rpc/remote_mcp_allowed`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  })
  // Unknown plan (server trouble): refuse rather than let it through, and do not cache.
  if (!plan.ok) return { ok: true, userId: c.sub, clientId, issuedAt, pro: false }
  const pro = (await plan.json().catch(() => false)) === true
  deps.cache.set(key, {
    userId: c.sub,
    pro,
    until: Math.min(deps.now() + CACHE_MS, c.exp * 1000),
  })
  return { ok: true, userId: c.sub, clientId, issuedAt, pro }
}
