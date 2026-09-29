/**
 * Minimal client for OpenAI-compatible chat APIs (DeepSeek, OpenRouter, Groq, OpenAI, Ollama):
 * one endpoint, streamed with server-sent events. Provider = base URL + key + model name.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** A tool the model asked to run; `arguments` is JSON text as the model wrote it. */
export interface ToolCall {
  id: string
  name: string
  arguments: string
}

/** Messages of a conversation with tools: the model's calls and what each call returned. */
export type AgentMessage =
  | ChatMessage
  | {
      role: 'assistant'
      content: string | null
      tool_calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
    }
  | { role: 'tool'; tool_call_id: string; content: string }

/** A tool the model may call (OpenAI function calling). */
export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: object }
}

export interface ChatRequest {
  /** Full URL of the chat completions endpoint. */
  url: string
  headers?: Record<string, string>
  model: string
  messages: AgentMessage[]
  tools?: ToolDef[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  fetch?: typeof fetch
}

export class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Why FixNote AI refused (llm-proxy): 'pro_required', 'month_limit', 'day_limit', 'paused'. */
    readonly code: string | null = null,
    /** When the allowance renews (YYYY-MM-DD), with a limit code. */
    readonly resetsAt: string | null = null,
  ) {
    super(message)
    this.name = 'ChatError'
  }
}

/** What a streamed turn brings: text as it arrives, then the tools to run (if any), then usage. */
export type TurnEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'usage'; promptTokens: number; completionTokens: number }

/** Yields text deltas as they arrive. Throws ChatError for HTTP errors; aborts via `signal`. */
export async function* streamChat(req: ChatRequest): AsyncGenerator<string, void, undefined> {
  for await (const event of streamTurn(req)) if (event.type === 'text') yield event.text
}

/**
 * One turn of the model: text deltas, and the tool calls it made (collected from their deltas, sent
 * once complete). Throws ChatError for HTTP errors; aborts via `signal`.
 */
export async function* streamTurn(req: ChatRequest): AsyncGenerator<TurnEvent, void, undefined> {
  req.signal?.throwIfAborted()
  const res = await (req.fetch ?? fetch)(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...req.headers },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.tools?.length ? { tools: req.tools } : {}),
    }),
    signal: req.signal,
  })
  if (!res.ok || !res.body) {
    let message = res.statusText || `HTTP ${res.status}`
    let code: string | null = null
    let resetsAt: string | null = null
    try {
      const body = (await res.json()) as {
        error?: { message?: string; code?: string; resetsAt?: string } | string
        message?: string
      }
      message =
        (typeof body.error === 'string' ? body.error : body.error?.message) ??
        body.message ??
        message
      if (typeof body.error === 'object') {
        code = body.error.code ?? null
        resetsAt = body.error.resetsAt ?? null
      }
    } catch {
      // not JSON
    }
    throw new ChatError(res.status, message, code, resetsAt)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  const calls = new Map<number, ToolCall>()
  let usage: TurnEvent | null = null
  let buffer = ''
  try {
    read: for (;;) {
      const { value, done } = await reader.read()
      // Some transports finish the stream quietly on abort; the caller must still see a stop.
      req.signal?.throwIfAborted()
      if (done) break
      buffer += value
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') break read
        const chunk = parseChunk(data)
        if (!chunk) continue
        if (chunk.text) yield { type: 'text', text: chunk.text }
        for (const d of chunk.calls) {
          const call = calls.get(d.index) ?? { id: '', name: '', arguments: '' }
          call.id ||= d.id ?? ''
          call.name += d.name ?? ''
          call.arguments += d.arguments ?? ''
          calls.set(d.index, call)
        }
        if (chunk.usage) usage = { type: 'usage', ...chunk.usage }
      }
    }
  } finally {
    reader.releaseLock()
  }
  const complete = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }))
    .filter((c) => c.name)
  if (complete.length) yield { type: 'tool_calls', calls: complete }
  if (usage) yield usage
}

interface Chunk {
  text: string | null
  calls: { index: number; id?: string; name?: string; arguments?: string }[]
  usage: { promptTokens: number; completionTokens: number } | null
}

function parseChunk(data: string): Chunk | null {
  try {
    const json = JSON.parse(data) as {
      choices?: {
        delta?: {
          content?: string | null
          tool_calls?: {
            index?: number
            id?: string
            function?: { name?: string; arguments?: string }
          }[]
        }
      }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number } | null
      error?: { message?: string }
    }
    if (json.error) throw new ChatError(500, json.error.message ?? 'Stream error')
    const delta = json.choices?.[0]?.delta
    return {
      text: delta?.content || null,
      calls: (delta?.tool_calls ?? []).map((c, i) => ({
        index: c.index ?? i,
        id: c.id,
        name: c.function?.name,
        arguments: c.function?.arguments,
      })),
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
          }
        : null,
    }
  } catch (err) {
    if (err instanceof ChatError) throw err
    return null
  }
}
