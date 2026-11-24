import type { DeviceHardware, LocalLlm, ProgressListener } from '@fixnote/core'
import { createIdleTimer } from '../idle'
import type { LlmBody, LlmResponse, LocalChatMessage } from './protocol'

const IDLE_VISIBLE_MS = 12 * 60_000
const IDLE_HIDDEN_MS = 90_000
const IDLE_BENCHMARK_MS = 60_000

/**
 * A language model in a dedicated worker (transformers.js, WebGPU when there is one), the same on
 * the web and in the desktop app. Its `fetch` answers like an OpenAI chat endpoint, so the rest of
 * the app (assistant, AI edits, Tidy, call summaries) uses it like any other provider.
 */
export function createLocalLlm(): LocalLlm {
  let worker: Worker | null = null
  let nextId = 1
  let afterBenchmark = false
  const pending = new Map<
    number,
    {
      resolve: (stats: Stats) => void
      reject: (e: Error) => void
      onText?: (t: string) => void
    }
  >()
  const listeners = new Set<ProgressListener>()

  const idle = createIdleTimer({
    visibleMs: IDLE_VISIBLE_MS,
    hiddenMs: IDLE_HIDDEN_MS,
    isLive: () => worker !== null,
    onIdle: () => llm.unload(),
  })

  const start = () => {
    if (worker) return worker
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'fixnote-llm',
    })
    worker.onmessage = (e: MessageEvent<LlmResponse>) => {
      const msg = e.data
      if (msg.kind === 'progress') {
        for (const l of listeners) l(msg.progress)
        return
      }
      const p = pending.get(msg.id)
      if (!p) return
      if (msg.kind === 'text') {
        p.onText?.(msg.text)
        return
      }
      pending.delete(msg.id)
      if (msg.ok) p.resolve({ tokens: msg.tokens ?? 0, ms: msg.ms ?? 0 })
      else p.reject(new Error(msg.error))
    }
    worker.onerror = (e) => fail(new Error(e.message || 'The local model stopped'))
    return worker
  }

  const fail = (error: Error) => {
    idle.cancel()
    afterBenchmark = false
    for (const p of pending.values()) p.reject(error)
    pending.clear()
    worker?.terminate()
    worker = null
  }

  const call = (body: LlmBody, onText?: (t: string) => void) =>
    new Promise<Stats>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject, ...(onText ? { onText } : {}) })
      start().postMessage({ ...body, id })
    })

  const generate = (
    model: string,
    messages: LocalChatMessage[],
    opts: { maxTokens: number; temperature: number },
    onText: (t: string) => void,
    signal?: AbortSignal,
  ) => {
    const stop = () => worker?.postMessage({ op: 'stop', id: 0 })
    signal?.addEventListener('abort', stop, { once: true })
    return call({ op: 'generate', model, messages, ...opts }, onText).finally(() =>
      signal?.removeEventListener('abort', stop),
    )
  }

  const llm: LocalLlm = {
    load(model, onProgress) {
      afterBenchmark = false
      idle.begin()
      if (onProgress) listeners.add(onProgress)
      return call({ op: 'load', model })
        .then(() => undefined)
        .finally(() => {
          if (onProgress) listeners.delete(onProgress)
          idle.end(afterBenchmark ? IDLE_BENCHMARK_MS : undefined)
        })
    },
    async benchmark(model) {
      afterBenchmark = true
      idle.begin()
      try {
        // A short answer; the speed of the tokens after the first is what a person feels.
        const { tokens, ms } = await generate(
          model,
          [{ role: 'user', content: 'Write three short sentences about notes.' }],
          { maxTokens: 48, temperature: 0 },
          () => undefined,
        )
        return tokens && ms ? (tokens / ms) * 1000 : 0
      } finally {
        idle.end(afterBenchmark ? IDLE_BENCHMARK_MS : undefined)
      }
    },
    hardware,
    unload() {
      fail(new Error('The local model was removed'))
    },
    fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        model: string
        messages: { role: string; content?: unknown }[]
        max_tokens?: number
        temperature?: number
      }
      const messages = toLocal(body.messages)
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (data: unknown) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          afterBenchmark = false
          idle.begin()
          generate(
            body.model,
            messages,
            { maxTokens: body.max_tokens ?? 1024, temperature: body.temperature ?? 0.3 },
            (text) => send({ choices: [{ delta: { content: text } }] }),
            init?.signal ?? undefined,
          )
            .then(
              () => {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
              },
              (err: unknown) => {
                send({ error: { message: err instanceof Error ? err.message : String(err) } })
                controller.close()
              },
            )
            .finally(() => idle.end(afterBenchmark ? IDLE_BENCHMARK_MS : undefined))
        },
      })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    }) as typeof fetch,
  }
  return llm
}

type Stats = { tokens: number; ms: number }

/** What the app can learn of the hardware here (DeviceHardware, core/device-fit). */
async function hardware(): Promise<DeviceHardware> {
  type Adapter = {
    isFallbackAdapter?: boolean
    info?: { vendor?: string; architecture?: string; description?: string }
  }
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<Adapter | null> }
    deviceMemory?: number
    userAgentData?: { platform?: string }
  }
  let adapter: Adapter | null = null
  try {
    adapter = (await nav.gpu?.requestAdapter()) ?? null
  } catch {
    adapter = null
  }
  const info = adapter?.info ?? {}
  const vendor = `${info.vendor ?? ''} ${info.architecture ?? ''} ${info.description ?? ''}`
    .toLowerCase()
    .trim()
  const mac = /mac/i.test(nav.userAgentData?.platform ?? navigator.userAgent)
  return {
    gpu: Boolean(adapter && !adapter.isFallbackAdapter),
    // A Mac whose GPU is from Apple is Apple Silicon (Intel Macs report intel or amd).
    appleSilicon: mac && /apple|metal-3/.test(vendor),
    discreteGpu: /nvidia|radeon|\barc\b/.test(vendor),
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: navigator.hardwareConcurrency || 4,
  }
}

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .map((p) => (typeof p === 'object' && p && 'text' in p ? String(p.text) : ''))
          .join('')
      : ''

/**
 * Chat messages as a small model's template takes them: no tool roles (the app's tool results
 * become plain notes from the user), no empty turns, one system message first.
 */
export function toLocal(messages: { role: string; content?: unknown }[]): LocalChatMessage[] {
  const out: LocalChatMessage[] = []
  for (const m of messages) {
    const text = textOf(m.content).trim()
    if (!text) continue
    const role =
      m.role === 'system' && !out.length ? 'system' : m.role === 'assistant' ? 'assistant' : 'user'
    const content = m.role === 'tool' ? `Result from the notes:\n${text}` : text
    const last = out.at(-1)
    // Two turns of one side in a row confuse small models: they are joined.
    if (last && last.role === role && role !== 'system') last.content += `\n\n${content}`
    else out.push({ role, content })
  }
  return out
}
