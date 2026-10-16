/// <reference lib="webworker" />
// Only these parts of core: the worker bundle stays small.
import { RUSSIAN_SPEECH_MODEL, SPEECH_MODELS, VOICE_ACTIVITY_MODEL } from '@fixnote/core/models'
import { cleanTranscript } from '@fixnote/core/speech'
import { type AutomaticSpeechRecognitionPipeline, env, pipeline } from '@huggingface/transformers'
// The same runtime transformers.js uses (one WebAssembly instance for all models here).
import * as ort from 'onnxruntime-web/webgpu'
import { ortPaths } from '../ort'
import { fetchFile, hubUrl } from './files'
import { GIGAAM_FILES, GigaAm } from './gigaam'
import type { SpeechRequest, SpeechResponse } from './protocol'
import { SileroVad, trimToSpeech } from './vad'
import { DEFAULT_LANGUAGES, transcribe as whisperTranscribe } from './whisper'

declare const self: DedicatedWorkerGlobalScope

env.allowLocalModels = false
env.useBrowserCache = true
/**
 * Where the ONNX runtime comes from, set before the first model loads. Not a top-level await: a
 * module worker that is still evaluating misses the first message in WebKit (macOS), so the
 * handler below must be in place from the start.
 */
const runtime = (async () => {
  const paths = await ortPaths()
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = paths
  ort.env.wasm.wasmPaths = paths
})()

type Device = 'webgpu' | 'wasm'

type Loaded = { model: AutomaticSpeechRecognitionPipeline; device: Device }

/** The Whisper model in memory; one at a time (the other one is freed when the person switches). */
let asr: { id: string; loaded: Promise<Loaded> } | null = null
let gigaam: Promise<GigaAm> | null = null
let vad: Promise<SileroVad> | null = null

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return Boolean(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

/** Download progress summed over all files of a load, so the bar only moves forward. */
function progressReporter() {
  const files = new Map<string, { loaded: number; total: number }>()
  let last = 0
  return (file: string, loaded: number, total: number) => {
    if (!total) return
    files.set(file, { loaded, total })
    let sum = 0
    let all = 0
    for (const f of files.values()) {
      sum += f.loaded
      all += f.total
    }
    const progress = all ? sum / all : 0
    if (progress - last < 0.01 && progress < 1) return
    last = progress
    self.postMessage({ kind: 'progress', progress } satisfies SpeechResponse)
  }
}

/** Light models keep their encoder in full precision on the CPU too: 8 bits cost them words. */
const FULL_ENCODER_ON_CPU = new Set<string>([SPEECH_MODELS.light.id, SPEECH_MODELS.fast.id])

async function create(id: string, device: Device) {
  const report = progressReporter()
  const model = (await pipeline('automatic-speech-recognition', id, {
    device,
    // The GPU path runs the encoder in full precision (quantized encoders lose too much there).
    dtype:
      device === 'webgpu'
        ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
        : FULL_ENCODER_ON_CPU.has(id)
          ? { encoder_model: 'fp32', decoder_model_merged: 'q8' }
          : 'q8',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file) report(p.file, p.loaded ?? 0, p.total ?? 0)
    },
  })) as AutomaticSpeechRecognitionPipeline
  return { model, device }
}

function loadWhisper(id: string) {
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

/** Loads once and forgets a failed load, so the next use tries again. */
function once<T>(
  get: () => Promise<T> | null,
  set: (p: Promise<T> | null) => void,
  make: () => Promise<T>,
) {
  const existing = get()
  if (existing) return existing
  const loading = make()
  set(loading)
  loading.catch(() => {
    if (get() === loading) set(null)
  })
  return loading
}

const loadVad = (report = progressReporter()) =>
  once(
    () => vad,
    (p) => {
      vad = p
    },
    async () => {
      await runtime
      const url = hubUrl(VOICE_ACTIVITY_MODEL.id, 'onnx/model.onnx')
      return SileroVad.load(ort, await fetchFile(url, report))
    },
  )

const loadGigaam = (report = progressReporter()) =>
  once(
    () => gigaam,
    (p) => {
      gigaam = p
    },
    async () => {
      await runtime
      const [model, vocab] = await Promise.all([
        fetchFile(hubUrl(RUSSIAN_SPEECH_MODEL.id, GIGAAM_FILES.model), report),
        fetchFile(hubUrl(RUSSIAN_SPEECH_MODEL.id, GIGAAM_FILES.vocab), report),
      ])
      return GigaAm.load(ort, model, new TextDecoder().decode(vocab))
    },
  )

/**
 * Text GigaAM is not sure of: low confidence, or mostly Latin letters (it spells English that
 * way). Then Whisper says which language it really is.
 */
function doubtful(r: { text: string; confidence: number }): boolean {
  const letters = r.text.match(/\p{L}/gu)?.length ?? 0
  const latin = r.text.match(/[a-z]/giu)?.length ?? 0
  return r.confidence < 0.9 || (letters > 0 && latin / letters > 0.5)
}

type Transcribe = Extract<SpeechRequest, { op: 'transcribe' }>

async function russian(audio: Float32Array) {
  try {
    const r = await (await loadGigaam()).transcribe(audio)
    return { ...r, model: RUSSIAN_SPEECH_MODEL.id }
  } catch {
    // No GigaAM (offline on first use, no memory): Whisper still hears Russian.
    return null
  }
}

async function whisper(
  req: Transcribe,
  audio: Float32Array,
  language: string | undefined,
  prefer?: string,
  skip?: string,
) {
  const { model } = await loadWhisper(req.whisper)
  const r = await whisperTranscribe(
    model,
    audio,
    language,
    req.languages ?? DEFAULT_LANGUAGES,
    prefer,
    req.prompt,
    skip,
  )
  return { ...r, model: req.whisper }
}

/**
 * Russian goes to GigaAM, any other language to Whisper. The language is the one asked for, or
 * the expected one (`prefer`: the last dictation's, else the app's); when GigaAM is unsure or
 * Whisper hears Russian, the other model takes over.
 */
async function route(req: Transcribe): Promise<{ text: string; language: string; model?: string }> {
  let audio = req.audio
  const silero = await loadVad().catch(() => null)
  if (silero) {
    const speech = trimToSpeech(audio, await silero.spans(audio))
    if (!speech) return { text: '', language: req.language ?? req.prefer ?? 'en' }
    audio = speech
  }
  const expected = req.language ?? req.prefer
  if (expected === 'ru') {
    const ru = await russian(audio)
    if (ru && (req.language || !doubtful(ru))) return { ...ru, language: 'ru' }
    // Unsure: Whisper detects; if it hears Russian too, GigaAM's text stays.
    const other = await whisper(req, audio, ru ? undefined : 'ru', 'ru', ru ? 'ru' : undefined)
    if (ru && other.language === 'ru') return { ...ru, language: 'ru' }
    return other
  }
  const other = await whisper(req, audio, req.language, req.prefer, req.language ? undefined : 'ru')
  if (other.language !== 'ru' || other.text) return other
  return { ...((await russian(audio)) ?? (await whisper(req, audio, 'ru'))), language: 'ru' }
}

self.onmessage = async (event: MessageEvent<SpeechRequest>) => {
  const req = event.data
  try {
    if (req.op === 'init') {
      const report = progressReporter()
      if (req.model === RUSSIAN_SPEECH_MODEL.id) {
        await Promise.all([loadGigaam(report), loadVad(report).catch(() => null)])
        self.postMessage({
          kind: 'result',
          id: req.id,
          ok: true,
          device: 'wasm',
        } satisfies SpeechResponse)
        return
      }
      const [{ device }] = await Promise.all([
        loadWhisper(req.model),
        loadVad(report).catch(() => null),
      ])
      self.postMessage({ kind: 'result', id: req.id, ok: true, device } satisfies SpeechResponse)
      return
    }
    const r = await route(req)
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: true,
      text: cleanTranscript(r.text),
      language: r.language,
      ...(r.model ? { model: r.model } : {}),
    } satisfies SpeechResponse)
  } catch (err) {
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies SpeechResponse)
  }
}
