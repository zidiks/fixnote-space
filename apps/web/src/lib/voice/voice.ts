import type { Transcriber } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { toast } from 'sonner'
import { create } from 'zustand'
import { MAX_RECORDING_MS, MicrophoneError, Recorder } from './recorder'

/**
 * Where a transcript goes. `auto`: into the open note if there is one, else a new note.
 * `chat`: into the assistant's input, to edit and send.
 */
export type VoiceTarget = 'auto' | 'note' | 'chat' | 'new-note'

export type VoiceStatus = 'idle' | 'recording' | 'transcribing'

interface VoiceState {
  status: VoiceStatus
  target: VoiceTarget
  /** Microphone input level, 0..1, while recording. */
  level: number
  startedAt: number
  /** Model download progress (first use only), null when not downloading. */
  download: number | null
}

export const useVoice = create<VoiceState>()(() => ({
  status: 'idle',
  target: 'auto',
  level: 0,
  startedAt: 0,
  download: null,
}))

const set = useVoice.setState

/** What a recording became: its transcript, and the recording itself for those who keep it. */
export interface Dictation {
  text: string
  audio: Blob
  durationMs: number
  /** Loudness over time, 0..1, for a waveform. */
  peaks: number[]
  language: string
}

type Sink = (dictation: Dictation) => void

/** How many bars a voice message's waveform has. */
const PEAKS = 36

/** Loudness samples taken while recording, squeezed into `PEAKS` bars. */
export function toPeaks(levels: number[]): number[] {
  if (!levels.length) return []
  const out: number[] = []
  for (let i = 0; i < PEAKS; i++) {
    const from = Math.floor((i * levels.length) / PEAKS)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / PEAKS))
    out.push(Math.min(1, Math.max(...levels.slice(from, to))))
  }
  return out
}

let levels: number[] = []

interface Deps {
  transcriber: () => Promise<Transcriber>
  /** Saves a transcript as a new note in the Inbox and opens it. */
  createNote: (text: string) => Promise<void>
}

let deps: Deps | null = null
const sinks: { note?: Sink; chat?: Sink } = {}
let recorder: Recorder | null = null
let limitTimer: ReturnType<typeof setTimeout> | undefined

const USED_KEY = 'fixnote.voice-used'
const WARM_AFTER_MS = 3000

export function setVoiceDeps(d: Deps) {
  deps = d
  prewarm(d)
}

/**
 * Someone who dictated before will likely again: load the model a few seconds after start, so
 * the first phrase does not wait for it. Nobody else downloads anything.
 */
function prewarm(d: Deps) {
  try {
    if (!localStorage.getItem(USED_KEY)) return
  } catch {
    return
  }
  setTimeout(() => {
    if (useVoice.getState().status !== 'idle') return
    void d
      .transcriber()
      .then((tr) => tr.ready())
      .catch(() => undefined)
  }, WARM_AFTER_MS)
}

/** The open note (or the chat) takes transcripts while mounted. */
export function registerVoiceSink(kind: 'note' | 'chat', sink: Sink): () => void {
  sinks[kind] = sink
  return () => {
    if (sinks[kind] === sink) delete sinks[kind]
  }
}

/** Starts dictation; calling it again while recording stops and transcribes. */
export async function toggleVoice(target: VoiceTarget = 'auto') {
  const { status } = useVoice.getState()
  if (status === 'recording') return stopVoice()
  if (status !== 'idle' || !deps) return
  const d = deps
  const rec = new Recorder()
  recorder = rec
  set({ status: 'recording', target, level: 0, startedAt: Date.now() })
  levels = []
  try {
    await rec.start((level) => {
      levels.push(level)
      set({ level })
    })
  } catch (err) {
    recorder = null
    set({ status: 'idle' })
    if (err instanceof MicrophoneError && err.reason !== 'other') {
      toast.error(i18n.t(err.reason === 'denied' ? 'voice.noMic' : 'voice.missingMic'))
    } else {
      toast.error(
        i18n.t('voice.failed', { message: err instanceof Error ? err.message : String(err) }),
      )
    }
    return
  }
  clearTimeout(limitTimer)
  limitTimer = setTimeout(() => void stopVoice(), MAX_RECORDING_MS)
  // Fetch or warm up the model while the user speaks, so the transcript comes right after.
  void d
    .transcriber()
    .then((tr) =>
      tr.ready((p) => set({ download: p < 1 ? p : null })).finally(() => set({ download: null })),
    )
    .catch(() => undefined)
}

export async function stopVoice() {
  const rec = recorder
  if (!rec || !deps) return
  const d = deps
  recorder = null
  clearTimeout(limitTimer)
  const { target, startedAt } = useVoice.getState()
  const durationMs = Date.now() - startedAt
  const peaks = toPeaks(levels)
  set({ status: 'transcribing', level: 0 })
  try {
    const audio = await rec.stop()
    const transcriber = await d.transcriber()
    const { text, language } = await transcriber.transcribe(audio, {
      prefer: i18n.language.slice(0, 2),
    })
    set({ status: 'idle', download: null })
    try {
      localStorage.setItem(USED_KEY, '1')
    } catch {
      // private window: no warm start next time, nothing else changes
    }
    await deliver({ text: text.trim(), audio, durationMs, peaks, language }, target, d)
  } catch (err) {
    set({ status: 'idle', download: null })
    toast.error(
      i18n.t('voice.failed', { message: err instanceof Error ? err.message : String(err) }),
    )
  }
}

export function cancelVoice() {
  clearTimeout(limitTimer)
  recorder?.cancel()
  recorder = null
  set({ status: 'idle', level: 0 })
}

async function deliver(dictation: Dictation, target: VoiceTarget, d: Deps) {
  if (!dictation.text) {
    toast(i18n.t('voice.empty'))
    return
  }
  const sink =
    target === 'chat' ? sinks.chat : target === 'note' || target === 'auto' ? sinks.note : undefined
  if (sink) sink(dictation)
  else await d.createNote(dictation.text)
}
