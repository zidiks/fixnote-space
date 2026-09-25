import { assertEquals } from 'jsr:@std/assert@1'
import { handle, isPrivateAddress, type UnfurlDeps } from './handler.ts'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const token = (sub: string) => `${b64({ alg: 'HS256' })}.${b64({ sub, role: 'authenticated' })}.sig`

const post = (url: unknown, sub: string | null = 'user-1') =>
  new Request('http://fn/unfurl', {
    method: 'POST',
    headers: sub ? { Authorization: `Bearer ${token(sub)}` } : {},
    body: JSON.stringify({ url }),
  })

const pages: Record<string, () => Response> = {
  'https://blog.example/post': () =>
    new Response(
      '<html><head><title>Hi</title><meta property="og:title" content="Post"></head><body>' +
        'x'.repeat(10_000),
      {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      },
    ),
  'https://short.example/a': () =>
    new Response(null, { status: 301, headers: { location: 'https://blog.example/post' } }),
  'https://evil.example/': () =>
    new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }),
  'https://img.example/cat.png': () =>
    new Response(new Uint8Array(10), { headers: { 'content-type': 'image/png' } }),
}

const dns: Record<string, string[]> = {
  'blog.example': ['93.184.216.34'],
  'short.example': ['93.184.216.35'],
  'evil.example': ['93.184.216.36'],
  'img.example': ['93.184.216.37'],
  'intranet.example': ['10.0.0.5'],
}

let fetched: string[] = []
const deps: UnfurlDeps = {
  fetch: (input) => {
    const url = String(input)
    fetched.push(url)
    const page = pages[url]
    return Promise.resolve(page ? page() : new Response('nope', { status: 404 }))
  },
  resolve: (host) => Promise.resolve(dns[host] ?? []),
  perMinute: 3,
}

Deno.test('returns the head of a page, following public redirects', async () => {
  fetched = []
  const res = await handle(post('https://short.example/a'), deps)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.url, 'https://blog.example/post')
  assertEquals(body.contentType, 'text/html; charset=utf-8')
  assertEquals(body.html.includes('og:title'), true)
  assertEquals(fetched, ['https://short.example/a', 'https://blog.example/post'])
})

Deno.test('reports images without reading them', async () => {
  const res = await handle(post('https://img.example/cat.png', 'user-2'), deps)
  assertEquals(await res.json(), { url: 'https://img.example/cat.png', contentType: 'image/png' })
})

Deno.test('refuses private hosts, also behind a redirect', async () => {
  fetched = []
  for (const url of [
    'http://127.0.0.1/',
    'http://localhost:3000',
    'https://intranet.example/',
    'http://[::1]/',
    'file:///etc/passwd',
  ]) {
    assertEquals((await handle(post(url, 'user-3'), { ...deps, perMinute: 100 })).status, 400, url)
  }
  assertEquals(
    (await handle(post('https://evil.example/', 'user-3'), { ...deps, perMinute: 100 })).status,
    400,
  )
  assertEquals(fetched, ['https://evil.example/'])
})

Deno.test('needs a signed-in user and limits the rate', async () => {
  assertEquals((await handle(post('https://blog.example/post', null), deps)).status, 401)
  const statuses: number[] = []
  for (let i = 0; i < 4; i++)
    statuses.push((await handle(post('https://blog.example/post', 'user-4'), deps, 1000)).status)
  assertEquals(statuses, [200, 200, 200, 429])
})

Deno.test('classifies addresses', () => {
  for (const ip of [
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
  ]) {
    assertEquals(isPrivateAddress(ip), true, ip)
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '172.32.0.1']) {
    assertEquals(isPrivateAddress(ip), false, ip)
  }
})
