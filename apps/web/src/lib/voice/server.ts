import type { ProgressListener, Transcriber, TranscriptionResult } from '@fixnote/core'
import { create } from 'zustand'
import { accessToken } from '../account/account'
import { useLlm } from '../assistant/llm'
import { env } from '../env'
import { usePlan } from '../plan'
import { platform } from '../platform'

/**
 * FixNote's voice server (services/voice): speech to text with Whisper and the assistant's voice
 * with Piper, on a server of ours, for Pro. Faster than the device on weak computers, and a voice
 * that sounds better than the system's. Nothing is kept there. Whenever it cannot be used (Free,
 * signed out, local-only mode, turned off, unreachable) everything happens on the device, as before.
 */

const OFF_KEY = 'fixnote.voice-server'
/** A phrase is short; past this the device takes over rather than keep the person waiting. */
const STT_TIMEOUT_MS = 20_000
const TTS_TIMEOUT_MS = 10_000

function storedWanted(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Whether this device uses the voice server (the person can turn it off in Settings). */
export const useVoiceServer = create<{ wanted: boolean }>(() => ({ wanted: storedWanted() }))

export function setVoiceServerWanted(wanted: boolean) {
  try {
    localStorage.setItem(OFF_KEY, wanted ? 'on' : 'off')
  } catch {
    // Private mode: it holds until reload.
  }
  useVoiceServer.setState({ wanted })
}

/** The server may be used now, as far as can be told without asking it. */
export function voiceServerAvailable(): boolean {
  return Boolean(
    env.voiceUrl &&
      useVoiceServer.getState().wanted &&
      !useLlm.getState().localOnly &&
      usePlan.getState().info?.plan === 'pro',
  )
}

async function route(): Promise<{ url: string; headers: Record<string, string> } | null> {
  if (!voiceServerAvailable() || !env.voiceUrl) return null
  const token = await accessToken()
  return token ? { url: env.voiceUrl, headers: { Authorization: `Bearer ${token}` } } : null
}

/** Speech to text on the server; null when it cannot be used or did not answer. */
async function serverTranscribe(
  audio: Blob,
  opts: { language?: string; languages?: string[]; prefer?: string } | undefined,
): Promise<TranscriptionResult | null> {
  const r = await route()
  if (!r) return null
  const q = new URLSearchParams()
  if (opts?.language) q.set('language', opts.language)
  if (opts?.languages?.length) q.set('languages', opts.languages.join(','))
  if (opts?.prefer) q.set('prefer', opts.prefer)
  const started = performance.now()
  try {
    const res = await fetch(`${r.url}/stt?${q}`, {
      method: 'POST',
      headers: { ...r.headers, 'Content-Type': audio.type || 'application/octet-stream' },
      body: audio,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { text?: string; language?: string }
    return {
      text: body.text ?? '',
      language: body.language ?? opts?.language ?? 'auto',
      durationMs: Math.round(performance.now() - started),
    }
  } catch {
    return null
  }
}

let wrapped: Transcriber | null = null

/**
 * The transcriber for dictation, voice messages and the spoken conversation: the server when it
 * can be used (nothing to download then), otherwise, or when it fails, the model on the device.
 */
export async function voiceTranscriber(): Promise<Transcriber> {
  const device = await platform.transcriber()
  wrapped ??= {
    get modelId() {
      return device.modelId
    },
    get local() {
      return !voiceServerAvailable()
    },
    ready: (onProgress?: ProgressListener) =>
      voiceServerAvailable() ? Promise.resolve() : device.ready(onProgress),
    async transcribe(audio, opts) {
      return (await serverTranscribe(audio, opts)) ?? device.transcribe(audio, opts)
    },
    ...(device.setModel ? { setModel: (id: string) => device.setModel?.(id) } : {}),
    ...(device.unload ? { unload: () => device.unload?.() } : {}),
  }
  return wrapped
}

/**
 * The assistant's voice from the server (a WAV), or null when it cannot be used or failed, and the
 * system's speech synthesis says it instead.
 */
export async function serverSpeech(
  text: string,
  lang: string,
  signal: AbortSignal,
): Promise<ArrayBuffer | null> {
  const r = await route()
  if (!r) return null
  try {
    const res = await fetch(`${r.url}/tts`, {
      method: 'POST',
      headers: { ...r.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: lang.slice(0, 2) }),
      signal: withTimeout(signal, TTS_TIMEOUT_MS),
    })
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

/** `signal`, or `ms` passing, whichever comes first (AbortSignal.any is missing in older WebKit). */
function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  const both = new AbortController()
  const stop = () => both.abort()
  if (signal.aborted) stop()
  signal.addEventListener('abort', stop, { once: true })
  setTimeout(stop, ms)
  return both.signal
}
