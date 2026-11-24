import {
  RELAY_AUTH_PREFIX,
  RELAY_CLOSE,
  RELAY_PROTOCOL,
  remoteToolList,
} from '@fixnote/core/remote-mcp'
import { type AuthEnv, challenge, checkToken, issuer, resourceMetadata, TokenCache } from './auth'
import {
  consentInspect,
  consentPoll,
  consentPost,
  isConsentId,
  supabaseConsentDecider,
  supabaseConsentInspector,
  supabaseConsentVerifier,
} from './consent'
import type { HandoffEnv } from './handoff'
import { answerBody, MAX_MCP_BODY_BYTES, readLimitedText, SERVER_VERSION } from './mcp'
import type { RelayEnv } from './relay'

export { DemoDevice } from './demo'
export { ConsentHandoff } from './handoff'
export { UserRelay } from './relay'

export interface Env extends AuthEnv, RelayEnv, HandoffEnv {
  /** Origins of the Fixnote app allowed to call /api (comma-separated). */
  APP_ORIGINS: string
  /** User ids of the accounts AI-app reviewers use (comma-separated): they get a demo device. */
  DEMO_ACCOUNTS?: string
  /**
   * The domain token the OpenAI plugin dashboard shows ("Connect MCP server"), served as is at
   * /.well-known/openai-apps-challenge. Not secret; set with `wrangler secret put` or a var.
   */
  OPENAI_APPS_CHALLENGE?: string
}

const isDemo = (env: Env, userId: string) =>
  (env.DEMO_ACCOUNTS ?? '')
    .split(',')
    .map((id) => id.trim())
    .includes(userId)

const cache = new TokenCache()

const PRO_MESSAGE =
  'Remote access to Fixnote needs Fixnote Pro: it goes through our server. Open Fixnote → Settings → Plan.'

/** MCP clients in a browser (inspectors) send bearer tokens themselves, so any origin may call. */
const MCP_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id',
  'Access-Control-Expose-Headers': 'www-authenticate, mcp-session-id',
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })

const bearer = (req: Request) =>
  req.headers
    .get('Authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim() ?? null

const deps = () => ({
  fetch: (...a: Parameters<typeof fetch>) => fetch(...a),
  now: Date.now,
  cache,
})

function appCors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = env.APP_ORIGINS.split(',').map((o) => o.trim())
  return allowed.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        Vary: 'Origin',
      }
    : {}
}

const stub = (env: Env, userId: string) => env.RELAY.get(env.RELAY.idFromName(userId))
const handoff = (env: Env, authorizationId: string) =>
  env.CONSENT.get(env.CONSENT.idFromName(authorizationId))

/** POST /mcp: MCP Streamable HTTP, answered with JSON (no server-sent events, no session). */
async function mcp(req: Request, env: Env): Promise<Response> {
  const unauthorized = (error?: string) =>
    json(
      { error: 'invalid_token', error_description: error ?? 'Sign in to Fixnote' },
      { status: 401, headers: { ...MCP_CORS, 'WWW-Authenticate': challenge(env, error) } },
    )
  if (req.method !== 'POST') {
    return new Response(null, { status: 405, headers: { ...MCP_CORS, Allow: 'POST' } })
  }
  const token = bearer(req)
  if (!token) return unauthorized()
  const caller = await checkToken(token, 'client', env, deps())
  if (!caller.ok) return unauthorized(caller.reason)
  const clientId = caller.clientId as string
  const relay = stub(env, caller.userId)
  if (await relay.revokedSince(clientId, caller.issuedAt)) {
    return unauthorized('Access was revoked in Fixnote')
  }
  if (!(await relay.allowRequest())) {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests' } },
      { status: 429, headers: { ...MCP_CORS, 'Retry-After': '60' } },
    )
  }
  const raw = await readLimitedText(req, MAX_MCP_BODY_BYTES)
  if (raw === null) {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } },
      { status: 413, headers: MCP_CORS },
    )
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400, headers: MCP_CORS },
    )
  }
  const out = await answerBody(body, {
    hello: (name) => relay.hello(clientId, name),
    call: async (tool, args) =>
      caller.pro
        ? relay.call(clientId, tool, args, isDemo(env, caller.userId) ? caller.userId : null)
        : { content: [{ type: 'text', text: PRO_MESSAGE }], isError: true },
  })
  if (!out) return new Response(null, { status: 202, headers: MCP_CORS })
  return json(out, { headers: MCP_CORS })
}

/** GET /device: a Fixnote device opens its WebSocket (session token as a subprotocol). */
async function device(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected a WebSocket', { status: 426 })
  }
  const offered = (req.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((p) => p.trim())
  const token = offered
    .find((p) => p.startsWith(RELAY_AUTH_PREFIX))
    ?.slice(RELAY_AUTH_PREFIX.length)
  if (!offered.includes(RELAY_PROTOCOL) || !token) {
    return new Response('Unknown protocol', { status: 400 })
  }
  const caller = await checkToken(token, 'device', env, deps())
  if (!caller.ok || !caller.pro) {
    // Accept, then close with a code the app understands (a refused upgrade is just "1006").
    const { 0: client, 1: server } = new WebSocketPair()
    server.accept()
    server.close(caller.ok ? RELAY_CLOSE.proRequired : RELAY_CLOSE.unauthorized, 'refused')
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': RELAY_PROTOCOL },
    })
  }
  const url = new URL(req.url)
  url.searchParams.set('exp', String(caller.expiresAt))
  return stub(env, caller.userId).fetch(new Request(url, req))
}

/** /api/…: the app's settings (its own session, never an AI app's token). */
async function api(req: Request, env: Env, path: string): Promise<Response> {
  const cors = appCors(req, env)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const token = bearer(req)
  const caller = token ? await checkToken(token, 'device', env, deps()) : null
  if (!caller?.ok || !token) return json({ error: 'unauthorized' }, { status: 401, headers: cors })
  const consent = path.match(/^\/api\/consent\/([^/]+)$/)
  if (consent?.[1] && req.method === 'GET') {
    const id = consent[1]
    if (!isConsentId(id)) return json({ error: 'bad_request' }, { status: 400, headers: cors })
    return consentInspect(handoff(env, id), cors, {
      authorizationId: id,
      userId: caller.userId,
      inspect: supabaseConsentInspector(env, token, deps().fetch),
    })
  }
  if (consent?.[1] && req.method === 'POST') {
    const id = consent[1]
    if (!isConsentId(id)) return json({ error: 'bad_request' }, { status: 400, headers: cors })
    return consentPost(req, handoff(env, id), cors, {
      authorizationId: id,
      userId: caller.userId,
      check: supabaseConsentVerifier(env, token, deps().fetch),
      decide: supabaseConsentDecider(env, token, deps().fetch),
    })
  }
  const relay = stub(env, caller.userId)
  if (path === '/api/clients' && req.method === 'GET') {
    return json(await relay.overview(), { headers: cors })
  }
  const revoke = path.match(/^\/api\/clients\/([^/]+)$/)
  if (revoke?.[1] && req.method === 'DELETE') {
    await relay.revoke(decodeURIComponent(revoke[1]))
    return new Response(null, { status: 204, headers: cors })
  }
  return json({ error: 'not_found' }, { status: 404, headers: cors })
}

/**
 * GET /consent/<authorization id>: the connect page waits for the app's answer (see consent.ts).
 * No auth: the id is the handle. The page asks every 1.5 s for at most 3 minutes.
 */
async function consentGet(req: Request, env: Env, path: string): Promise<Response> {
  const cors = appCors(req, env)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const id = path.slice('/consent/'.length)
  if (req.method !== 'GET' || !isConsentId(id)) {
    return json({ error: 'bad_request' }, { status: 400, headers: cors })
  }
  return consentPoll(handoff(env, id), cors)
}

/** Older MCP clients look for the authorization server on the MCP origin: hand them Supabase's. */
async function authorizationServer(env: Env): Promise<Response> {
  const url = `${env.SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`
  const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } })
  if (!res.ok) return json({ error: 'unavailable', issuer: issuer(env) }, { status: 502 })
  return json(await res.json(), {
    headers: { ...MCP_CORS, 'Cache-Control': 'public, max-age=3600' },
  })
}

const ICONS = new Set(['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'])

/** One of the site's icons, fetched from fixnote.space (cached by Cloudflare for a day). */
async function siteIcon(pathname: string): Promise<Response> {
  const res = await fetch(`https://fixnote.space${pathname}`, { cf: { cacheTtl: 86400 } })
  if (!res.ok) return new Response('Not found', { status: 404 })
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (pathname.startsWith('/api/')) return api(req, env, pathname)
    if (pathname.startsWith('/consent/')) return consentGet(req, env, pathname)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: MCP_CORS })
    if (pathname === '/mcp') return mcp(req, env)
    if (pathname === '/device') return device(req, env)
    if (
      pathname === '/.well-known/oauth-protected-resource' ||
      pathname === '/.well-known/oauth-protected-resource/mcp'
    ) {
      return json(resourceMetadata(env), {
        headers: { ...MCP_CORS, 'Cache-Control': 'public, max-age=3600' },
      })
    }
    if (pathname === '/.well-known/oauth-authorization-server') return authorizationServer(env)
    if (pathname === '/.well-known/openai-apps-challenge') {
      const token = env.OPENAI_APPS_CHALLENGE?.trim()
      return token
        ? new Response(token, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        : new Response('Not found', { status: 404 })
    }
    // AI apps (Claude's directory) and favicon services take the server's icon from its own host:
    // the site's icons, served from here (some do not follow a redirect to another host).
    if (ICONS.has(pathname)) return siteIcon(pathname)
    if (pathname === '/') {
      const text = `Fixnote remote MCP server ${SERVER_VERSION} (${remoteToolList().length} tools). Add ${env.PUBLIC_URL}/mcp to your AI app as a connector.`
      return new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixnote MCP server</title><link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"></head><body><p>${text}</p><p><a href="https://fixnote.space/features/mcp/">How to connect</a></p></body></html>\n`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
