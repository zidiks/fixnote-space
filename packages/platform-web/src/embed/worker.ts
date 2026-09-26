/// <reference lib="webworker" />
import { env, type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers'
import { ortPaths } from '../ort'
import type { EmbedRequest, EmbedResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

export const MODEL = 'Xenova/multilingual-e5-small'

// Only the model is downloaded, once, then served from the browser cache (runtime: see ../ort).
env.allowLocalModels = false
env.useBrowserCache = true
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = await ortPaths()

let extractor: Promise<FeatureExtractionPipeline> | null = null

/**
 * One progress for the whole download: transformers.js reports each file (config, tokenizer,
 * weights) from 0 to 100 separately, which made the percentage jump back and forth. Bytes of all
 * files so far, never going backwards.
 */
function downloadProgress() {
  const files = new Map<string, { loaded: number; total: number }>()
  let shown = 0
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
    let loaded = 0
    let total = 0
    for (const f of files.values()) {
      loaded += f.loaded
      total += f.total
    }
    const next = Math.min(loaded / total, 1)
    // Whole percents only: fewer messages, no flicker.
    if (next - shown < 0.01 && next < 1) return
    shown = next
    self.postMessage({ kind: 'progress', progress: next } satisfies EmbedResponse)
  }
}

function load(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline('feature-extraction', MODEL, {
    // CPU everywhere: identical vectors on every device, so they stay comparable.
    device: 'wasm',
    dtype: 'q8',
    progress_callback: downloadProgress(),
  }) as Promise<FeatureExtractionPipeline>
  extractor.catch(() => {
    extractor = null
  })
  return extractor
}

self.onmessage = async (event: MessageEvent<EmbedRequest>) => {
  const req = event.data
  try {
    const model = await load()
    if (req.op === 'init') {
      self.postMessage({ kind: 'result', id: req.id, ok: true } satisfies EmbedResponse)
      return
    }
    const output = await model(req.texts, { pooling: 'mean', normalize: true })
    const [rows, dims] = output.dims as [number, number]
    const data = output.data as Float32Array
    const vectors = Array.from({ length: rows }, (_, i) => data.slice(i * dims, (i + 1) * dims))
    self.postMessage({ kind: 'result', id: req.id, ok: true, vectors } satisfies EmbedResponse, {
      transfer: vectors.map((v) => v.buffer),
    })
  } catch (err) {
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies EmbedResponse)
  }
}
