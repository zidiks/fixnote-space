import type { ConsentResult } from '@fixnote/core'
import { describe, expect, it, vi } from 'vitest'
import type { RemoteMcpApi } from './api'
import { answerConnect, loadConnect } from './connect'
import { type ConnectStep, connectReducer, waitForAnswer } from './connect-page'
import type { Authorization, ConsentAuth, ConsentDetails } from './consent'

const DETAILS: ConsentDetails = {
  client: { id: 'c1', name: 'Claude', site: 'claude.ai', logo: '' },
  redirectHost: 'claude.ai',
  email: 'me@example.com',
}
const CODE = 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s'
const DENIED = 'https://claude.ai/api/mcp/auth_callback?error=access_denied&state=s'

function fakeApi(opts: { token?: string | null; auth?: Authorization | null; handoff?: 'fail' }) {
  const consent: ConsentAuth = {
    authorization: vi.fn(
      async (): Promise<Authorization | null> =>
        opts.auth === undefined ? { kind: 'ask', details: DETAILS } : opts.auth,
    ),
    decide: vi.fn(async (_id: string, allow: boolean) => (allow ? CODE : DENIED)),
    pro: vi.fn(async () => true),
  }
  const handoff = vi.fn(async (_id: string, _r: ConsentResult) => {
    if (opts.handoff === 'fail') throw new Error('relay down')
  })
  const api = {
    token: async () => (opts.token === undefined ? 'session' : opts.token),
    consent,
    handoff,
  } as unknown as RemoteMcpApi
  return { api, consent, handoff }
}

describe('the app answers fixnote://connect', () => {
  it('asks with the client and where the browser goes back to', async () => {
    const { api } = fakeApi({})
    expect(await loadConnect(api, 'auth-123456', { localOnly: false })).toEqual({
      kind: 'ask',
      details: DETAILS,
      pro: true,
    })
  })

  it('says so when signed out or on this device only', async () => {
    expect(await loadConnect(null, 'auth-123456', { localOnly: false })).toEqual({
      kind: 'signed-out',
      reason: 'signed-out',
    })
    const { api, consent } = fakeApi({ token: null })
    expect(await loadConnect(api, 'auth-123456', { localOnly: false })).toMatchObject({
      reason: 'signed-out',
    })
    expect(await loadConnect(api, 'auth-123456', { localOnly: true })).toMatchObject({
      reason: 'local-only',
    })
    expect(consent.authorization).not.toHaveBeenCalled()
  })

  it('shows an error for a request that is not pending', async () => {
    const { api } = fakeApi({ auth: null })
    expect(await loadConnect(api, 'auth-123456', { localOnly: false })).toEqual({ kind: 'invalid' })
  })

  it('allows: Supabase first, then the redirect to the relay', async () => {
    const { api, consent, handoff } = fakeApi({})
    const state = await loadConnect(api, 'auth-123456', { localOnly: false })
    expect(await answerConnect(api, 'auth-123456', state, true)).toBe('done')
    expect(consent.decide).toHaveBeenCalledWith('auth-123456', true)
    expect(handoff).toHaveBeenCalledWith('auth-123456', { approved: true, redirect: CODE })
  })

  it('denies with the denial redirect', async () => {
    const { api, handoff } = fakeApi({})
    const state = await loadConnect(api, 'auth-123456', { localOnly: false })
    expect(await answerConnect(api, 'auth-123456', state, false)).toBe('done')
    expect(handoff).toHaveBeenCalledWith('auth-123456', { approved: false, redirect: DENIED })
  })

  it('a request allowed before only hands over on Continue', async () => {
    const { api, consent, handoff } = fakeApi({ auth: { kind: 'allowed', redirect: CODE } })
    const state = await loadConnect(api, 'auth-123456', { localOnly: false })
    expect(state).toEqual({ kind: 'again', redirect: CODE })
    expect(await answerConnect(api, 'auth-123456', state, false)).toBe('done')
    expect(handoff).toHaveBeenLastCalledWith('auth-123456', { approved: false, redirect: null })
    expect(await answerConnect(api, 'auth-123456', state, true)).toBe('done')
    expect(handoff).toHaveBeenLastCalledWith('auth-123456', { approved: true, redirect: CODE })
    expect(consent.decide).not.toHaveBeenCalled()
  })

  it('never acts without a pending request, and reports a relay that is down', async () => {
    const { api, consent } = fakeApi({})
    expect(await answerConnect(api, 'auth-123456', { kind: 'loading' }, true)).toBe('failed')
    expect(
      await answerConnect(api, 'auth-123456', { kind: 'signed-out', reason: 'signed-out' }, true),
    ).toBe('failed')
    expect(consent.decide).not.toHaveBeenCalled()
    const down = fakeApi({ handoff: 'fail' })
    const state = await loadConnect(down.api, 'auth-123456', { localOnly: false })
    expect(await answerConnect(down.api, 'auth-123456', state, true)).toBe('unsent')
    vi.mocked(down.consent.decide).mockResolvedValueOnce(null)
    expect(await answerConnect(down.api, 'auth-123456', state, true)).toBe('failed')
  })
})

describe('the connect page', () => {
  const run = (events: Parameters<typeof connectReducer>[1][]): ConnectStep =>
    events.reduce(connectReducer, { kind: 'loading' } as ConnectStep)

  it('waits for the app and goes back with its answer', () => {
    expect(run([{ type: 'no-session' }])).toEqual({ kind: 'start' })
    expect(run([{ type: 'no-session' }, { type: 'open-app' }, { type: 'slow' }])).toEqual({
      kind: 'waiting',
      slow: true,
    })
    const ok = { type: 'answer' as const, result: { approved: true, redirect: CODE } }
    expect(run([{ type: 'no-session' }, { type: 'open-app' }, ok])).toEqual({
      kind: 'returning',
      approved: true,
    })
    const no = { type: 'answer' as const, result: { approved: false, redirect: null } }
    expect(run([{ type: 'no-session' }, { type: 'open-app' }, no])).toEqual({ kind: 'declined' })
  })

  it('times out, and opening again waits again', () => {
    const s = run([{ type: 'no-session' }, { type: 'open-app' }, { type: 'timeout' }])
    expect(s).toEqual({ kind: 'expired' })
    expect(connectReducer(s, { type: 'open-app' })).toEqual({ kind: 'waiting', slow: false })
  })

  it('a late answer does not pull someone out of the email sign-in', () => {
    const s = run([{ type: 'no-session' }, { type: 'open-app' }, { type: 'use-email' }])
    expect(s).toEqual({ kind: 'email' })
    const late = { type: 'answer' as const, result: { approved: true, redirect: CODE } }
    expect(connectReducer(s, late)).toEqual({ kind: 'email' })
    expect(connectReducer(s, { type: 'slow' })).toEqual({ kind: 'email' })
  })

  it('signs in with a code, then asks right there', () => {
    const s = run([
      { type: 'no-session' },
      { type: 'use-email' },
      { type: 'code-sent', email: 'me@example.com' },
    ])
    expect(s).toEqual({ kind: 'code', email: 'me@example.com' })
    expect(connectReducer(s, { type: 'details', details: DETAILS, pro: false })).toEqual({
      kind: 'ask',
      details: DETAILS,
      pro: false,
    })
  })

  it('polls until the answer, through network trouble', async () => {
    const answers: (Error | 'waiting' | ConsentResult)[] = [
      'waiting',
      new Error('offline'),
      { approved: true, redirect: CODE },
    ]
    const poll = vi.fn(async () => {
      const a = answers.shift()
      if (a instanceof Error) throw a
      return a ?? 'waiting'
    })
    const sleep = vi.fn(async () => undefined)
    const r = await waitForAnswer(poll, { signal: new AbortController().signal, sleep })
    expect(r).toEqual({ approved: true, redirect: CODE })
    expect(poll).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledWith(1500)
  })

  it('stops after the time is up or when aborted', async () => {
    let now = 0
    const sleep = async (ms: number) => {
      now += ms
    }
    const poll = vi.fn(async () => 'waiting' as const)
    const r = await waitForAnswer(poll, {
      signal: new AbortController().signal,
      now: () => now,
      sleep,
      forMs: 3 * 60_000,
    })
    expect(r).toBe('timeout')
    expect(poll).toHaveBeenCalledTimes(120)
    const ctl = new AbortController()
    ctl.abort()
    expect(await waitForAnswer(poll, { signal: ctl.signal, sleep })).toBe('aborted')
  })
})
