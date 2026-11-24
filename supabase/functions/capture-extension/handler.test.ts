import { assertEquals } from 'jsr:@std/assert@1'
import { type ExtensionRequest, type ExtensionStore, handle, sha256Hex } from './handler.ts'

function setup() {
  const requests = new Map<string, ExtensionRequest>()
  const links = new Map<string, string>()
  const items: { user: string; sealed: string }[] = []
  const store: ExtensionStore = {
    createRequest: async ({ secretHash, label }) => {
      const id = crypto.randomUUID()
      requests.set(id, { secretHash, label, status: 'pending', userId: null, expired: false })
      return id
    },
    request: async (id) => requests.get(id) ?? null,
    deleteRequest: async (id) => void requests.delete(id),
    link: async (hash, user) => void links.set(hash, user),
    unlink: async (hash) => void links.delete(hash),
    userFor: async (hash) => links.get(hash) ?? null,
    publicKey: async () => 'PUBLIC',
    isPro: async (user) => user !== 'free-user',
    addItem: async (user, sealed) => void items.push({ user, sealed }),
  }
  let n = 0
  const deps = {
    store,
    newToken: () => `token-${++n}-abcdefghijklmnopqrstuvwxyz`,
    newCode: () => 'K7QM',
  }
  const call = (
    action: string,
    body: object = {},
    token?: string,
    extraHeaders: Record<string, string> = {},
  ) =>
    handle(
      new Request(`http://fn/capture-extension/${action}`, {
        method: 'POST',
        headers: { ...(token ? { 'x-fixnote-token': token } : {}), ...extraHeaders },
        body: JSON.stringify(body),
      }),
      deps,
    )
  /** The app's Connect / Deny, as the SQL function does it. */
  const answer = (id: string, user: string | null) => {
    const r = requests.get(id)
    if (r) Object.assign(r, { status: user ? 'approved' : 'denied', userId: user })
  }
  /** A connected browser's token. */
  const connect = async (user: string) => {
    const { id, secret } = await (await call('request', { label: 'Chrome' })).json()
    answer(id, user)
    return (await (await call('poll', { id, secret })).json()).token as string
  }
  return { call, answer, connect, requests, links, items }
}

Deno.test('a request waits for the app, then gives its secret holder a token', async () => {
  const { call, answer, requests, links } = setup()
  const req = await (await call('request', { label: 'Chrome · Windows' })).json()
  assertEquals(req.code, 'K7QM')
  assertEquals(requests.get(req.id)?.secretHash, await sha256Hex(req.secret))

  assertEquals(await (await call('poll', { id: req.id, secret: req.secret })).json(), {
    status: 'pending',
  })
  // Someone with only the id (the page that opened the app) gets nothing.
  assertEquals(
    (await call('poll', { id: req.id, secret: 'wrong-secret-wrong-secret' })).status,
    404,
  )

  answer(req.id, 'user-1')
  const done = await (await call('poll', { id: req.id, secret: req.secret })).json()
  assertEquals(done.status, 'approved')
  assertEquals(done.publicKey, 'PUBLIC')
  assertEquals(links.get(await sha256Hex(done.token)), 'user-1')
  assertEquals([...links.keys()].includes(done.token), false)
  // Used once.
  assertEquals((await call('poll', { id: req.id, secret: req.secret })).status, 404)
})

Deno.test('a denied request says so once', async () => {
  const { call, answer } = setup()
  const req = await (await call('request', {})).json()
  answer(req.id, null)
  assertEquals(await (await call('poll', req)).json(), { status: 'denied' })
  assertEquals((await call('poll', req)).status, 404)
})

Deno.test('an expired request is gone', async () => {
  const { call, requests } = setup()
  const req = await (await call('request', {})).json()
  const r = requests.get(req.id)
  if (r) r.expired = true
  assertEquals((await call('poll', req)).status, 404)
})

Deno.test('saves sealed items for a connected, Pro browser only', async () => {
  const { call, connect, items } = setup()
  const token = await connect('user-1')
  assertEquals((await call('save', { sealed: 'abc_DEF-123' }, token)).status, 200)
  assertEquals(items, [{ user: 'user-1', sealed: 'abc_DEF-123' }])
  assertEquals((await call('save', { sealed: 'not base64!' }, token)).status, 400)
  assertEquals((await call('save', { sealed: 'abc' }, 'wrong-token-wrong-token')).status, 401)

  const free = await connect('free-user')
  assertEquals((await call('save', { sealed: 'abc' }, free)).status, 402)
})

Deno.test('unpairing stops the token', async () => {
  const { call, connect } = setup()
  const token = await connect('user-1')
  assertEquals((await call('key', {}, token)).status, 200)
  await call('unpair', {}, token)
  assertEquals((await call('key', {}, token)).status, 401)
})

Deno.test('rate-limits /request by cf-connecting-ip and rightmost x-forwarded-for', async () => {
  const { call } = setup()
  // Spoofing the leftmost x-forwarded-for cannot bypass the per-IP rate limit.
  for (let i = 0; i < 10; i++) {
    const res = await call('request', {}, undefined, {
      'x-forwarded-for': `10.0.0.${i}, 198.51.100.77`,
    })
    assertEquals(res.status, 200)
  }
  const blocked = await call('request', {}, undefined, {
    'x-forwarded-for': '10.0.0.99, 198.51.100.77',
  })
  assertEquals(blocked.status, 429)

  // cf-connecting-ip takes precedence over x-forwarded-for.
  for (let i = 0; i < 10; i++) {
    const res = await call('request', {}, undefined, {
      'cf-connecting-ip': '203.0.113.42',
      'x-forwarded-for': `1.2.3.${i}`,
    })
    assertEquals(res.status, 200)
  }
  const blockedCf = await call('request', {}, undefined, {
    'cf-connecting-ip': '203.0.113.42',
    'x-forwarded-for': '9.9.9.9',
  })
  assertEquals(blockedCf.status, 429)
})
