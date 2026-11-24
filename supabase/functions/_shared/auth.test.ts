import { assertEquals } from 'jsr:@std/assert@1'
import {
  createJwtVerifier,
  maskEmail,
  timingSafeEqual,
  unsafeUnverifiedClaimsAuth,
  userEmail,
  userId,
} from './auth.ts'

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const jsonPart = (v: object) => toBase64Url(new TextEncoder().encode(JSON.stringify(v)))

const NOW = 1_800_000_000_000
const NOW_SEC = Math.floor(NOW / 1000)

Deno.test('timingSafeEqual compares equal and unequal strings', () => {
  assertEquals(timingSafeEqual('secret-token', 'secret-token'), true)
  assertEquals(timingSafeEqual('secret-token', 'secret-tokeN'), false)
  assertEquals(timingSafeEqual('short', 'much-longer-secret'), false)
  assertEquals(timingSafeEqual('', ''), true)
  assertEquals(timingSafeEqual('', 'a'), false)
})

Deno.test('maskEmail masks local part while preserving domain', () => {
  assertEquals(maskEmail('alice@example.com'), 'al***@example.com')
  assertEquals(maskEmail('ab@example.com'), 'a***@example.com')
  assertEquals(maskEmail('a@example.com'), 'a***@example.com')
  assertEquals(maskEmail('not-an-email'), '')
})

Deno.test('claims-layer helpers reject expired, nbf-future, malformed, and OAuth tokens', async () => {
  const req = (claims: object) =>
    new Request('http://fn', {
      headers: { Authorization: `Bearer ${jsonPart({ alg: 'ES256' })}.${jsonPart(claims)}.sig` },
    })

  assertEquals(userId(req({ sub: 'u1', role: 'authenticated', exp: NOW_SEC + 60 }), NOW), 'u1')
  assertEquals(
    userEmail(req({ sub: 'u1', email: 'a@b.c', role: 'authenticated', exp: NOW_SEC + 60 }), NOW),
    'a@b.c',
  )
  // Expired token rejected at the claims layer
  assertEquals(userId(req({ sub: 'u1', role: 'authenticated', exp: NOW_SEC - 1 }), NOW), null)
  assertEquals(userId(req({ sub: 'u1', role: 'authenticated', exp: NOW_SEC }), NOW), null)
  // Non-numeric exp rejected
  assertEquals(userId(req({ sub: 'u1', role: 'authenticated', exp: 'never' }), NOW), null)
  // Future nbf rejected
  assertEquals(userId(req({ sub: 'u1', role: 'authenticated', nbf: NOW_SEC + 10 }), NOW), null)
  // OAuth client token rejected
  assertEquals(
    userId(req({ sub: 'u1', role: 'authenticated', client_id: 'claude', exp: NOW_SEC + 60 }), NOW),
    null,
  )
  assertEquals(
    await unsafeUnverifiedClaimsAuth(
      req({ sub: 'u1', role: 'authenticated', exp: NOW_SEC - 5 }),
      NOW,
    ),
    null,
  )
})

Deno.test('createJwtVerifier cryptographically verifies ES256 JWKS tokens and rejects forgeries', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const pubJwk = {
    ...(await crypto.subtle.exportKey('jwk', kp.publicKey)),
    kid: 'k1',
    alg: 'ES256',
  }

  let jwksCalls = 0
  const verifier = createJwtVerifier({
    supabaseUrl: 'https://proj.supabase.co',
    fetch: async (input) => {
      if (String(input) === 'https://proj.supabase.co/auth/v1/.well-known/jwks.json') {
        jwksCalls++
        return Response.json({ keys: [pubJwk] })
      }
      return new Response('not found', { status: 404 })
    },
  })

  async function signEs256(header: object, payload: object): Promise<string> {
    const input = `${jsonPart(header)}.${jsonPart(payload)}`
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      kp.privateKey,
      new TextEncoder().encode(input),
    )
    return `${input}.${toBase64Url(new Uint8Array(sig))}`
  }

  const basePayload = {
    sub: 'user-1',
    email: 'ann@example.com',
    role: 'authenticated',
    iss: 'https://proj.supabase.co/auth/v1',
    exp: NOW_SEC + 600,
  }

  const good = await signEs256({ alg: 'ES256', kid: 'k1' }, basePayload)
  const verified = await verifier(
    new Request('http://fn', { headers: { Authorization: `Bearer ${good}` } }),
    NOW,
  )
  assertEquals(verified, { id: 'user-1', email: 'ann@example.com' })

  // Second call reuses cached JWKS
  const verifiedAgain = await verifier(
    new Request('http://fn', { headers: { Authorization: `Bearer ${good}` } }),
    NOW + 1000,
  )
  assertEquals(verifiedAgain, { id: 'user-1', email: 'ann@example.com' })
  assertEquals(jwksCalls, 1)

  // Tampered payload rejected
  const parts = good.split('.')
  const tampered = `${parts[0]}.${jsonPart({ ...basePayload, sub: 'admin' })}.${parts[2]}`
  assertEquals(
    await verifier(
      new Request('http://fn', { headers: { Authorization: `Bearer ${tampered}` } }),
      NOW,
    ),
    null,
  )

  // alg: none forgery rejected
  const algNone = `${jsonPart({ alg: 'none' })}.${jsonPart(basePayload)}.sig`
  assertEquals(
    await verifier(
      new Request('http://fn', { headers: { Authorization: `Bearer ${algNone}` } }),
      NOW,
    ),
    null,
  )

  // Expired signed token rejected
  const expired = await signEs256({ alg: 'ES256', kid: 'k1' }, { ...basePayload, exp: NOW_SEC - 1 })
  assertEquals(
    await verifier(
      new Request('http://fn', { headers: { Authorization: `Bearer ${expired}` } }),
      NOW,
    ),
    null,
  )

  // OAuth client token (even properly signed) rejected
  const oauth = await signEs256(
    { alg: 'ES256', kid: 'k1' },
    { ...basePayload, client_id: 'claude' },
  )
  assertEquals(
    await verifier(
      new Request('http://fn', { headers: { Authorization: `Bearer ${oauth}` } }),
      NOW,
    ),
    null,
  )

  // Wrong issuer rejected
  const wrongIss = await signEs256(
    { alg: 'ES256', kid: 'k1' },
    { ...basePayload, iss: 'https://evil.supabase.co/auth/v1' },
  )
  assertEquals(
    await verifier(
      new Request('http://fn', { headers: { Authorization: `Bearer ${wrongIss}` } }),
      NOW,
    ),
    null,
  )
})
