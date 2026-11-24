/**
 * unfurl: fetches the <head> of a web page for a link card in the web app (browsers cannot read
 * other sites because of CORS; the desktop app fetches pages itself). Signed-in users only.
 * Only public http(s) hosts: private, loopback and link-local addresses are refused, also after
 * redirects. The page is not stored and URLs are not logged.
 */

import {
  type AuthVerifier,
  CORS,
  denoJwtVerifier,
  jsonError,
  rateLimiter,
} from '../_shared/auth.ts'

export interface UnfurlDeps {
  fetch: typeof fetch
  /** IP addresses of a host name; [] if it does not resolve. */
  resolve: (host: string) => Promise<string[]>
  perMinute: number
  /** Cryptographic JWT verifier (required; omitted fails closed with 401). */
  verifyUser?: AuthVerifier
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
    verifyUser: denoJwtVerifier(),
  }
}

const MAX_BYTES = 512 * 1024
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 8000
const allow = rateLimiter()

function isPrivateV4(a: number, b: number, c: number, d: number): boolean {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    !Number.isInteger(c) ||
    !Number.isInteger(d) ||
    a < 0 ||
    a > 255 ||
    b < 0 ||
    b > 255 ||
    c < 0 ||
    c > 255 ||
    d < 0 ||
    d > 255
  ) {
    return true
  }
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

/** Strict canonical dotted-quad decimal IPv4 (no leading zeros / octal / hex / short form). */
function parseStrictIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const out: number[] = []
  for (const p of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    out.push(n)
  }
  return [out[0] as number, out[1] as number, out[2] as number, out[3] as number]
}

/** Parses an IPv6 literal (with optional brackets, `::`, and trailing IPv4) into 8 × 16-bit words. */
function parseIpv6(raw: string): Uint16Array | null {
  let s = raw.trim().toLowerCase()
  if (s.startsWith('[') || s.endsWith(']')) {
    if (!s.startsWith('[') || !s.endsWith(']')) return null
    s = s.slice(1, -1)
  }
  // Reject zone identifiers (e.g. %eth0) and anything without colons.
  if (!s.includes(':') || s.includes('%')) return null

  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':')
    if (lastColon === -1) return null
    const v4 = parseStrictIpv4(s.slice(lastColon + 1))
    if (!v4) return null
    const hi = ((v4[0] << 8) | v4[1]).toString(16)
    const lo = ((v4[2] << 8) | v4[3]).toString(16)
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`
  }

  const halves = s.split('::')
  if (halves.length > 2) return null

  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const words = new Uint16Array(8)

  if (halves.length === 1) {
    if (left.length !== 8) return null
    for (let i = 0; i < 8; i++) {
      const g = left[i] ?? ''
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null
      words[i] = Number.parseInt(g, 16)
    }
    return words
  }

  const missing = 8 - (left.length + right.length)
  if (missing < 1) return null
  for (let i = 0; i < left.length; i++) {
    const g = left[i] ?? ''
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    words[i] = Number.parseInt(g, 16)
  }
  for (let i = 0; i < right.length; i++) {
    const g = right[i] ?? ''
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    words[left.length + missing + i] = Number.parseInt(g, 16)
  }
  return words
}

/** Loopback, private, link-local, CGNAT, NAT64, multicast and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  const trimmed = ip.trim()
  if (!trimmed) return true

  if (trimmed.includes(':') || trimmed.startsWith('[')) {
    const w = parseIpv6(trimmed)
    if (!w) return true
    const w0 = w[0] as number
    const w1 = w[1] as number
    const w2 = w[2] as number
    const w3 = w[3] as number
    const w4 = w[4] as number
    const w5 = w[5] as number
    const w6 = w[6] as number
    const w7 = w[7] as number

    // ::/96 — covers ::/128 (unspecified), ::1/128 (loopback), and IPv4-compatible ::/96
    if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) return true
    // ::ffff:0:0/96 (IPv4-mapped) and ::ffff:0:0:0/96 (IPv4-translated SIIT)
    if (
      w0 === 0 &&
      w1 === 0 &&
      w2 === 0 &&
      w3 === 0 &&
      ((w4 === 0 && w5 === 0xffff) || (w4 === 0xffff && w5 === 0))
    ) {
      return isPrivateV4(w6 >> 8, w6 & 0xff, w7 >> 8, w7 & 0xff)
    }
    // 64:ff9b::/96 (NAT64 well-known) and 64:ff9b:1::/48 (NAT64 local-use)
    if (w0 === 0x0064 && w1 === 0xff9b) {
      if (w2 === 0x0001) return true
      if (w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) return true
    }
    // 100::/64 (Discard-Only, RFC 6666)
    if (w0 === 0x0100 && w1 === 0 && w2 === 0 && w3 === 0) return true
    // 2001:db8::/32 (Documentation)
    if (w0 === 0x2001 && w1 === 0x0db8) return true
    // fc00::/7 (Unique Local)
    if ((w0 & 0xfe00) === 0xfc00) return true
    // fe80::/10 (Link-Local) and fec0::/10 (Deprecated Site-Local)
    if ((w0 & 0xffc0) === 0xfe80 || (w0 & 0xffc0) === 0xfec0) return true
    // ff00::/8 (Multicast)
    if ((w0 & 0xff00) === 0xff00) return true
    return false
  }

  const v4 = parseStrictIpv4(trimmed)
  if (!v4) return true
  return isPrivateV4(v4[0], v4[1], v4[2], v4[3])
}

/** Rejects octal, hex, integer, or short-form IPv4 host literals (e.g. 0177.0.0.1, 0x7f000001, 127.1). */
function isNonCanonicalIpv4Host(rawHost: string): boolean {
  if (!rawHost || rawHost.startsWith('[')) return false
  const parts = rawHost.split('.')
  if (parts.length > 4) return false
  if (!parts.every((p) => /^(?:0x[0-9a-f]+|\d+)$/i.test(p))) return false
  return parseStrictIpv4(rawHost) === null
}

async function publicUrl(raw: string, deps: UnfurlDeps): Promise<URL | null> {
  const rawAuthority = raw.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i)?.[1] ?? ''
  const rawHost = rawAuthority.replace(/^.*@/, '').replace(/:\d+$/, '')
  if (isNonCanonicalIpv4Host(rawHost)) return null

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
  if (isNonCanonicalIpv4Host(host)) return null
  const literal = /^(?:[\d.]+|0x[0-9a-f.]+)$/i.test(host) || host.includes(':')
  const addresses = literal ? [host] : await deps.resolve(host)
  if (!addresses.length || addresses.some(isPrivateAddress)) return null
  return url
}

const hasHeadEnd = (text: string) => /<\/head>/i.test(text)

export async function handle(req: Request, deps: UnfurlDeps, now = Date.now()): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')
  const verified = deps.verifyUser ? await deps.verifyUser(req, now) : null
  if (!verified) return jsonError(401, 'Sign in to see link previews')
  if (!allow(verified.id, deps.perMinute, now)) return jsonError(429, 'Too many requests')

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
          'User-Agent': 'Mozilla/5.0 (compatible; Fixnote/1.0; +https://fixnote.space)',
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
