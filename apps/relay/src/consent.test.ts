import { CONSENT_MAX_READS, CONSENT_TTL_MS } from '@fixnote/core/remote-mcp'
import { describe, expect, it, vi } from 'vitest'
import {
  ConsentBox,
  type ConsentStorage,
  consentInspect,
  consentPoll,
  consentPost,
  isConsentId,
  redirectMatches,
  supabaseConsentDecider,
  supabaseConsentVerifier,
} from './consent'

function memory() {
  let value: Awaited<ReturnType<ConsentStorage['get']>>
  const store: ConsentStorage = {
    get: async () => value,
    put: async (v) => {
      value = v
    },
    clear: async () => {
      value = undefined
    },
  }
  return { store, peek: () => value }
}

const AUTH_ID = '550e8400-e29b-41d4-a716-446655440000'
const REGISTERED_URI = 'https://claude.ai/api/mcp/auth_callback'
const OK = { approved: true, redirect: `${REGISTERED_URI}?code=c&state=s` }

describe('consent handoff', () => {
  it('hands the answer over once', async () => {
    const m = memory()
    const box = new ConsentBox(m.store, () => 1000)
    expect(await box.take()).toBeNull()
    expect(await box.put(OK)).toBe('ok')
    expect(await box.take()).toEqual(OK)
    expect(m.peek()).toBeUndefined()
    expect(await box.take()).toBeNull()
  })

  it('keeps the first answer', async () => {
    const box = new ConsentBox(memory().store, () => 1000)
    await box.put(OK)
    expect(await box.put({ approved: false, redirect: 'https://evil.example/' })).toBe('exists')
    expect(await box.take()).toEqual(OK)
  })

  it('forgets an answer nobody picked up in time', async () => {
    let now = 1000
    const m = memory()
    const box = new ConsentBox(m.store, () => now)
    await box.put(OK)
    now += CONSENT_TTL_MS
    expect(await box.take()).toBeNull()
    expect(m.peek()).toBeUndefined()
    // After it expired, a new answer may be left.
    expect(await box.put(OK)).toBe('ok')
  })

  it('refuses endless polling', async () => {
    const box = new ConsentBox(memory().store, () => 1000)
    for (let i = 0; i < CONSENT_MAX_READS; i++) expect(await box.take()).toBeNull()
    expect(await box.take()).toBe('limit')
  })
})

describe('consent routes', () => {
  const box = () => new ConsentBox(memory().store, () => 1000)
  const post = (body: unknown) =>
    new Request(`https://mcp.fixnote.space/api/consent/${AUTH_ID}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  const allowClaude = {
    authorizationId: AUTH_ID,
    check: async () => ({ redirectUri: REGISTERED_URI }),
  }

  it('takes a verified answer and gives it to the page once', async () => {
    const b = box()
    expect(await (await consentPoll(b, {})).json()).toEqual({ status: 'waiting' })
    expect((await consentPost(post(OK), b, {}, allowClaude)).status).toBe(204)
    expect((await consentPost(post(OK), b, {}, allowClaude)).status).toBe(409)
    const res = await consentPoll(b, { 'Access-Control-Allow-Origin': 'https://app.fixnote.space' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.fixnote.space')
    expect(await res.json()).toEqual({ status: 'done', ...OK })
    expect(await (await consentPoll(b, {})).json()).toEqual({ status: 'waiting' })
  })

  it('refuses malformed bodies, non-UUID ids, and unverified/mismatched open redirects', async () => {
    const b = box()
    expect(
      (await consentPost(post({ approved: true, redirect: 'javascript:x' }), b, {}, allowClaude))
        .status,
    ).toBe(400)
    expect((await consentPost(post({ approved: true }), b, {}, allowClaude)).status).toBe(400)
    expect((await consentPost(post('nope'), b, {}, allowClaude)).status).toBe(400)

    // Non-UUID authorization id rejected
    expect(isConsentId(AUTH_ID)).toBe(true)
    expect(isConsentId('not-a-uuid')).toBe(false)
    expect(
      (await consentPost(post(OK), b, {}, { ...allowClaude, authorizationId: 'not-a-uuid' }))
        .status,
    ).toBe(400)

    // Arbitrary redirect origin rejected (open redirect)
    expect(
      (
        await consentPost(
          post({ approved: true, redirect: 'https://evil.example/phish?code=1' }),
          b,
          {},
          allowClaude,
        )
      ).status,
    ).toBe(403)

    // Wrong pathname on same origin rejected
    expect(
      (
        await consentPost(
          post({ approved: true, redirect: 'https://claude.ai/other/path?code=1' }),
          b,
          {},
          allowClaude,
        )
      ).status,
    ).toBe(403)

    // Credentials in redirect URL rejected
    expect(
      redirectMatches('https://user:pass@claude.ai/api/mcp/auth_callback?code=1', REGISTERED_URI),
    ).toBe(false)

    // Unknown/unauthorized authorization id (Supabase says no) rejected
    expect(
      (await consentPost(post(OK), b, {}, { authorizationId: AUTH_ID, check: async () => null }))
        .status,
    ).toBe(403)

    // Valid denial with null redirect allowed when authorization is verified
    expect(
      (await consentPost(post({ approved: false, redirect: null }), b, {}, allowClaude)).status,
    ).toBe(204)
  })

  it('queries Supabase Auth authorization details and supports redirect_uri and redirect_url', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ authorization_id: AUTH_ID, redirect_uri: REGISTERED_URI }),
      )
      .mockResolvedValueOnce(Response.json({ redirect_url: `${REGISTERED_URI}?code=abc` }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
    const check = supabaseConsentVerifier(
      { SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_ANON_KEY: 'anon' },
      'tok-123',
      fetchFn,
    )
    expect(await check(AUTH_ID)).toEqual({ redirectUri: REGISTERED_URI })
    expect(fetchFn).toHaveBeenCalledWith(
      `https://ref.supabase.co/auth/v1/oauth/authorizations/${AUTH_ID}`,
      { headers: { Authorization: 'Bearer tok-123', apikey: 'anon' } },
    )
    expect(await check(AUTH_ID)).toEqual({ redirectUri: `${REGISTERED_URI}?code=abc` })
    expect(await check(AUTH_ID)).toBeNull()
  })

  it('answers 429 after too many polls', async () => {
    const b = box()
    for (let i = 0; i < CONSENT_MAX_READS; i++) await b.take()
    expect((await consentPoll(b, {})).status).toBe(429)
  })

  it('executes approve/deny via Supabase Auth directly without trusting client redirects', async () => {
    const b = box()
    const decide = vi.fn(async (_id: string, action: 'approve' | 'deny') =>
      action === 'approve'
        ? `${REGISTERED_URI}?code=server-code&state=s`
        : `${REGISTERED_URI}?error=access_denied&state=s`,
    )
    const res = await consentPost(
      post({ action: 'approve' }),
      b,
      {},
      {
        authorizationId: AUTH_ID,
        userId: 'user-1',
        check: async () => null,
        decide,
      },
    )
    expect(res.status).toBe(204)
    expect(decide).toHaveBeenCalledWith(AUTH_ID, 'approve')
    expect(await (await consentPoll(b, {})).json()).toEqual({
      status: 'done',
      approved: true,
      redirect: `${REGISTERED_URI}?code=server-code&state=s`,
    })
  })

  it('stages pre-consented redirect_url on GET /api/consent/:id and only releases it to the same user', async () => {
    const b = box()
    const autoUrl = `${REGISTERED_URI}?code=auto-code&state=s`
    const inspectRes = await consentInspect(
      b,
      {},
      {
        authorizationId: AUTH_ID,
        userId: 'user-1',
        inspect: async () => ({ redirect_url: autoUrl }),
      },
    )
    expect(inspectRes.status).toBe(200)
    // Polling stays waiting until the user explicitly confirms in the app.
    expect(await (await consentPoll(b, {})).json()).toEqual({ status: 'waiting' })

    // Another user cannot consume user-1's staged redirect.
    const other = await consentPost(
      post({ action: 'approve' }),
      b,
      {},
      {
        authorizationId: AUTH_ID,
        userId: 'user-2',
        check: async () => null,
        decide: async () => null,
      },
    )
    expect(other.status).toBe(403)

    // The owning user confirms -> Supabase's staged redirect is handed off.
    const own = await consentPost(
      post({ action: 'approve' }),
      b,
      {},
      {
        authorizationId: AUTH_ID,
        userId: 'user-1',
        check: async () => null,
        decide: async () => null,
      },
    )
    expect(own.status).toBe(204)
    expect(await (await consentPoll(b, {})).json()).toEqual({
      status: 'done',
      approved: true,
      redirect: autoUrl,
    })
  })

  it('calls Supabase Auth consent endpoint in supabaseConsentDecider', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ redirect_url: `${REGISTERED_URI}?code=ok` }))
      .mockResolvedValueOnce(Response.json({ redirect_url: 'javascript:alert(1)' }))
    const decider = supabaseConsentDecider(
      { SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_ANON_KEY: 'anon' },
      'tok-123',
      fetchFn,
    )
    expect(await decider(AUTH_ID, 'approve')).toBe(`${REGISTERED_URI}?code=ok`)
    expect(fetchFn).toHaveBeenCalledWith(
      `https://ref.supabase.co/auth/v1/oauth/authorizations/${AUTH_ID}/consent`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-123',
          apikey: 'anon',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'approve' }),
      },
    )
    expect(await decider(AUTH_ID, 'deny')).toBeNull()
  })
})
