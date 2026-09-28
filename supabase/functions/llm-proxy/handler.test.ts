import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { type Allowance, handle, type Meter, type ProxyEnv } from './handler.ts'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const token = (claims: object) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`
const auth = (sub = 'user-1') => ({
  Authorization: `Bearer ${token({ sub, role: 'authenticated' })}`,
})

let seen: { auth: string | null; body: Record<string, unknown> } | null = null
const upstream = Deno.serve({ port: 0, onListen() {} }, async (req) => {
  seen = { auth: req.headers.get('authorization'), body: await req.json() }
  if (seen.body.messages && JSON.stringify(seen.body.messages).includes('fail-402')) {
    return new Response(
      '{"error":{"message":"Insufficient Balance for request with secret text"}}',
      { status: 402 },
    )
  }
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'))
      // Split mid-line, as networks do: the usage line must still be read whole.
      c.enqueue(new TextEncoder().encode('data: {"choices":[],"usage":{"prompt_tokens":40,'))
      c.enqueue(new TextEncoder().encode('"completion_tokens":2,"total_tokens":42}}\n\n'))
      c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
      c.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
})

const env = (over: Partial<ProxyEnv> = {}): ProxyEnv => ({
  apiKey: 'sk-server',
  baseUrl: `http://localhost:${upstream.addr.port}`,
  model: 'deepseek-chat',
  maxTokens: 2048,
  perMinute: 3,
  ...over,
})

const post = (body: unknown, headers: Record<string, string> = auth()) =>
  new Request('http://fn/llm-proxy', { method: 'POST', headers, body: JSON.stringify(body) })

const ok = { messages: [{ role: 'user', content: 'hello' }], model: 'gpt-4o', max_tokens: 99999 }

Deno.test('streams the provider answer with the server key and fixed model', async () => {
  const res = await handle(post(ok), env())
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('content-type'), 'text/event-stream; charset=utf-8')
  assertStringIncludes(await res.text(), '"Hi"')
  assertEquals(seen?.auth, 'Bearer sk-server')
  assertEquals(seen?.body.model, 'deepseek-chat')
  assertEquals(seen?.body.max_tokens, 2048)
  assertEquals(seen?.body.stream, true)
})

Deno.test('rejects anonymous callers and bad input', async () => {
  assertEquals((await handle(post(ok, {}), env())).status, 401)
  const anon = { Authorization: `Bearer ${token({ role: 'anon' })}` }
  assertEquals((await handle(post(ok, anon), env())).status, 401)
  assertEquals(
    (await handle(post({ messages: [{ role: 'hacker', content: 1 }] }, auth('u2')), env())).status,
    400,
  )
  assertEquals((await handle(post({ messages: [] }, auth('u2')), env())).status, 400)
  const big = { messages: [{ role: 'user', content: 'x'.repeat(300_000) }] }
  assertEquals((await handle(post(big, auth('u2')), env())).status, 413)
  assertEquals((await handle(new Request('http://fn', { method: 'GET' }), env())).status, 405)
  assertEquals((await handle(new Request('http://fn', { method: 'OPTIONS' }), env())).status, 200)
})

Deno.test('is unavailable without a server key', async () => {
  assertEquals((await handle(post(ok, auth('u3')), env({ apiKey: undefined }))).status, 503)
})

Deno.test('limits requests per user per minute', async () => {
  const e = env({ perMinute: 2 })
  const t = 1_000_000
  assertEquals((await handle(post(ok, auth('u4')), e, t)).status, 200)
  assertEquals((await handle(post(ok, auth('u4')), e, t + 1)).status, 200)
  assertEquals((await handle(post(ok, auth('u4')), e, t + 2)).status, 429)
  assertEquals((await handle(post(ok, auth('u5')), e, t + 3)).status, 200)
  assertEquals((await handle(post(ok, auth('u4')), e, t + 61_000)).status, 200)
})

Deno.test('maps provider errors without leaking their body', async () => {
  const res = await handle(
    post({ messages: [{ role: 'user', content: 'fail-402' }] }, auth('u6')),
    env(),
  )
  assertEquals(res.status, 502)
  const text = await res.text()
  assertStringIncludes(text, 'quota exhausted')
  assertEquals(text.includes('secret text'), false)
})

function meter(allowance: Allowance) {
  const charged: [string, number][] = []
  const m: Meter = {
    allowance: async () => allowance,
    record: async (user, tokens) => {
      charged.push([user, tokens])
    },
  }
  return { m, charged }
}

Deno.test('charges the tokens the provider reports, once the answer is read', async () => {
  const { m, charged } = meter({ ok: true })
  const res = await handle(post(ok, auth('m1')), env(), Date.now(), m)
  assertEquals(seen?.body.stream_options, { include_usage: true })
  assertEquals(charged, [])
  assertStringIncludes(await res.text(), '"total_tokens":42')
  assertEquals(charged, [['m1', 42]])
})

Deno.test('charges an estimate when the reader stops early', async () => {
  const { m, charged } = meter({ ok: true })
  const res = await handle(post(ok, auth('m2')), env(), Date.now(), m)
  await res.body?.cancel()
  assertEquals(charged.length, 1)
  assertEquals(charged[0]?.[0], 'm2')
  assertEquals((charged[0]?.[1] ?? 0) > 0, true)
})

Deno.test('refuses when the allowance says no, with the reason and the renewal date', async () => {
  const free = await handle(
    post(ok, auth('m3')),
    env(),
    Date.now(),
    meter({ ok: false, reason: 'pro_required' }).m,
  )
  assertEquals(free.status, 402)
  assertEquals((await free.json()).error.code, 'pro_required')
  const spent = meter({ ok: false, reason: 'month_limit', resets_at: '2026-10-01' })
  const res = await handle(post(ok, auth('m4')), env(), Date.now(), spent.m)
  assertEquals(res.status, 429)
  assertEquals((await res.json()).error, {
    message: 'This month’s AI allowance is used up',
    code: 'month_limit',
    resetsAt: '2026-10-01',
  })
  assertEquals(spent.charged, [])
})

Deno.test({
  name: 'cleanup',
  fn: () => upstream.shutdown(),
  sanitizeOps: false,
  sanitizeResources: false,
})
