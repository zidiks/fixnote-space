import {
  CONSENT_MAX_READS,
  CONSENT_TTL_MS,
  type ConsentResult,
  parseConsentResult,
} from '@fixnote/core/remote-mcp'
import type { AuthEnv } from './auth'

/**
 * The connect handoff (docs/remote-mcp.md, "Connecting"): the Fixnote app answers Supabase's OAuth
 * consent and leaves the redirect back to the AI app here; the connect page in the browser picks it
 * up once. One tiny Durable Object per authorization id (`ConsentHandoff`) holds only that redirect
 * and whether it was allowed, for at most `CONSENT_TTL_MS`, and forgets it on the first read.
 * Nothing else is stored: no account, no client, no device.
 *
 * Security: `POST /api/consent/<id>` verifies the authorization with Supabase Auth using the
 * caller's validated session token and requires `redirect`'s origin and pathname to strictly match
 * the registered OAuth `redirect_uri`, preventing open-redirect planting.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Supabase OAuth authorization ids are UUIDs. */
export const isConsentId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id)

/** Checks the authorization with Supabase Auth and returns its registered redirect URI. */
export type ConsentVerifier = (authorizationId: string) => Promise<{ redirectUri: string } | null>

/** Executes approve/deny against Supabase Auth and returns Supabase's own `redirect_url`. */
export type ConsentDecider = (
  authorizationId: string,
  action: 'approve' | 'deny',
) => Promise<string | null>

/** Fetches raw OAuth authorization details from Supabase Auth for the caller. */
export type ConsentInspector = (authorizationId: string) => Promise<Record<string, unknown> | null>

export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

/** Queries Supabase Auth's OAuth authorization endpoint with the caller's validated session token. */
export function supabaseConsentVerifier(
  env: Pick<AuthEnv, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>,
  token: string,
  fetchFn: typeof fetch,
): ConsentVerifier {
  const base = env.SUPABASE_URL.replace(/\/+$/, '')
  return async (authorizationId: string) => {
    const res = await fetchFn(
      `${base}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_ANON_KEY,
        },
      },
    )
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as {
      redirect_uri?: unknown
      redirect_url?: unknown
    } | null
    const uri =
      typeof data?.redirect_uri === 'string' && data.redirect_uri
        ? data.redirect_uri
        : typeof data?.redirect_url === 'string' && data.redirect_url
          ? data.redirect_url
          : null
    return uri ? { redirectUri: uri } : null
  }
}

/** Calls Supabase Auth `GET /auth/v1/oauth/authorizations/:id` on behalf of the caller. */
export function supabaseConsentInspector(
  env: Pick<AuthEnv, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>,
  token: string,
  fetchFn: typeof fetch,
): ConsentInspector {
  const base = env.SUPABASE_URL.replace(/\/+$/, '')
  return async (authorizationId: string) => {
    const res = await fetchFn(
      `${base}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_ANON_KEY,
        },
      },
    )
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return data && typeof data === 'object' ? data : null
  }
}

/** Calls Supabase Auth `POST /auth/v1/oauth/authorizations/:id/consent` and returns Supabase's redirect_url. */
export function supabaseConsentDecider(
  env: Pick<AuthEnv, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>,
  token: string,
  fetchFn: typeof fetch,
): ConsentDecider {
  const base = env.SUPABASE_URL.replace(/\/+$/, '')
  return async (authorizationId: string, action: 'approve' | 'deny') => {
    const res = await fetchFn(
      `${base}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      },
    )
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { redirect_url?: unknown } | null
    const uri = typeof data?.redirect_url === 'string' ? data.redirect_url : null
    return uri && isSafeHttpUrl(uri) ? uri : null
  }
}

/** Requires `redirect` to be a credential-free http(s) URL matching `expectedUri`'s origin & pathname. */
export function redirectMatches(redirect: string, expectedUri: string): boolean {
  try {
    const actual = new URL(redirect)
    const expected = new URL(expectedUri)
    if (actual.protocol !== 'https:' && actual.protocol !== 'http:') return false
    if (actual.username || actual.password) return false
    return (
      actual.protocol === expected.protocol &&
      actual.origin === expected.origin &&
      actual.pathname === expected.pathname
    )
  } catch {
    return false
  }
}

interface Stored {
  result: ConsentResult
  at: number
}

export interface StagedRedirect {
  userId: string
  redirect: string
  at: number
}

/** Where a handoff keeps its one value (the Durable Object's storage; a Map in tests). */
export interface ConsentStorage {
  get(): Promise<Stored | undefined>
  put(value: Stored): Promise<void>
  clear(): Promise<void>
  getStaged?(): Promise<StagedRedirect | undefined>
  putStaged?(value: StagedRedirect): Promise<void>
  clearStaged?(): Promise<void>
}

export type TakeResult = ConsentResult | null | 'limit'

/** One handoff: the first answer wins, it is read once, and it expires. */
export class ConsentBox {
  private reads = 0
  private stagedMem: StagedRedirect | undefined
  constructor(
    private readonly store: ConsentStorage,
    private readonly now: () => number,
  ) {}

  /** Stages a Supabase-issued pre-consented redirect_url privately until the user confirms. */
  async stage(userId: string, redirect: string): Promise<void> {
    const entry: StagedRedirect = { userId, redirect, at: this.now() }
    if (this.store.putStaged) await this.store.putStaged(entry)
    else this.stagedMem = entry
  }

  /** Consumes a staged redirect_url only if it belongs to `userId` and has not expired. */
  async consumeStaged(userId: string): Promise<string | null> {
    const entry = this.store.getStaged ? await this.store.getStaged() : this.stagedMem
    if (!entry) return null
    if (this.now() - entry.at >= CONSENT_TTL_MS) {
      if (this.store.clearStaged) await this.store.clearStaged()
      else this.stagedMem = undefined
      return null
    }
    if (entry.userId !== userId) return null
    if (this.store.clearStaged) await this.store.clearStaged()
    else this.stagedMem = undefined
    return entry.redirect
  }

  /** The app's answer; 'exists' when one is already waiting (the first answer wins). */
  async put(result: ConsentResult): Promise<'ok' | 'exists'> {
    const old = await this.store.get()
    if (old && this.now() - old.at < CONSENT_TTL_MS) return 'exists'
    await this.store.put({ result, at: this.now() })
    return 'ok'
  }

  /** The page asks: the answer once (then it is gone), null while there is none. */
  async take(): Promise<TakeResult> {
    this.reads += 1
    if (this.reads > CONSENT_MAX_READS) return 'limit'
    const v = await this.store.get()
    if (!v) return null
    await this.store.clear()
    return this.now() - v.at < CONSENT_TTL_MS ? v.result : null
  }
}

/** What the Worker calls on a handoff's Durable Object. */
export interface ConsentStub {
  put(result: ConsentResult): Promise<'ok' | 'exists'>
  take(): Promise<TakeResult>
  stage?(userId: string, redirect: string): Promise<void>
  consumeStaged?(userId: string): Promise<string | null>
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

/** GET /consent/<id> (no auth: the id is the handle): `waiting`, or the answer once. */
export async function consentPoll(stub: ConsentStub, cors: Record<string, string>) {
  const r = await stub.take()
  if (r === 'limit') return json({ error: 'too_many_requests' }, 429, cors)
  if (!r) return json({ status: 'waiting' }, 200, cors)
  return json({ status: 'done', approved: r.approved, redirect: r.redirect }, 200, cors)
}

/**
 * GET /api/consent/<id> (the app's own session): fetches OAuth authorization details from Supabase
 * Auth, staging any auto-approved `redirect_url` privately so the client never supplies redirects.
 */
export async function consentInspect(
  stub: ConsentStub,
  cors: Record<string, string>,
  verify: { authorizationId: string; userId: string; inspect: ConsentInspector },
): Promise<Response> {
  if (!isConsentId(verify.authorizationId)) {
    return json({ error: 'bad_request' }, 400, cors)
  }
  const data = await verify.inspect(verify.authorizationId).catch(() => null)
  if (!data) return json({ error: 'not_found' }, 404, cors)
  if (
    !('authorization_id' in data) &&
    typeof data.redirect_url === 'string' &&
    isSafeHttpUrl(data.redirect_url) &&
    stub.stage
  ) {
    await stub.stage(verify.userId, data.redirect_url)
  }
  return json(data, 200, cors)
}

function parseAction(body: unknown): 'approve' | 'deny' | null {
  if (!body || typeof body !== 'object') return null
  const action = (body as { action?: unknown }).action
  return action === 'approve' || action === 'deny' ? action : null
}

/** POST /api/consent/<id> (the app's own session): executes consent at Supabase or verifies redirect. */
export async function consentPost(
  req: Request,
  stub: ConsentStub,
  cors: Record<string, string>,
  verify: {
    authorizationId: string
    userId?: string
    check: ConsentVerifier
    decide?: ConsentDecider
  },
): Promise<Response> {
  if (!isConsentId(verify.authorizationId)) {
    return json({ error: 'bad_request' }, 400, cors)
  }
  const body = await req.json().catch(() => null)
  const action = parseAction(body)
  if (action) {
    const approved = action === 'approve'
    let redirect: string | null = null
    const staged =
      verify.userId && stub.consumeStaged ? await stub.consumeStaged(verify.userId) : null
    if (staged !== null) {
      redirect = approved ? staged : null
    } else {
      if (!verify.decide) return json({ error: 'forbidden' }, 403, cors)
      const url = await verify.decide(verify.authorizationId, action).catch(() => null)
      if (!url || !isSafeHttpUrl(url)) return json({ error: 'forbidden' }, 403, cors)
      redirect = url
    }
    if ((await stub.put({ approved, redirect })) === 'exists') {
      return json({ error: 'exists' }, 409, cors)
    }
    return new Response(null, { status: 204, headers: cors })
  }

  const result = parseConsentResult(body)
  if (!result) return json({ error: 'bad_request' }, 400, cors)
  const details = await verify.check(verify.authorizationId).catch(() => null)
  if (!details) return json({ error: 'forbidden' }, 403, cors)
  if (result.redirect !== null && !redirectMatches(result.redirect, details.redirectUri)) {
    return json({ error: 'forbidden' }, 403, cors)
  }
  if ((await stub.put(result)) === 'exists') return json({ error: 'exists' }, 409, cors)
  return new Response(null, { status: 204, headers: cors })
}
