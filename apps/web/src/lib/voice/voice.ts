import { type ModelInfo, SPEECH_MODELS, type Transcriber } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { toast } from 'sonner'
import { create } from 'zustand'
import { useCall } from './call'
import { MAX_RECORDING_MS, MicrophoneError, Recorder } from './recorder'
import { RATE, wav } from './segments'

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
let pieces: Pieces | null = null
/** The model was loaded before the person stopped: the wait after it is the model's speed. */
let modelReady = false
let limitTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Transcribes a dictation piece by piece while it is being recorded (cut at pauses, see
 * `Segmenter`): the first piece finds the language, the others keep it. When the person stops,
 * only the last piece is left, so the text comes almost at once however long they spoke.
 */
class Pieces {
  private texts: string[] = []
  private chain: Promise<void> = Promise.resolve()
  private failed = false
  private language: string | null = null
  private count = 0

  constructor(
    private readonly transcriber: () => Promise<Transcriber>,
    private readonly prefer: string,
  ) {}

  add(pcm: Float32Array) {
    const i = this.count++
    const audio = wav(pcm, RATE)
    this.chain = this.chain.then(async () => {
      if (this.failed) return
      try {
        const tr = await this.transcriber()
        await tr.ready()
        const r = await tr.transcribe(
          audio,
          this.language ? { language: this.language } : { prefer: this.prefer },
        )
        this.language ??= r.language
        this.texts[i] = r.text.trim()
      } catch {
        this.failed = true
      }
    })
  }

  /** The whole text; null when there were no pieces or one failed (then the recording is used). */
  async done(): Promise<{ text: string; language: string } | null> {
    await this.chain
    if (this.failed || !this.count) return null
    return { text: this.texts.filter(Boolean).join(' '), language: this.language ?? this.prefer }
  }
}

/** Waiting longer than this for the text after stopping counts as slow. */
const SLOW_MS = 4000
const SPEED_KEY = 'fixnote.dictation-speed'
const OFFERED_KEY = 'fixnote.lighter-offered'
/** Lightest first. */
const SPEECH_ORDER: readonly ModelInfo[] = [
  SPEECH_MODELS.light,
  SPEECH_MODELS.fast,
  SPEECH_MODELS.accurate,
]

/**
 * Two slow dictations out of the last three with the same model: offer the next lighter one, once
 * per model (it can also be chosen in Settings → Advanced).
 */
function noteSpeed(tr: Transcriber, waitedMs: number) {
  const at = SPEECH_ORDER.findIndex((m) => m.id === tr.modelId)
  const lighter = at > 0 ? SPEECH_ORDER[at - 1] : undefined
  if (!lighter || !tr.setModel) return
  try {
    const saved = JSON.parse(localStorage.getItem(SPEED_KEY) ?? 'null') as {
      model: string
      slow: boolean[]
    } | null
    const slow = [...(saved?.model === tr.modelId ? saved.slow : []), waitedMs > SLOW_MS].slice(-3)
    localStorage.setItem(SPEED_KEY, JSON.stringify({ model: tr.modelId, slow }))
    if (slow.filter(Boolean).length < 2 || localStorage.getItem(OFFERED_KEY) === tr.modelId) return
    localStorage.setItem(OFFERED_KEY, tr.modelId)
  } catch {
    return
  }
  const key = (Object.keys(SPEECH_MODELS) as (keyof typeof SPEECH_MODELS)[]).find(
    (k) => SPEECH_MODELS[k].id === lighter.id,
  )
  const name = key ? i18n.t(`models.${key}`) : lighter.id
  toast(i18n.t('voice.slow', { name }), {
    duration: 15_000,
    action: {
      label: i18n.t('voice.slowAction'),
      onClick: () => {
        tr.setModel?.(lighter.id)
        // Fetched now, so the next dictation does not wait for it.
        void tr.ready().catch(() => undefined)
        toast(i18n.t('voice.slowDone', { name }))
      },
    },
  })
}

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
  // A call is being recorded: the microphone is taken.
  if (status !== 'idle' || !deps || useCall.getState().status !== 'idle') return
  const d = deps
  const rec = new Recorder()
  recorder = rec
  set({ status: 'recording', target, level: 0, startedAt: Date.now() })
  levels = []
  const piecesNow = new Pieces(d.transcriber, i18n.language.slice(0, 2))
  pieces = piecesNow
  modelReady = false
  try {
    await rec.start(
      (level) => {
        levels.push(level)
        set({ level })
      },
      (pcm) => piecesNow.add(pcm),
    )
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
    .then(() => {
      if (recorder === rec) modelReady = true
    })
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
  const ready = modelReady
  const piecesNow = pieces
  pieces = null
  set({ status: 'transcribing', level: 0 })
  const stoppedAt = performance.now()
  try {
    // The last piece goes to `pieces` as it stops; the others are mostly done by now.
    const audio = await rec.stop()
    const transcriber = await d.transcriber()
    const { text, language } =
      (await piecesNow?.done()) ??
      (await transcriber.transcribe(audio, { prefer: i18n.language.slice(0, 2) }))
    set({ status: 'idle', download: null })
    if (ready) noteSpeed(transcriber, performance.now() - stoppedAt)
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
  pieces = null
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
