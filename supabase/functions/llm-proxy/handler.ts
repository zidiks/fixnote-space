/**
 * llm-proxy: the app's default LLM route. Signed-in users only (the platform verifies the JWT; we
 * check it is present too). The provider key never leaves the server. Requests are bounded and the
 * model is fixed server-side. Message content is never logged.
 */

export interface ProxyEnv {
  apiKey: string | undefined
  baseUrl: string
  model: string
  maxTokens: number
  perMinute: number
}

export function envFromDeno(): ProxyEnv {
  return {
    apiKey: Deno.env.get('DEEPSEEK_API_KEY'),
    baseUrl: Deno.env.get('LLM_BASE_URL') ?? 'https://api.deepseek.com',
    model: Deno.env.get('LLM_MODEL') ?? 'deepseek-chat',
    maxTokens: Number(Deno.env.get('LLM_MAX_TOKENS') ?? 2048),
    perMinute: Number(Deno.env.get('LLM_REQUESTS_PER_MINUTE') ?? 20),
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BODY = 256 * 1024
const MAX_MESSAGES = 40

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** Subject of a JWT, without verifying it (the platform already did). */
function userId(req: Request): string | null {
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
const recent = new Map<string, number[]>()
function allow(user: string, perMinute: number, now: number): boolean {
  const list = (recent.get(user) ?? []).filter((t) => now - t < 60_000)
  if (list.length >= perMinute) {
    recent.set(user, list)
    return false
  }
  list.push(now)
  recent.set(user, list)
  return true
}

interface Incoming {
  messages?: unknown
  temperature?: unknown
  max_tokens?: unknown
}

function validMessages(v: unknown): v is { role: string; content: string }[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= MAX_MESSAGES &&
    v.every(
      (m) =>
        m &&
        typeof m === 'object' &&
        ['system', 'user', 'assistant'].includes((m as { role?: string }).role ?? '') &&
        typeof (m as { content?: unknown }).content === 'string',
    )
  )
}

export async function handle(req: Request, env: ProxyEnv, now = Date.now()): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, 'Method not allowed')
  if (!env.apiKey) return json(503, 'Assistant is not configured on the server')

  const user = userId(req)
  if (!user) return json(401, 'Sign in to use the assistant')
  if (!allow(user, env.perMinute, now)) return json(429, 'Too many requests, try again in a minute')

  const raw = await req.text()
  if (raw.length > MAX_BODY) return json(413, 'Request too large')
  let body: Incoming
  try {
    body = JSON.parse(raw) as Incoming
  } catch {
    return json(400, 'Invalid JSON')
  }
  if (!validMessages(body.messages)) return json(400, 'Invalid messages')

  const upstream = await fetch(`${env.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.apiKey}` },
    body: JSON.stringify({
      model: env.model,
      messages: body.messages,
      stream: true,
      temperature:
        typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1.5) : 0.3,
      max_tokens: Math.min(
        typeof body.max_tokens === 'number' ? body.max_tokens : 1024,
        env.maxTokens,
      ),
    }),
    signal: req.signal,
  })

  if (!upstream.ok || !upstream.body) {
    // Pass the provider's status on, never its raw body (it may echo the request).
    const message =
      upstream.status === 401 || upstream.status === 403
        ? 'Assistant key rejected by the provider'
        : upstream.status === 402
          ? 'Assistant quota exhausted'
          : upstream.status === 429
            ? 'Provider is busy, try again shortly'
            : 'Assistant provider error'
    return json(upstream.status === 429 ? 429 : 502, message)
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
