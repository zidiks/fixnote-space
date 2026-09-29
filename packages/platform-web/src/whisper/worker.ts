/// <reference lib="webworker" />
import { type AutomaticSpeechRecognitionPipeline, env, pipeline } from '@huggingface/transformers'
import { ortPaths } from '../ort'
import type { WhisperRequest, WhisperResponse } from './protocol'
import { DEFAULT_LANGUAGES, transcribe } from './transcribe'

declare const self: DedicatedWorkerGlobalScope

env.allowLocalModels = false
env.useBrowserCache = true
/**
 * Where the ONNX runtime comes from, set before the first model loads. Not a top-level await: a
 * module worker that is still evaluating misses the first message in WebKit (macOS), so the
 * handler below must be in place from the start.
 */
const runtime = (async () => {
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = await ortPaths()
})()

type Device = 'webgpu' | 'wasm'

type Loaded = { model: AutomaticSpeechRecognitionPipeline; device: Device }

/** The model in memory; one at a time (the other one is freed when the person switches). */
let asr: { id: string; loaded: Promise<Loaded> } | null = null

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return Boolean(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

/** Download progress summed over all model files, so the bar only moves forward. */
function progressReporter() {
  const files = new Map<string, { loaded: number; total: number }>()
  let last = 0
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
    let loaded = 0
    let total = 0
    for (const f of files.values()) {
      loaded += f.loaded
      total += f.total
    }
    const progress = total ? loaded / total : 0
    if (progress - last < 0.01 && progress < 1) return
    last = progress
    self.postMessage({ kind: 'progress', progress } satisfies WhisperResponse)
  }
}

async function create(id: string, device: Device) {
  const model = (await pipeline('automatic-speech-recognition', id, {
    device,
    // The GPU path runs the encoder in full precision (quantized encoders lose too much there);
    // the CPU path uses 8-bit weights to stay fast without threads.
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
    progress_callback: progressReporter(),
  })) as AutomaticSpeechRecognitionPipeline
  return { model, device }
}

function load(id: string) {
  if (asr?.id === id) return asr.loaded
  if (asr) {
    const previous = asr.loaded
    previous.then(({ model }) => model.dispose()).catch(() => {})
  }
  const loaded = (async () => {
    await runtime
    if (await hasWebGpu()) {
      try {
        return await create(id, 'webgpu')
      } catch {
        // Driver or adapter trouble: the CPU path is slower but works everywhere.
      }
    }
    return create(id, 'wasm')
  })()
  const current = { id, loaded }
  asr = current
  loaded.catch(() => {
    if (asr === current) asr = null
  })
  return loaded
}

self.onmessage = async (event: MessageEvent<WhisperRequest>) => {
  const req = event.data
  try {
    const { model, device } = await load(req.model)
    if (req.op === 'init') {
      self.postMessage({ kind: 'result', id: req.id, ok: true, device } satisfies WhisperResponse)
      return
    }
    const { text, language } = await transcribe(
      model,
      req.audio,
      req.language,
      req.languages ?? DEFAULT_LANGUAGES,
      req.prefer,
    )
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: true,
      text,
      language,
    } satisfies WhisperResponse)
  } catch (err) {
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WhisperResponse)
  }
}
