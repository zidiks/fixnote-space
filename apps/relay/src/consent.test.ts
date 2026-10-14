import { CONSENT_MAX_READS, CONSENT_TTL_MS } from '@fixnote/core/remote-mcp'
import { describe, expect, it } from 'vitest'
import { ConsentBox, type ConsentStorage, consentPoll, consentPost } from './consent'

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

const OK = { approved: true, redirect: 'https://claude.ai/api/mcp/auth_callback?code=c&state=s' }

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
    new Request('https://mcp.fixnote.space/api/consent/x', {
      method: 'POST',
      body: JSON.stringify(body),
    })

  it('takes a well-formed answer and gives it to the page once', async () => {
    const b = box()
    expect(await (await consentPoll(b, {})).json()).toEqual({ status: 'waiting' })
    expect((await consentPost(post(OK), b, {})).status).toBe(204)
    expect((await consentPost(post(OK), b, {})).status).toBe(409)
    const res = await consentPoll(b, { 'Access-Control-Allow-Origin': 'https://app.fixnote.space' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.fixnote.space')
    expect(await res.json()).toEqual({ status: 'done', ...OK })
    expect(await (await consentPoll(b, {})).json()).toEqual({ status: 'waiting' })
  })

  it('refuses anything that is not a redirect', async () => {
    const b = box()
    expect(
      (await consentPost(post({ approved: true, redirect: 'javascript:x' }), b, {})).status,
    ).toBe(400)
    expect((await consentPost(post({ approved: true }), b, {})).status).toBe(400)
    expect((await consentPost(post('nope'), b, {})).status).toBe(400)
    expect((await consentPost(post({ approved: false, redirect: null }), b, {})).status).toBe(204)
  })

  it('answers 429 after too many polls', async () => {
    const b = box()
    for (let i = 0; i < CONSENT_MAX_READS; i++) await b.take()
    expect((await consentPoll(b, {})).status).toBe(429)
  })
})
