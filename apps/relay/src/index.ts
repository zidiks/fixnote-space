import {
  isAuthorizationId,
  RELAY_AUTH_PREFIX,
  RELAY_CLOSE,
  RELAY_PROTOCOL,
} from '@fixnote/core/remote-mcp'
import { type AuthEnv, challenge, checkToken, issuer, resourceMetadata, TokenCache } from './auth'
import { consentPoll, consentPost } from './consent'
import type { HandoffEnv } from './handoff'
import { answerBody } from './mcp'
import type { RelayEnv } from './relay'

export { ConsentHandoff } from './handoff'
export { UserRelay } from './relay'

export interface Env extends AuthEnv, RelayEnv, HandoffEnv {
  /** Origins of the FixNote app allowed to call /api (comma-separated). */
  APP_ORIGINS: string
}

const cache = new TokenCache()

const PRO_MESSAGE =
  'Remote access to FixNote needs FixNote Pro: it goes through our server. Open FixNote → Settings → Plan.'

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
      { error: 'invalid_token', error_description: error ?? 'Sign in to FixNote' },
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
    return unauthorized('Access was revoked in FixNote')
  }
  let body: unknown
  try {
    body = await req.json()
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
        ? relay.call(clientId, tool, args)
        : { content: [{ type: 'text', text: PRO_MESSAGE }], isError: true },
  })
  if (!out) return new Response(null, { status: 202, headers: MCP_CORS })
  return json(out, { headers: MCP_CORS })
}

/** GET /device: a FixNote device opens its WebSocket (session token as a subprotocol). */
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
  return stub(env, caller.userId).fetch(req)
}

/** /api/…: the app's settings (its own session, never an AI app's token). */
async function api(req: Request, env: Env, path: string): Promise<Response> {
  const cors = appCors(req, env)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const token = bearer(req)
  const caller = token ? await checkToken(token, 'device', env, deps()) : null
  if (!caller?.ok) return json({ error: 'unauthorized' }, { status: 401, headers: cors })
  const consent = path.match(/^\/api\/consent\/([^/]+)$/)
  if (consent?.[1] && req.method === 'POST') {
    const id = consent[1]
    if (!isAuthorizationId(id))
      return json({ error: 'bad_request' }, { status: 400, headers: cors })
    return consentPost(req, handoff(env, id), cors)
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
  if (req.method !== 'GET' || !isAuthorizationId(id)) {
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
    if (pathname === '/') {
      return new Response(
        `FixNote remote MCP server. Add ${env.PUBLIC_URL}/mcp to your AI app as a connector.\n`,
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      )
    }
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
