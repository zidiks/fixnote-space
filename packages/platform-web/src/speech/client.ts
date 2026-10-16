import {
  type ProgressListener,
  RUSSIAN_SPEECH_MODEL,
  SPEECH_MODELS,
  type Transcriber,
} from '@fixnote/core'
import type { SpeechBody, SpeechResponse } from './protocol'

type Result = Extract<SpeechResponse, { kind: 'result'; ok: true }>

const SAMPLE_RATE = 16_000

/** Decodes any recording the browser can play (webm/opus, ogg, mp3, wav) to 16 kHz mono. */
export async function decodeAudio(audio: Blob): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const buffer = await ctx.decodeAudioData(await audio.arrayBuffer())
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const out = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++)
      out[i] = (out[i] ?? 0) + (data[i] ?? 0) / buffer.numberOfChannels
  }
  return out
}

const MODEL_KEY = 'fixnote.speech-model'
const LANGUAGE_KEY = 'fixnote.speech-language'
const MODEL_IDS: string[] = Object.values(SPEECH_MODELS).map((m) => m.id)

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    // no storage (private window)
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // the choice lasts until the app closes
  }
}

/** The Whisper model the person picked in Settings, if they did. */
function storedModel(): string | null {
  const id = read(MODEL_KEY)
  return id && MODEL_IDS.includes(id) ? id : null
}

/** The app's language (App.tsx keeps it on <html lang>). */
const pageLanguage = () =>
  (globalThis.document?.documentElement.lang || globalThis.navigator?.language || 'en').slice(0, 2)

/**
 * Until the person picks one: `accurate` with WebGPU and a Russian interface (Whisper then only
 * hears the other languages, which a small model gets wrong), else `fast`. Known at once, so
 * Settings shows it right away; without a GPU adapter after all, the worker runs it on the CPU.
 */
function defaultModel(): string {
  const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  return pageLanguage() === 'ru' && gpu ? SPEECH_MODELS.accurate.id : SPEECH_MODELS.fast.id
}

/**
 * Speech recognition in a dedicated worker, shared by the web and desktop apps: GigaAM for
 * Russian, Whisper for other languages, Silero VAD in front of both. Nothing leaves the device;
 * the models are fetched once and then served from the browser cache.
 */
export function createSpeechTranscriber(): Transcriber {
  let worker: Worker | null = null
  let nextId = 1
  const pending = new Map<number, { resolve: (v: Result) => void; reject: (e: Error) => void }>()
  const listeners = new Set<ProgressListener>()
  const loads = new Map<string, Promise<void>>()
  let model = storedModel() ?? defaultModel()

  const start = () => {
    if (worker) return worker
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'fixnote-speech',
    })
    worker.onmessage = (e: MessageEvent<SpeechResponse>) => {
      const msg = e.data
      if (msg.kind === 'progress') {
        for (const l of listeners) l(msg.progress)
        return
      }
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.ok) p.resolve(msg)
      else p.reject(new Error(msg.error))
    }
    worker.onerror = (e) => fail(new Error(e.message || 'Speech worker failed'))
    return worker
  }

  /** Every open request fails and the next one starts a fresh worker. */
  const fail = (error: Error) => {
    for (const p of pending.values()) p.reject(error)
    pending.clear()
    worker?.terminate()
    worker = null
    loads.clear()
  }

  const call = (body: SpeechBody, transfer: Transferable[] = []) =>
    new Promise<Result>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      start().postMessage({ ...body, id }, transfer)
    })

  /** The language the next dictation will likely be in. */
  const expected = (prefer?: string) => read(LANGUAGE_KEY) ?? prefer ?? pageLanguage()

  const prepare = (id: string, onProgress?: ProgressListener) => {
    let loading = loads.get(id)
    if (!loading) {
      const current = call({ op: 'init', model: id }).then(() => undefined)
      loading = current
      loads.set(id, current)
      current.catch(() => {
        if (loads.get(id) === current) loads.delete(id)
      })
    }
    if (onProgress) {
      listeners.add(onProgress)
      const done = () => listeners.delete(onProgress)
      loading.then(done, done)
    }
    return loading
  }

  const transcriber: Transcriber = {
    get modelId() {
      return model
    },
    local: true,
    ready(onProgress) {
      return prepare(expected() === 'ru' ? RUSSIAN_SPEECH_MODEL.id : model, onProgress)
    },
    prepare,
    setModel(id) {
      if (id === model || !MODEL_IDS.includes(id)) return
      model = id
      loads.delete(id)
      write(MODEL_KEY, id)
    },
    unload() {
      fail(new Error('The speech model was removed'))
    },
    async transcribe(audio, opts) {
      const samples = await decodeAudio(audio)
      const started = performance.now()
      const res = await call(
        {
          op: 'transcribe',
          whisper: model,
          audio: samples,
          ...(opts?.language ? { language: opts.language } : { prefer: expected(opts?.prefer) }),
          ...(opts?.languages ? { languages: opts.languages } : {}),
          ...(opts?.prompt ? { prompt: opts.prompt } : {}),
        },
        [samples.buffer],
      )
      const text = res.text ?? ''
      const language = res.language ?? opts?.language ?? 'auto'
      if (text && language !== 'auto') write(LANGUAGE_KEY, language)
      return {
        text,
        language,
        durationMs: Math.round(performance.now() - started),
        ...(res.model ? { modelId: res.model } : {}),
      }
    },
  }
  return transcriber
}
