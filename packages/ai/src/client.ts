/**
 * Minimal client for OpenAI-compatible chat APIs (DeepSeek, OpenRouter, Groq, OpenAI, Ollama):
 * one endpoint, streamed with server-sent events. Provider = base URL + key + model name.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  /** Full URL of the chat completions endpoint. */
  url: string
  headers?: Record<string, string>
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  fetch?: typeof fetch
}

export class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ChatError'
  }
}

/** Yields text deltas as they arrive. Throws ChatError for HTTP errors; aborts via `signal`. */
export async function* streamChat(req: ChatRequest): AsyncGenerator<string, void, undefined> {
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
    }),
    signal: req.signal,
  })
  if (!res.ok || !res.body) {
    let message = res.statusText || `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } | string; message?: string }
      message =
        (typeof body.error === 'string' ? body.error : body.error?.message) ??
        body.message ??
        message
    } catch {
      // not JSON
    }
    throw new ChatError(res.status, message)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    for (;;) {
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
        if (data === '[DONE]') return
        const delta = parseDelta(data)
        if (delta) yield delta
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseDelta(data: string): string | null {
  try {
    const json = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null } }[]
      error?: { message?: string }
    }
    if (json.error) throw new ChatError(500, json.error.message ?? 'Stream error')
    return json.choices?.[0]?.delta?.content ?? null
  } catch (err) {
    if (err instanceof ChatError) throw err
    return null
  }
}
