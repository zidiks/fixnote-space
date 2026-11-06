/**
 * capture-extension: the browser extension's channel (apps/extension).
 *
 * The extension seals every page in the browser (crypto_box_seal to the account's public key), so
 * this function never sees what is saved; it only checks who sends it and queues it in
 * inbox_items like the Telegram bot does.
 *
 * Connecting works like connecting an AI app: the extension asks, the app confirms
 * (`*_extension_requests.sql`).
 * - `POST /request {label}`: a pending request. The answer has its `id` (the extension opens the
 *   app with it), a `secret` only the extension keeps (stored as SHA-256) and a short `code` the
 *   person compares with the one the app shows.
 * - `POST /poll {id, secret}`: `pending`, `denied`, or once approved in the app this browser's token
 *   (only its SHA-256 is stored, capture_links channel 'extension') with the public key.
 * - `POST /key` (`x-fixnote-token`): the public key again, and whether the account is Pro.
 * - `POST /save {sealed}` (`x-fixnote-token`): queue one sealed page.
 * - `POST /unpair` (`x-fixnote-token`): forget this browser.
 *
 * Disconnecting in the app deletes the link row, and the token stops working at once.
 */

export interface ExtensionRequest {
  secretHash: string
  label: string
  status: 'pending' | 'approved' | 'denied'
  userId: string | null
  expired: boolean
}

export interface ExtensionStore {
  createRequest(row: { secretHash: string; label: string; code: string }): Promise<string>
  request(id: string): Promise<ExtensionRequest | null>
  deleteRequest(id: string): Promise<void>
  link(tokenHash: string, userId: string, label: string): Promise<void>
  unlink(tokenHash: string): Promise<void>
  userFor(tokenHash: string): Promise<string | null>
  publicKey(userId: string): Promise<string | null>
  isPro(userId: string): Promise<boolean>
  addItem(userId: string, sealed: string): Promise<void>
}

export interface ExtensionDeps {
  store: ExtensionStore
  /** 32 random bytes, base64url. */
  newToken?: () => string
  newCode?: () => string
  now?: () => number
}

/** One page with its text, sealed and base64url: well under the inbox row limit. */
const MAX_SEALED = 1_500_000
const SAVES_PER_MINUTE = 30
const REQUESTS_PER_MINUTE = 10

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-fixnote-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
const fail = (status: number, error: string) => json(status, { error })

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Four letters and digits that cannot be confused when read (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randomCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join('')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const recent = new Map<string, number[]>()
function allowed(key: string, limit: number, now: number): boolean {
  const list = (recent.get(key) ?? []).filter((t) => now - t < 60_000)
  if (list.length >= limit) {
    recent.set(key, list)
    return false
  }
  list.push(now)
  recent.set(key, list)
  return true
}

export async function handle(req: Request, deps: ExtensionDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'method')
  const action = new URL(req.url).pathname.split('/').filter(Boolean).at(-1)
  const now = (deps.now ?? Date.now)()
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    // Some actions have no body.
  }

  if (action === 'request') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!allowed(`request:${ip}`, REQUESTS_PER_MINUTE, now)) return fail(429, 'too-many')
    const secret = (deps.newToken ?? randomToken)()
    const code = (deps.newCode ?? randomCode)()
    const label = typeof body.label === 'string' ? body.label.slice(0, 128) : ''
    const id = await deps.store.createRequest({ secretHash: await sha256Hex(secret), label, code })
    return json(200, { id, secret, code })
  }

  if (action === 'poll') {
    const id = typeof body.id === 'string' ? body.id : ''
    const secret = typeof body.secret === 'string' ? body.secret : ''
    if (!UUID.test(id) || secret.length < 20) return fail(400, 'bad-request')
    const r = await deps.store.request(id)
    if (!r || r.secretHash !== (await sha256Hex(secret))) return fail(404, 'gone')
    if (r.status === 'denied') {
      await deps.store.deleteRequest(id)
      return json(200, { status: 'denied' })
    }
    if (r.status === 'pending') {
      if (!r.expired) return json(200, { status: 'pending' })
      await deps.store.deleteRequest(id)
      return fail(404, 'gone')
    }
    // Approved: the token is made now, for the holder of the secret, and the request goes.
    const user = r.userId
    if (!user) return fail(404, 'gone')
    await deps.store.deleteRequest(id)
    const publicKey = await deps.store.publicKey(user)
    if (!publicKey) return fail(409, 'no-keys')
    const token = (deps.newToken ?? randomToken)()
    await deps.store.link(await sha256Hex(token), user, r.label)
    return json(200, {
      status: 'approved',
      token,
      publicKey,
      pro: await deps.store.isPro(user),
      label: r.label,
    })
  }

  const token = req.headers.get('x-fixnote-token') ?? ''
  if (token.length < 20) return fail(401, 'not-paired')
  const hash = await sha256Hex(token)
  const user = await deps.store.userFor(hash)
  if (!user) return fail(401, 'not-paired')

  if (action === 'unpair') {
    await deps.store.unlink(hash)
    return json(200, { ok: true })
  }
  if (action === 'key') {
    const publicKey = await deps.store.publicKey(user)
    if (!publicKey) return fail(409, 'no-keys')
    return json(200, { publicKey, pro: await deps.store.isPro(user) })
  }
  if (action === 'save') {
    const sealed = typeof body.sealed === 'string' ? body.sealed : ''
    if (!sealed || sealed.length > MAX_SEALED || !/^[A-Za-z0-9_-]+$/.test(sealed))
      return fail(400, 'bad-item')
    if (!allowed(`save:${user}`, SAVES_PER_MINUTE, now)) return fail(429, 'too-many')
    if (!(await deps.store.isPro(user))) return fail(402, 'needs-pro')
    await deps.store.addItem(user, sealed)
    return json(200, { ok: true })
  }
  return fail(404, 'unknown')
}
