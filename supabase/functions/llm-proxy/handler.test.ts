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
  const cached = JSON.stringify(seen.body.messages).includes('cached')
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'))
      if (cached) {
        c.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[],"usage":{"prompt_tokens":1000,"prompt_cache_hit_tokens":800,"completion_tokens":20,"total_tokens":1020}}\n\n',
          ),
        )
        c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        c.close()
        return
      }
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
  model: 'deepseek-flash',
  maxTokens: 2048,
  hardModel: 'deepseek-v4-pro',
  maxTokensHard: 16384,
  hardWeight: 4,
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
  assertEquals(seen?.body.model, 'deepseek-flash')
  assertEquals(seen?.body.thinking, { type: 'disabled' })
  assertEquals(seen?.body.max_tokens, 2048)
  assertEquals(seen?.body.stream, true)
})

Deno.test('"hard" thinks on the larger model, gets its reasoning back and weighs more', async () => {
  const { m, charged } = meter({ ok: true })
  const call = { id: 'c1', type: 'function', function: { name: 'list_folders', arguments: '{}' } }
  const res = await handle(
    post(
      {
        level: 'hard',
        max_tokens: 99999,
        temperature: 0.2,
        messages: [
          { role: 'user', content: 'what is in Work?' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [call],
            reasoning_content: 'Look first.',
          },
          { role: 'tool', tool_call_id: 'c1', content: 'Work (id: 1): 3 notes' },
        ],
      },
      auth('h1'),
    ),
    env(),
    Date.now(),
    m,
  )
  await res.text()
  assertEquals(seen?.body.model, 'deepseek-v4-pro')
  assertEquals(seen?.body.thinking, { type: 'enabled' })
  assertEquals(seen?.body.max_tokens, 16384)
  assertEquals(seen?.body.temperature, undefined)
  const sent = seen?.body.messages as { reasoning_content?: string }[]
  assertEquals(sent[1]?.reasoning_content, 'Look first.')
  // 42 tokens at four times the weight; a step with tool results is no new request.
  assertEquals(charged, [['h1', 168]])
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
  const big = { messages: [{ role: 'user', content: 'x'.repeat(600_000) }] }
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
  const requests: number[] = []
  const m: Meter = {
    allowance: async () => allowance,
    record: async (user, tokens, count) => {
      charged.push([user, tokens])
      requests.push(count)
    },
  }
  return { m, charged, requests }
}

Deno.test('charges the tokens the provider reports, once the answer is read', async () => {
  const { m, charged } = meter({ ok: true })
  const res = await handle(post(ok, auth('m1')), env(), Date.now(), m)
  assertEquals(seen?.body.stream_options, { include_usage: true })
  assertEquals(charged, [])
  assertStringIncludes(await res.text(), '"total_tokens":42')
  assertEquals(charged, [['m1', 42]])
})

Deno.test('charges cached prompt tokens at a tenth', async () => {
  const { m, charged } = meter({ ok: true })
  const res = await handle(
    post({ messages: [{ role: 'user', content: 'cached rules' }] }, auth('m5')),
    env(),
    Date.now(),
    m,
  )
  await res.text()
  assertEquals(charged, [['m5', 1020 - 720]])
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

const TOOL = {
  type: 'function',
  function: {
    name: 'search_notes',
    description: 'Search',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    strict: 'dropped',
  },
}

Deno.test('passes tools and tool steps on; a step is not a new request', async () => {
  const first = meter({ ok: true })
  const res = await handle(post({ ...ok, tools: [TOOL] }, auth('t1')), env(), Date.now(), first.m)
  await res.text()
  assertEquals(seen?.body.tools, [
    {
      type: 'function',
      function: {
        name: 'search_notes',
        description: 'Search',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    },
  ])
  assertEquals(first.requests, [1])
  const steps = {
    tools: [TOOL],
    messages: [
      { role: 'user', content: 'find the bot note' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'search_notes', arguments: '{"query":"bot"}' },
            extra: 1,
          },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: '1. Bot (id: n1)' },
    ],
  }
  const next = meter({ ok: true })
  await (await handle(post(steps, auth('t1')), env(), Date.now(), next.m)).text()
  assertEquals(next.requests, [0])
  assertEquals((seen?.body.messages as unknown[] | undefined)?.[1], {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'c1',
        type: 'function',
        function: { name: 'search_notes', arguments: '{"query":"bot"}' },
      },
    ],
  })
})

Deno.test('rejects malformed tools and tool messages', async () => {
  const bad = (body: unknown) => handle(post(body, auth('t2')), env()).then((r) => r.status)
  assertEquals(await bad({ ...ok, tools: [{ type: 'function', function: { name: 'x y' } }] }), 400)
  assertEquals(await bad({ ...ok, tools: 'all' }), 400)
  assertEquals(await bad({ messages: [{ role: 'tool', content: 'no id' }] }), 400)
  assertEquals(
    await bad({
      messages: [{ role: 'assistant', content: null, tool_calls: [{ id: 'c', function: {} }] }],
    }),
    400,
  )
})

Deno.test({
  name: 'cleanup',
  fn: () => upstream.shutdown(),
  sanitizeOps: false,
  sanitizeResources: false,
})
