/**
 * llm-proxy: the app's default LLM route. Signed-in users only (the platform verifies the JWT; we
 * check it is present too). The provider key never leaves the server. Requests are bounded and the
 * model is fixed server-side. Message content is never logged. Each account has an AI allowance
 * (supabase/migrations/*_plans.sql): asked before the request, charged with the tokens the
 * provider reports when the answer ends (an estimate when the reader stops early). The assistant
 * may pass tools (function calling); a request that only brings tool results back is a step of the
 * same question and does not count as a new request.
 */

import { CORS, jsonError, rateLimiter, userId } from '../_shared/auth.ts'

export interface ProxyEnv {
  apiKey: string | undefined
  baseUrl: string
  model: string
  maxTokens: number
  perMinute: number
}

/** What `ai_allowance` answers: may this account ask, and how much it has used. */
export interface Allowance {
  ok: boolean
  reason?: 'pro_required' | 'month_limit' | 'day_limit' | 'paused'
  used?: number
  limit?: number
  resets_at?: string
}

/** The account's AI allowance and what each answer cost (the database in production). */
export interface Meter {
  allowance(user: string): Promise<Allowance>
  /** `requests`: 1 for a question, 0 for a step that only brings tool results back. */
  record(user: string, tokens: number, requests: number): Promise<void>
}

/** No accounting (tests of the proxy itself, or no database). */
export const unmetered: Meter = {
  allowance: async () => ({ ok: true }),
  record: async () => undefined,
}

const REFUSED: Record<NonNullable<Allowance['reason']>, [number, string]> = {
  pro_required: [402, 'The assistant is part of FixNote Pro'],
  month_limit: [429, 'This month’s AI allowance is used up'],
  day_limit: [429, 'Today’s AI allowance is used up'],
  paused: [503, 'The assistant is paused for a while'],
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

const MAX_BODY = 512 * 1024
const MAX_MESSAGES = 120
const MAX_TOOLS = 32
const MAX_CALLS = 16

const json = jsonError
const allow = rateLimiter()

interface Incoming {
  messages?: unknown
  tools?: unknown
  temperature?: unknown
  max_tokens?: unknown
}

type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Call[] }
  | { role: 'tool'; tool_call_id: string; content: string }

interface Call {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface Tool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const NAME = /^[A-Za-z0-9_-]{1,64}$/

function call(v: unknown): Call | null {
  if (!isObject(v) || typeof v.id !== 'string' || !isObject(v.function)) return null
  const { name, arguments: args } = v.function
  if (typeof name !== 'string' || !NAME.test(name) || typeof args !== 'string') return null
  return { id: v.id, type: 'function', function: { name, arguments: args } }
}

/** The messages rebuilt with only the fields the provider needs, or null when one is wrong. */
function messages(v: unknown): Message[] | null {
  if (!Array.isArray(v) || !v.length || v.length > MAX_MESSAGES) return null
  const out: Message[] = []
  for (const m of v) {
    if (!isObject(m)) return null
    const { role, content } = m
    if ((role === 'system' || role === 'user') && typeof content === 'string') {
      out.push({ role, content })
    } else if (role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      if (m.tool_calls.length > MAX_CALLS) return null
      const calls = m.tool_calls.map(call)
      if (calls.some((c) => !c) || (content !== null && typeof content !== 'string')) return null
      out.push({ role, content: content ?? null, tool_calls: calls as Call[] })
    } else if (role === 'assistant' && typeof content === 'string') {
      out.push({ role, content })
    } else if (
      role === 'tool' &&
      typeof m.tool_call_id === 'string' &&
      typeof content === 'string'
    ) {
      out.push({ role, tool_call_id: m.tool_call_id, content })
    } else {
      return null
    }
  }
  return out
}

/** The tools rebuilt with only name, description and parameters; undefined = none; null = wrong. */
function tools(v: unknown): Tool[] | undefined | null {
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.length > MAX_TOOLS) return null
  const out: Tool[] = []
  for (const t of v) {
    if (!isObject(t) || t.type !== 'function' || !isObject(t.function)) return null
    const { name, description, parameters } = t.function
    if (typeof name !== 'string' || !NAME.test(name)) return null
    if (typeof description !== 'string' || !isObject(parameters)) return null
    out.push({ type: 'function', function: { name, description, parameters } })
  }
  return out.length ? out : undefined
}

export async function handle(
  req: Request,
  env: ProxyEnv,
  now = Date.now(),
  meter: Meter = unmetered,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, 'Method not allowed')
  if (!env.apiKey) return json(503, 'Assistant is not configured on the server')

  const user = userId(req)
  if (!user) return json(401, 'Sign in to use the assistant')

  const raw = await req.text()
  if (raw.length > MAX_BODY) return json(413, 'Request too large')
  let body: Incoming
  try {
    body = JSON.parse(raw) as Incoming
  } catch {
    return json(400, 'Invalid JSON')
  }
  const sent = messages(body.messages)
  if (!sent) return json(400, 'Invalid messages')
  const toolList = tools(body.tools)
  if (toolList === null) return json(400, 'Invalid tools')
  // Tool results going back: the same question, a few steps of it.
  const step = sent[sent.length - 1]?.role === 'tool'
  if (!allow(user, step ? env.perMinute * 3 : env.perMinute, now)) {
    return json(429, 'Too many requests, try again in a minute')
  }

  const allowance = await meter.allowance(user)
  if (!allowance.ok) {
    const reason = allowance.reason ?? 'paused'
    const [status, message] = REFUSED[reason] ?? REFUSED.paused
    return json(status, message, { code: reason, resetsAt: allowance.resets_at ?? null })
  }

  const upstream = await fetch(`${env.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.apiKey}` },
    body: JSON.stringify({
      model: env.model,
      messages: sent,
      ...(toolList ? { tools: toolList } : {}),
      stream: true,
      // The last chunk then carries the tokens used, which the allowance is charged with.
      stream_options: { include_usage: true },
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

  return new Response(
    metered(upstream.body, raw.length, (tokens) => meter.record(user, tokens, step ? 0 : 1)),
    {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    },
  )
}

/**
 * The provider's stream, passed through unchanged, noting the `usage` it reports at the end. When
 * it ends, or the reader stops early, `record` gets the tokens: the reported total, else a guess
 * from the characters (about 3 per token), so a cancelled answer is not free.
 */
function metered(
  body: ReadableStream<Uint8Array>,
  promptChars: number,
  record: (tokens: number) => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let answerChars = 0
  let reported: number | null = null
  let done = false
  const finish = async () => {
    if (done) return
    done = true
    await record(reported ?? Math.ceil((promptChars + answerChars) / 3)).catch(() => undefined)
  }
  const scan = (text: string) => {
    pending += text
    for (let i = pending.indexOf('\n'); i >= 0; i = pending.indexOf('\n')) {
      const line = pending.slice(0, i).trim()
      pending = pending.slice(i + 1)
      if (!line.startsWith('data:')) continue
      if (line.includes('"usage"')) {
        try {
          const usage = (
            JSON.parse(line.slice(5)) as {
              usage?: { total_tokens?: number; prompt_cache_hit_tokens?: number }
            }
          ).usage
          // The provider's cache serves a repeated start of the prompt (the rules and the tools,
          // sent on every step) for a tenth of the price; the allowance counts it the same way.
          if (typeof usage?.total_tokens === 'number') {
            const cached = usage.prompt_cache_hit_tokens ?? 0
            reported = usage.total_tokens - Math.floor(cached * 0.9)
          }
        } catch {
          // not JSON: count it as text
        }
      }
      answerChars += line.length
    }
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done: ended, value } = await reader.read()
      if (ended) {
        await finish()
        controller.close()
        return
      }
      scan(decoder.decode(value, { stream: true }))
      controller.enqueue(value)
    },
    async cancel(reason) {
      await finish()
      await reader.cancel(reason)
    },
  })
}
