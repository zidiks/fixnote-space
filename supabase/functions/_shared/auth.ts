/** Helpers shared by the edge functions. */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const jsonError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** Subject of a signed-in user's JWT, without verifying it (the platform already did). */
export function userId(req: Request): string | null {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub?: string
      role?: string
    }
    return claims.role === 'authenticated' && claims.sub ? claims.sub : null
  } catch {
    return null
  }
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
