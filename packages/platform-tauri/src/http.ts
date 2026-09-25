import { Channel, invoke } from '@tauri-apps/api/core'

type HttpEvent =
  | { kind: 'head'; status: number; headers: [string, string][] }
  | { kind: 'chunk'; data: string }
  | { kind: 'end' }
  | { kind: 'error'; message: string }

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/**
 * A streaming fetch through the Rust side (apps/desktop/src-tauri/src/http.rs), free of CORS and
 * mixed-content rules: for the user's own LLM endpoint and Ollama on localhost. Supports what the
 * LLM client needs: method, headers, a string body, a streamed response and abort.
 */
export const tauriFetch: typeof fetch = (input, init) =>
  new Promise<Response>((resolve, reject) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const signal = init?.signal
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const headers = [...new Headers(init?.headers).entries()]
    let id: number | null = null
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let settled = false
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
      },
      cancel() {
        if (id !== null) void invoke('http_cancel', { id })
      },
    })
    const events = new Channel<HttpEvent>()
    events.onmessage = (e) => {
      if (e.kind === 'head') {
        settled = true
        resolve(new Response(stream, { status: e.status, headers: e.headers }))
      } else if (e.kind === 'chunk') controller?.enqueue(bytes(e.data))
      else if (e.kind === 'end') controller?.close()
      else {
        const err =
          e.message === 'aborted'
            ? new DOMException('Aborted', 'AbortError')
            : new TypeError(e.message)
        if (settled) controller?.error(err)
        else reject(err)
      }
    }
    signal?.addEventListener('abort', () => {
      if (id !== null) void invoke('http_cancel', { id })
    })
    invoke<number>('http_stream', {
      request: {
        url,
        method: init?.method ?? 'GET',
        headers,
        body: typeof init?.body === 'string' ? init.body : null,
      },
      events,
    }).then(
      (value) => {
        id = value
        if (signal?.aborted) void invoke('http_cancel', { id })
      },
      (err: unknown) => reject(new TypeError(String(err))),
    )
  })
