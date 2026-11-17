/**
 * review-login: the fixed sign-in code of the accounts app reviewers use (OpenAI and Anthropic
 * test the ChatGPT and Claude connectors, store reviewers may test the app; none of them can read
 * our mailbox). The accounts and the code are function secrets, never in the repository:
 * `REVIEW_ACCOUNTS` (emails, comma-separated) and `REVIEW_CODE` (8–10 digits, so it never looks
 * like the 6-digit email code). A right code gets a one-time magic-link token hash, which the app
 * turns into a session with `verifyOtp({ token_hash, type: 'email' })`, as with an emailed code.
 * Without both secrets the function does nothing. Any other email or code: the same 401.
 */

import { CORS, jsonError, rateLimiter } from '../_shared/auth.ts'

export interface ReviewDeps {
  accounts: string[]
  code: string
  /** A one-time sign-in token hash for an existing account (Auth admin `generate_link`). */
  tokenHash: (email: string) => Promise<string | null>
  perMinute: number
  now?: () => number
}

export function depsFromDeno(): ReviewDeps {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return {
    accounts: (Deno.env.get('REVIEW_ACCOUNTS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    code: (Deno.env.get('REVIEW_CODE') ?? '').trim(),
    tokenHash: async (email) => {
      const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'magiclink', email }),
      })
      if (!res.ok) return null
      const body = (await res.json()) as {
        hashed_token?: string
        properties?: { hashed_token?: string }
      }
      return body.hashed_token ?? body.properties?.hashed_token ?? null
    },
    perMinute: 10,
  }
}

/** A review code: 8 to 10 digits (the app's code field takes up to 10 digits). */
export const isReviewCode = (code: string) => /^\d{8,10}$/.test(code)

/** Compares without leaking how much of the code was right through timing. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const allow = rateLimiter()

export async function handle(req: Request, deps: ReviewDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return jsonError(405, 'POST only')
  if (!deps.accounts.length || !isReviewCode(deps.code)) return jsonError(404, 'Not found')
  let email = ''
  let code = ''
  try {
    const body = (await req.json()) as { email?: unknown; code?: unknown }
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    code = typeof body.code === 'string' ? body.code.trim() : ''
  } catch {
    return jsonError(400, 'Bad request')
  }
  const now = (deps.now ?? Date.now)()
  // Per email and overall: guessing a 10-digit code at this pace takes centuries.
  if (!allow(`email:${email}`, deps.perMinute, now) || !allow('all', deps.perMinute * 3, now)) {
    return jsonError(429, 'Too many attempts')
  }
  if (!deps.accounts.includes(email) || !same(code, deps.code)) {
    return jsonError(401, 'Invalid code')
  }
  const tokenHash = await deps.tokenHash(email)
  if (!tokenHash) return jsonError(502, 'Could not sign in')
  return new Response(JSON.stringify({ token_hash: tokenHash }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
