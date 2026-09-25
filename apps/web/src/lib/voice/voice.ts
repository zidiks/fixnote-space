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

type Sink = (text: string) => void

interface Deps {
  transcriber: () => Promise<Transcriber>
  /** Saves a transcript as a new note in the Inbox and opens it. */
  createNote: (text: string) => Promise<void>
}

let deps: Deps | null = null
const sinks: { note?: Sink; chat?: Sink } = {}
let recorder: Recorder | null = null
let limitTimer: ReturnType<typeof setTimeout> | undefined

export function setVoiceDeps(d: Deps) {
  deps = d
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
  try {
    await rec.start((level) => set({ level }))
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
  const { target } = useVoice.getState()
  set({ status: 'transcribing', level: 0 })
  try {
    const audio = await rec.stop()
    const transcriber = await d.transcriber()
    const { text } = await transcriber.transcribe(audio)
    set({ status: 'idle', download: null })
    await deliver(text.trim(), target, d)
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

async function deliver(text: string, target: VoiceTarget, d: Deps) {
  if (!text) {
    toast(i18n.t('voice.empty'))
    return
  }
  const sink =
    target === 'chat' ? sinks.chat : target === 'note' || target === 'auto' ? sinks.note : undefined
  if (sink) sink(text)
  else await d.createNote(text)
}
