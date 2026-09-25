/**
 * unfurl: fetches the <head> of a web page for a link card in the web app (browsers cannot read
 * other sites because of CORS; the desktop app fetches pages itself). Signed-in users only.
 * Only public http(s) hosts: private, loopback and link-local addresses are refused, also after
 * redirects. The page is not stored and URLs are not logged.
 */

import { CORS, jsonError, rateLimiter, userId } from '../_shared/auth.ts'

export interface UnfurlDeps {
  fetch: typeof fetch
  /** IP addresses of a host name; [] if it does not resolve. */
  resolve: (host: string) => Promise<string[]>
  perMinute: number
}

export function depsFromDeno(): UnfurlDeps {
  return {
    fetch,
    resolve: async (host) => {
      const out: string[] = []
      for (const type of ['A', 'AAAA'] as const) {
        try {
          out.push(...(await Deno.resolveDns(host, type)))
        } catch {
          // no records of this type
        }
      }
      return out
    },
    perMinute: Number(Deno.env.get('UNFURL_REQUESTS_PER_MINUTE') ?? 60),
  }
}

const MAX_BYTES = 512 * 1024
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 8000
const allow = rateLimiter()

/** Loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/i)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (!v6.includes(':')) return true
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe8') ||
    v6.startsWith('fe9') ||
    v6.startsWith('fea') ||
    v6.startsWith('feb') ||
    v6.startsWith('ff')
  )
}

async function publicUrl(raw: string, deps: UnfurlDeps): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) return null
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null
  const literal = /^[\d.]+$/.test(host) || host.includes(':')
  const addresses = literal ? [host] : await deps.resolve(host)
  if (!addresses.length || addresses.some(isPrivateAddress)) return null
  return url
}

const hasHeadEnd = (text: string) => /<\/head>/i.test(text)

export async function handle(req: Request, deps: UnfurlDeps, now = Date.now()): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')
  const user = userId(req)
  if (!user) return jsonError(401, 'Sign in to see link previews')
  if (!allow(user, deps.perMinute, now)) return jsonError(429, 'Too many requests')

  let requested: string
  try {
    const body = (await req.json()) as { url?: unknown }
    if (typeof body.url !== 'string' || body.url.length > 2048) throw new Error('bad url')
    requested = body.url
  } catch {
    return jsonError(400, 'Expected {"url": "https://…"}')
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let target = requested
  let res: Response | null = null
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await publicUrl(target, deps)
    if (!url) return jsonError(400, 'Only public web pages can be previewed')
    try {
      res = await deps.fetch(url, {
        redirect: 'manual',
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FixNote/1.0; +https://fixnote.space)',
          Accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5',
        },
      })
    } catch {
      return jsonError(502, 'The page could not be fetched')
    }
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel()
      target = new URL(location, url).href
      res = null
      continue
    }
    target = url.href
    break
  }
  if (!res) return jsonError(502, 'Too many redirects')
  if (!res.ok) {
    await res.body?.cancel()
    return jsonError(502, `The page answered ${res.status}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  let html: string | undefined
  if (/html/i.test(contentType) && res.body) {
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    html = ''
    try {
      while (html.length < MAX_BYTES && !hasHeadEnd(html)) {
        const { value, done } = await reader.read()
        if (done) break
        html += value
      }
    } catch {
      // timed out mid-page: use what arrived
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    html = html.slice(0, MAX_BYTES)
  } else {
    await res.body?.cancel()
  }

  return new Response(JSON.stringify({ url: target, contentType, ...(html ? { html } : {}) }), {
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
