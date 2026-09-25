import type { ProgressListener, Transcriber } from '@fixnote/core'
import type { WhisperBody, WhisperResponse } from './protocol'

type Result = Extract<WhisperResponse, { kind: 'result'; ok: true }>

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

/**
 * Whisper in a dedicated worker, shared by the web and desktop apps. Nothing leaves the device;
 * the model is fetched once and then served from the browser cache.
 */
export function createWhisperTranscriber(): Transcriber {
  let worker: Worker | null = null
  let nextId = 1
  const pending = new Map<number, { resolve: (v: Result) => void; reject: (e: Error) => void }>()
  const listeners = new Set<ProgressListener>()
  let ready: Promise<void> | null = null

  const start = () => {
    if (worker) return worker
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'fixnote-whisper',
    })
    worker.onmessage = (e: MessageEvent<WhisperResponse>) => {
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
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Speech worker failed'))
      pending.clear()
      worker?.terminate()
      worker = null
      ready = null
    }
    return worker
  }

  const call = (body: WhisperBody, transfer: Transferable[] = []) =>
    new Promise<Result>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      start().postMessage({ ...body, id }, transfer)
    })

  const transcriber: Transcriber = {
    modelId: 'onnx-community/whisper-base',
    local: true,
    ready(onProgress) {
      if (onProgress) listeners.add(onProgress)
      ready ??= call({ op: 'init' }).then(() => undefined)
      ready.catch(() => {
        ready = null
      })
      return ready
    },
    async transcribe(audio, opts) {
      const samples = await decodeAudio(audio)
      await transcriber.ready()
      const started = performance.now()
      const res = await call(
        {
          op: 'transcribe',
          audio: samples,
          ...(opts?.language ? { language: opts.language } : {}),
        },
        [samples.buffer],
      )
      return {
        text: res.text ?? '',
        language: opts?.language ?? 'auto',
        durationMs: Math.round(performance.now() - started),
      }
    },
  }
  return transcriber
}
