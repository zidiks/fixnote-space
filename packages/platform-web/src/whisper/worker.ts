/// <reference lib="webworker" />
import { type AutomaticSpeechRecognitionPipeline, env, pipeline } from '@huggingface/transformers'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import type { WhisperRequest, WhisperResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

/** Multilingual (ru/en/es and more), ~80 MB quantized; small enough to download on first use. */
export const MODEL = 'onnx-community/whisper-base'

env.allowLocalModels = false
env.useBrowserCache = true
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm }

type Device = 'webgpu' | 'wasm'

let asr: Promise<{ model: AutomaticSpeechRecognitionPipeline; device: Device }> | null = null

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

async function create(device: Device) {
  const model = (await pipeline('automatic-speech-recognition', MODEL, {
    device,
    // The GPU path runs the encoder in full precision (quantized encoders lose too much there);
    // the CPU path uses 8-bit weights to stay fast without threads.
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
    progress_callback: progressReporter(),
  })) as AutomaticSpeechRecognitionPipeline
  return { model, device }
}

function load() {
  asr ??= (async () => {
    if (await hasWebGpu()) {
      try {
        return await create('webgpu')
      } catch {
        // Driver or adapter trouble: the CPU path is slower but works everywhere.
      }
    }
    return create('wasm')
  })()
  asr.catch(() => {
    asr = null
  })
  return asr
}

self.onmessage = async (event: MessageEvent<WhisperRequest>) => {
  const req = event.data
  try {
    const { model, device } = await load()
    if (req.op === 'init') {
      self.postMessage({ kind: 'result', id: req.id, ok: true, device } satisfies WhisperResponse)
      return
    }
    const output = await model(req.audio, {
      task: 'transcribe',
      // Unset: Whisper detects the language itself, so mixed ru/en/es dictation just works.
      ...(req.language ? { language: req.language } : {}),
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    const text = (Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text).trim()
    self.postMessage({ kind: 'result', id: req.id, ok: true, text } satisfies WhisperResponse)
  } catch (err) {
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WhisperResponse)
  }
}
