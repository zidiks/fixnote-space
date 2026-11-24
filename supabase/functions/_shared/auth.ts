/** Helpers shared by the edge functions. */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const jsonError = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ error: { message, ...extra } }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** Constant-time comparison of UTF-8 strings (does not short-circuit on length mismatch). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  const len = Math.max(x.length, y.length)
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** Masks an email for confirmation prompts (e.g. `alice@example.com` → `al***@example.com`). */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return ''
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!domain) return ''
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)
  return `${shown}***@${domain}`
}

interface JwtHeader {
  alg?: unknown
  kid?: unknown
}

interface Claims {
  sub?: unknown
  role?: unknown
  email?: unknown
  exp?: unknown
  nbf?: unknown
  iss?: unknown
  /** Set on tokens Supabase Auth's OAuth server gave an AI app (remote MCP): never ours to serve. */
  client_id?: unknown
}

export interface VerifiedUser {
  id: string
  email: string | null
}

/** Verifies the caller's JWT and returns the signed-in Fixnote user (null for invalid/OAuth tokens). */
export type AuthVerifier = (req: Request, now?: number) => Promise<VerifiedUser | null>

function decodeBase64Url(part: string): Uint8Array<ArrayBuffer> | null {
  if (!part || !/^[A-Za-z0-9_-]+$/.test(part)) return null
  try {
    const padded =
      part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const bin = atob(padded)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function decodeJson<T>(part: string): T | null {
  const bytes = decodeBase64Url(part)
  if (!bytes) return null
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as T)
      : null
  } catch {
    return null
  }
}

function bearerToken(req: Request): string | null {
  const raw = req.headers.get('authorization')
  if (!raw) return null
  const match = raw.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? null
}

function claims(req: Request, now = Date.now()): Claims | null {
  const token = bearerToken(req)
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const payload = decodeJson<Claims>(parts[1] ?? '')
  if (!payload) return null
  if (
    payload.exp !== undefined &&
    (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp * 1000 <= now)
  ) {
    return null
  }
  if (
    payload.nbf !== undefined &&
    (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf * 1000 > now)
  ) {
    return null
  }
  return payload
}

/** Email from a JWT's payload after expiry/role checks (use `AuthVerifier` in production). */
export function userEmail(req: Request, now = Date.now()): string | null {
  const c = claims(req, now)
  return c?.role === 'authenticated' && !c.client_id && typeof c.email === 'string' && c.email
    ? c.email
    : null
}

/** Subject from a JWT's payload after expiry/role checks (use `AuthVerifier` in production). */
export function userId(req: Request, now = Date.now()): string | null {
  const c = claims(req, now)
  return c?.role === 'authenticated' && !c.client_id && typeof c.sub === 'string' && c.sub
    ? c.sub
    : null
}

/**
 * Unverified JWT claim parser for pure unit tests ONLY. Production entrypoints MUST use
 * `denoJwtVerifier()` / `createJwtVerifier()`.
 */
export const unsafeUnverifiedClaimsAuth: AuthVerifier = async (req, now = Date.now()) => {
  const c = claims(req, now)
  if (c?.role !== 'authenticated' || c.client_id || typeof c.sub !== 'string' || !c.sub) {
    return null
  }
  return { id: c.sub, email: typeof c.email === 'string' && c.email ? c.email : null }
}

type AsymmetricAlg = 'ES256' | 'ES384' | 'RS256' | 'RS384' | 'RS512'

const ASYMMETRIC_ALGS: Record<
  AsymmetricAlg,
  {
    kty: string
    importAlg: EcKeyImportParams | RsaHashedImportParams
    verifyAlg: AlgorithmIdentifier | EcdsaParams
  }
> = {
  ES256: {
    kty: 'EC',
    importAlg: { name: 'ECDSA', namedCurve: 'P-256' },
    verifyAlg: { name: 'ECDSA', hash: 'SHA-256' },
  },
  ES384: {
    kty: 'EC',
    importAlg: { name: 'ECDSA', namedCurve: 'P-384' },
    verifyAlg: { name: 'ECDSA', hash: 'SHA-384' },
  },
  RS256: {
    kty: 'RSA',
    importAlg: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    verifyAlg: { name: 'RSASSA-PKCS1-v1_5' },
  },
  RS384: {
    kty: 'RSA',
    importAlg: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
    verifyAlg: { name: 'RSASSA-PKCS1-v1_5' },
  },
  RS512: {
    kty: 'RSA',
    importAlg: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    verifyAlg: { name: 'RSASSA-PKCS1-v1_5' },
  },
}

interface JwkEntry extends JsonWebKey {
  kid?: string
  alg?: string
}

export interface JwtVerifierOptions {
  supabaseUrl: string
  /** Used as `apikey` when verifying legacy HS256 tokens via `/auth/v1/user`. */
  apiKey?: string
  /** Optional symmetric JWT secret for local/test HS256 verification. */
  jwtSecret?: string
  fetch?: typeof fetch
  jwksTtlMs?: number
}

const JWKS_REFRESH_MIN_MS = 30_000

/**
 * Cryptographic JWT verifier for Supabase Auth tokens:
 * - Verifies ES256/ES384/RS256/RS384/RS512 signatures against `${supabaseUrl}/auth/v1/.well-known/jwks.json`
 *   with in-memory JWKS caching and key-rotation refresh.
 * - Verifies legacy HS256 tokens via HMAC-SHA256 (when `jwtSecret` is set) or `/auth/v1/user`.
 * - Always enforces `iss`, `exp`, `nbf`, `role === 'authenticated'`, and `!client_id`.
 * - Fails closed on missing config, unknown algorithms (`none`, etc.), or verification errors.
 */
export function createJwtVerifier(opts: JwtVerifierOptions): AuthVerifier {
  const baseUrl = opts.supabaseUrl.replace(/\/+$/, '')
  const fetcher = opts.fetch ?? fetch
  const ttlMs = opts.jwksTtlMs ?? 5 * 60_000
  const expectedIss = baseUrl ? `${baseUrl}/auth/v1` : ''

  let cachedKeys: JwkEntry[] = []
  let cachedAt = 0
  const importedKeys = new Map<string, CryptoKey>()

  async function loadJwks(now: number, force = false): Promise<JwkEntry[]> {
    if (!force && cachedKeys.length > 0 && now - cachedAt < ttlMs) return cachedKeys
    if (force && cachedAt > 0 && now - cachedAt < JWKS_REFRESH_MIN_MS) return cachedKeys
    const res = await fetcher(`${baseUrl}/auth/v1/.well-known/jwks.json`)
    if (!res.ok) return cachedKeys
    const body = (await res.json().catch(() => null)) as { keys?: unknown } | null
    if (!Array.isArray(body?.keys)) return cachedKeys
    cachedKeys = body.keys.filter(
      (k): k is JwkEntry => typeof k === 'object' && k !== null && !Array.isArray(k),
    )
    cachedAt = now
    importedKeys.clear()
    return cachedKeys
  }

  async function verifyAsymmetric(
    alg: AsymmetricAlg,
    kid: string | undefined,
    signingInput: Uint8Array<ArrayBuffer>,
    signature: Uint8Array<ArrayBuffer>,
    now: number,
  ): Promise<boolean> {
    const spec = ASYMMETRIC_ALGS[alg]
    const match = (keys: JwkEntry[]) =>
      keys.find(
        (k) => k.kty === spec.kty && (!k.alg || k.alg === alg) && (kid ? k.kid === kid : true),
      )
    let keys = await loadJwks(now, false)
    let jwk = match(keys)
    if (!jwk && kid) {
      keys = await loadJwks(now, true)
      jwk = match(keys)
    }
    if (!jwk) return false
    const cacheKey = `${alg}:${jwk.kid ?? JSON.stringify(jwk)}`
    let key = importedKeys.get(cacheKey)
    if (!key) {
      key = await crypto.subtle.importKey('jwk', jwk, spec.importAlg, false, ['verify'])
      importedKeys.set(cacheKey, key)
    }
    return crypto.subtle.verify(spec.verifyAlg, key, signature, signingInput)
  }

  async function verifyHs256(
    token: string,
    sub: string,
    signingInput: Uint8Array<ArrayBuffer>,
    signature: Uint8Array<ArrayBuffer>,
  ): Promise<boolean> {
    if (opts.jwtSecret) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(opts.jwtSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      return crypto.subtle.verify('HMAC', key, signature, signingInput)
    }
    if (!opts.apiKey) return false
    const res = await fetcher(`${baseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: opts.apiKey },
    })
    if (!res.ok) return false
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null
    return body?.id === sub
  }

  return async (req: Request, now = Date.now()): Promise<VerifiedUser | null> => {
    if (!baseUrl) return null
    const token = bearerToken(req)
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headPart, payloadPart, sigPart] = parts
    if (!headPart || !payloadPart || !sigPart) return null

    const header = decodeJson<JwtHeader>(headPart)
    const payload = decodeJson<Claims>(payloadPart)
    const sigBytes = decodeBase64Url(sigPart)
    if (!header || !payload || !sigBytes) return null

    if (payload.role !== 'authenticated' || payload.client_id) return null
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    if (
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      payload.exp * 1000 <= now
    ) {
      return null
    }
    if (
      payload.nbf !== undefined &&
      (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf * 1000 > now)
    ) {
      return null
    }
    if (payload.iss !== expectedIss) return null

    const alg = typeof header.alg === 'string' ? header.alg : ''
    const kid = typeof header.kid === 'string' && header.kid ? header.kid : undefined
    const signingInput = new TextEncoder().encode(`${headPart}.${payloadPart}`)

    try {
      let valid = false
      if (alg in ASYMMETRIC_ALGS) {
        valid = await verifyAsymmetric(alg as AsymmetricAlg, kid, signingInput, sigBytes, now)
      } else if (alg === 'HS256') {
        valid = await verifyHs256(token, payload.sub, signingInput, sigBytes)
      }
      if (!valid) return null
    } catch {
      return null
    }

    return {
      id: payload.sub,
      email: typeof payload.email === 'string' && payload.email ? payload.email : null,
    }
  }
}

let cachedDenoVerifier: AuthVerifier | null = null

/** Production JWT verifier configured from Deno environment variables (singleton per isolate). */
export function denoJwtVerifier(): AuthVerifier {
  if (!cachedDenoVerifier) {
    cachedDenoVerifier = createJwtVerifier({
      supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
      apiKey: Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      jwtSecret: Deno.env.get('SUPABASE_JWT_SECRET') ?? undefined,
    })
  }
  return cachedDenoVerifier
}

/** Best effort, per isolate: enough to stop a runaway loop from one account. */
export function rateLimiter() {
  const recent = new Map<string, number[]>()
  return (user: string, perMinute: number, now: number): boolean => {
    const list = (recent.get(user) ?? []).filter((t) => now - t < 60_000)
    if (list.length >= perMinute) {
      recent.set(user, list)
      return false
    }
    list.push(now)
    recent.set(user, list)
    return true
  }
}
