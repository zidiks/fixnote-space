/** Helpers shared by the edge functions. */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const jsonError = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ error: { message, ...extra } }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

interface Claims {
  sub?: string
  role?: string
  email?: string
  /** Set on tokens Supabase Auth's OAuth server gave an AI app (remote MCP): never ours to serve. */
  client_id?: string
}

function claims(req: Request): Claims | null {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

/** Email of a signed-in user's JWT (verified by the platform, like `userId`). */
export function userEmail(req: Request): string | null {
  const c = claims(req)
  return c?.role === 'authenticated' && !c.client_id && c.email ? c.email : null
}

/**
 * Subject of a signed-in user's JWT, without verifying it (the platform already did). Null for an
 * AI app's OAuth token: it may not spend the account's AI allowance, pay or do anything else here.
 */
export function userId(req: Request): string | null {
  const c = claims(req)
  return c?.role === 'authenticated' && !c.client_id && c.sub ? c.sub : null
}

/** Best effort, per isolate: enough to stop a runaway loop from one account. */
export function rateLimiter() {
  const recent = new Map<string, number[]>()
  return (user: string, perMinute: number, now: number): boolean => {
    const list = (recent.get(user) ?? []).filter((t) => now - t < 60_000)
    if (list.length >= perMinute) {
      recent.set(user, list)
      return false
    }
    list.push(now)
    recent.set(user, list)
    return true
  }
}
