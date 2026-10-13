import { NO_DEVICE_MESSAGE, remoteToolList } from '@fixnote/core/remote-mcp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { challenge, checkToken, resourceMetadata, TokenCache } from './auth'
import { type DeviceInfo, type DeviceSocket, Hub } from './hub'
import { answer, answerBody, type McpContext } from './mcp'

const env = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  PUBLIC_URL: 'https://mcp.fixnote.space',
}

const b64url = (v: unknown) =>
  btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (claims: Record<string, unknown>) => `${b64url({ alg: 'ES256' })}.${b64url(claims)}.sig`

const NOW = 1_800_000_000_000
const claims = (extra: Record<string, unknown> = {}) => ({
  sub: 'user-1',
  iss: 'https://ref.supabase.co/auth/v1',
  aud: 'authenticated',
  role: 'authenticated',
  exp: NOW / 1000 + 3600,
  iat: NOW / 1000 - 10,
  ...extra,
})

/** Supabase as the relay sees it: /auth/v1/user and the plan RPC. */
function supabase(opts: { session?: boolean; pro?: boolean } = {}) {
  const calls: string[] = []
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    calls.push(u)
    if (u.endsWith('/auth/v1/user')) {
      return opts.session === false
        ? new Response('{}', { status: 401 })
        : Response.json({ id: 'user-1' })
    }
    return Response.json(opts.pro ?? true)
  }) as unknown as typeof fetch
  return { fetch: fetchFn, calls }
}

describe('token check', () => {
  it('accepts an OAuth token for MCP and remembers it for a minute', async () => {
    const sb = supabase()
    const cache = new TokenCache()
    const deps = { fetch: sb.fetch, now: () => NOW, cache }
    const token = jwt(claims({ client_id: 'claude' }))
    const first = await checkToken(token, 'client', env, deps)
    expect(first).toEqual({
      ok: true,
      userId: 'user-1',
      clientId: 'claude',
      issuedAt: NOW / 1000 - 10,
      pro: true,
    })
    await checkToken(token, 'client', env, deps)
    expect(sb.calls).toHaveLength(2)
    await checkToken(token, 'client', env, { ...deps, now: () => NOW + 61_000 })
    expect(sb.calls).toHaveLength(4)
  })

  it('keeps AI tokens and device sessions apart', async () => {
    const deps = { fetch: supabase().fetch, now: () => NOW, cache: new TokenCache() }
    expect(await checkToken(jwt(claims()), 'client', env, deps)).toMatchObject({ ok: false })
    expect(
      await checkToken(jwt(claims({ client_id: 'claude' })), 'device', env, deps),
    ).toMatchObject({ ok: false })
    expect(await checkToken(jwt(claims()), 'device', env, deps)).toMatchObject({
      ok: true,
      clientId: null,
    })
  })

  it('refuses expired, foreign and signed-out tokens', async () => {
    const deps = { fetch: supabase().fetch, now: () => NOW, cache: new TokenCache() }
    const c = { client_id: 'x' }
    expect(
      await checkToken(jwt(claims({ ...c, exp: NOW / 1000 - 1 })), 'client', env, deps),
    ).toMatchObject({ ok: false, reason: 'The token expired' })
    expect(
      await checkToken(jwt(claims({ ...c, iss: 'https://evil/auth/v1' })), 'client', env, deps),
    ).toMatchObject({ ok: false, reason: 'Wrong issuer' })
    expect(await checkToken('not-a-jwt', 'client', env, deps)).toMatchObject({ ok: false })
    const out = {
      fetch: supabase({ session: false }).fetch,
      now: () => NOW,
      cache: new TokenCache(),
    }
    expect(await checkToken(jwt(claims(c)), 'client', env, out)).toMatchObject({
      ok: false,
      reason: 'The session ended',
    })
  })

  it('reports the plan', async () => {
    const deps = { fetch: supabase({ pro: false }).fetch, now: () => NOW, cache: new TokenCache() }
    expect(await checkToken(jwt(claims({ client_id: 'x' })), 'client', env, deps)).toMatchObject({
      ok: true,
      pro: false,
    })
  })

  it('points clients at Supabase Auth', () => {
    expect(resourceMetadata(env)).toMatchObject({
      resource: 'https://mcp.fixnote.space/mcp',
      authorization_servers: ['https://ref.supabase.co/auth/v1'],
    })
    expect(challenge(env)).toBe(
      'Bearer resource_metadata="https://mcp.fixnote.space/.well-known/oauth-protected-resource"',
    )
    expect(challenge(env, 'gone')).toContain('error="invalid_token"')
  })
})

class FakeDevice implements DeviceSocket {
  sent: string[] = []
  constructor(private data: DeviceInfo) {}
  send(text: string) {
    this.sent.push(text)
  }
  info() {
    return this.data
  }
  setInfo(info: DeviceInfo) {
    this.data = info
  }
  last() {
    return JSON.parse(this.sent.at(-1) ?? '{}') as { id: string; tool: string }
  }
}

describe('Hub', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends a call to the newest device and returns its answer', async () => {
    const old = new FakeDevice({ device: 'old', connectedAt: 1 })
    const fresh = new FakeDevice({ device: 'new', connectedAt: 2 })
    const hub = new Hub(() => [old, fresh])
    const pending = hub.call({ id: 'c', name: 'Claude' }, 'list_folders', {})
    expect(old.sent).toHaveLength(0)
    const { id, tool } = fresh.last()
    expect(tool).toBe('list_folders')
    // Another device cannot answer for it.
    hub.onMessage(
      old,
      JSON.stringify({ type: 'result', id, content: [{ type: 'text', text: 'x' }] }),
    )
    hub.onMessage(
      fresh,
      JSON.stringify({ type: 'result', id, content: [{ type: 'text', text: 'Work' }] }),
    )
    expect(await pending).toEqual({ content: [{ type: 'text', text: 'Work' }] })
    expect(hub.waiting).toBe(0)
  })

  it('says so when no device is online, times out, and fails fast when one drops', async () => {
    expect(await new Hub(() => []).call({ id: 'c', name: '' }, 'get_note', {})).toEqual({
      content: [{ type: 'text', text: NO_DEVICE_MESSAGE }],
      isError: true,
    })
    const d = new FakeDevice({ device: 'pc', connectedAt: 1 })
    const hub = new Hub(() => [d], { timeoutMs: 1000 })
    const slow = hub.call({ id: 'c', name: '' }, 'get_note', {})
    await vi.advanceTimersByTimeAsync(1000)
    expect((await slow).isError).toBe(true)
    const dropped = hub.call({ id: 'c', name: '' }, 'get_note', {})
    hub.onClose(d)
    expect(await dropped).toMatchObject({ isError: true })
    expect(hub.waiting).toBe(0)
  })

  it('takes the device label from its hello', () => {
    const d = new FakeDevice({ device: '', connectedAt: 5 })
    const hub = new Hub(() => [d])
    hub.onMessage(d, JSON.stringify({ type: 'hello', device: 'Windows' }))
    expect(hub.devices()).toEqual([{ device: 'Windows', connectedAt: 5 }])
  })
})

describe('MCP answers', () => {
  const ctx = (): McpContext & { names: string[]; calls: string[] } => {
    const names: string[] = []
    const calls: string[] = []
    return {
      names,
      calls,
      hello: async (n) => void names.push(n),
      call: async (tool) => {
        calls.push(tool)
        return { content: [{ type: 'text', text: `ran ${tool}` }] }
      },
    }
  }

  it('initializes, lists the read-only tools and forwards calls', async () => {
    const c = ctx()
    const init = await answer(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-ai' } },
      },
      c,
    )
    expect(init).toMatchObject({ result: { protocolVersion: '2025-06-18' } })
    expect(c.names).toEqual(['claude-ai'])
    const list = await answer({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, c)
    expect(list).toEqual({ jsonrpc: '2.0', id: 2, result: { tools: remoteToolList() } })
    const called = await answer(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_note', arguments: {} } },
      c,
    )
    expect(called).toMatchObject({ result: { content: [{ text: 'ran get_note' }] } })
  })

  it('ignores notifications and refuses unknown methods', async () => {
    const c = ctx()
    expect(await answer({ jsonrpc: '2.0', method: 'notifications/initialized' }, c)).toBeNull()
    expect(await answerBody([{ jsonrpc: '2.0', method: 'notifications/x' }], c)).toBeNull()
    expect(await answer({ jsonrpc: '2.0', id: 9, method: 'resources/read' }, c)).toMatchObject({
      error: { code: -32601 },
    })
    expect(await answer({ id: 1 }, c)).toMatchObject({ error: { code: -32600 } })
    expect(c.calls).toEqual([])
  })
})
