import type { Embedder, ProgressListener } from '@fixnote/core'
import type { EmbedBody, EmbedResponse } from './protocol'

const BATCH = 16

/**
 * multilingual-e5-small (int8) in a dedicated worker, shared by the web app and the desktop app
 * (WebView2 is Chromium), so every device produces the same vectors. The e5 family expects
 * "query: " / "passage: " prefixes.
 */
export function createTransformersEmbedder(): Embedder {
  let worker: Worker | null = null
  let nextId = 1
  const pending = new Map<
    number,
    { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }
  >()
  const listeners = new Set<ProgressListener>()
  let ready: Promise<void> | null = null

  const start = () => {
    if (worker) return worker
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'fixnote-embed',
    })
    worker.onmessage = (e: MessageEvent<EmbedResponse>) => {
      const msg = e.data
      if (msg.kind === 'progress') {
        for (const l of listeners) l(msg.progress)
        return
      }
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.vectors ?? [])
      else p.reject(new Error(msg.error))
    }
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Embedding worker failed'))
      pending.clear()
      worker?.terminate()
      worker = null
      ready = null
    }
    return worker
  }

  const call = (body: EmbedBody) =>
    new Promise<Float32Array[]>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      start().postMessage({ ...body, id })
    })

  const embedder: Embedder = {
    modelId: 'Xenova/multilingual-e5-small@q8',
    dimensions: 384,
    ready(onProgress) {
      if (onProgress) listeners.add(onProgress)
      ready ??= call({ op: 'init' }).then(() => undefined)
      ready.catch(() => {
        ready = null
      })
      return ready
    },
    async embed(texts, kind) {
      await embedder.ready()
      const prefix = kind === 'query' ? 'query: ' : 'passage: '
      const out: Float32Array[] = []
      for (let i = 0; i < texts.length; i += BATCH) {
        out.push(
          ...(await call({ op: 'embed', texts: texts.slice(i, i + BATCH).map((t) => prefix + t) })),
        )
      }
      return out
    },
  }
  return embedder
}
