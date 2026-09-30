import {
  buildCallMergeMessages,
  buildCallMessages,
  type CallWriteUp,
  type ChatMessage,
  parseCallReply,
  splitTranscript,
  streamChat,
} from '@fixnote/ai'
import {
  type CallPiece,
  callNoteMarkdown,
  callTurns,
  dropEcho,
  type Speaker,
  type SystemAudio,
  type Transcriber,
  transcriptText,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { toast } from 'sonner'
import { create } from 'zustand'
import { llm } from '../assistant/llm'
import { aiRefusalText } from '../plan'
import { MicrophoneError, Recorder } from './recorder'
import { RATE, Segmenter, wav } from './segments'

/**
 * Call notes: the microphone ("me") and what the computer plays ("them", `SystemAudio`) are
 * transcribed on the device while the call goes on, each cut at its pauses; when it ends, the
 * model writes the summary, decisions and tasks, and the note keeps the transcript folded below.
 * Audio is never stored and never leaves the device; only the transcript goes to the model.
 */

export type CallStatus = 'idle' | 'recording' | 'transcribing' | 'summarizing'

interface CallState {
  status: CallStatus
  startedAt: number
  /** Input levels, 0..1, while recording. */
  me: number
  them: number
  /** Pieces still to transcribe after the call ended. */
  left: number
}

export const useCall = create<CallState>()(() => ({
  status: 'idle',
  startedAt: 0,
  me: 0,
  them: 0,
  left: 0,
}))

const set = useCall.setState

interface Deps {
  transcriber: () => Promise<Transcriber>
  systemAudio?: SystemAudio
  /** Dictation is running: a call waits for it. */
  dictating: () => boolean
  /** Saves the call's note and opens it. */
  save: (markdown: string) => Promise<void>
}

let deps: Deps | null = null

export function setCallDeps(d: Deps) {
  deps = d
}

/** A long meeting, not a day: recording stops by itself after this. */
const MAX_CALL_MS = 4 * 3600_000

/** Transcribes the pieces of both sides in the order they come, one at a time. */
class CallTranscripts {
  readonly pieces: CallPiece[] = []
  private chain: Promise<void> = Promise.resolve()
  private waiting = 0
  private language: string | null = null

  constructor(
    private readonly transcriber: () => Promise<Transcriber>,
    private readonly prefer: string,
  ) {}

  add(speaker: Speaker, pcm: Float32Array, endMs: number) {
    const startMs = Math.max(0, endMs - (pcm.length / RATE) * 1000)
    const audio = wav(pcm, RATE)
    this.waiting++
    this.chain = this.chain.then(async () => {
      try {
        const tr = await this.transcriber()
        await tr.ready()
        const r = await tr.transcribe(
          audio,
          this.language ? { language: this.language } : { prefer: this.prefer },
        )
        const text = r.text.trim()
        // The language is settled by the first real sentence, not by "hello?".
        if (!this.language && text.split(/\s+/).length >= 5) this.language = r.language
        if (text) this.pieces.push({ speaker, startMs, endMs, text })
      } catch {
        // One piece lost; the rest of the call still counts.
      } finally {
        this.waiting--
        if (useCall.getState().status === 'transcribing') set({ left: this.waiting })
      }
    })
  }

  get left() {
    return this.waiting
  }

  async done(): Promise<CallPiece[]> {
    await this.chain
    return this.pieces
  }
}

interface Session {
  mic: Recorder
  system?: SystemAudio
  transcripts: CallTranscripts
  started: number
  limit: ReturnType<typeof setTimeout>
  /** Hands over what the computer played since the last pause, at the end. */
  flushThem?: () => void
}

let session: Session | null = null

const rms = (pcm: Float32Array) => {
  let sum = 0
  for (const v of pcm) sum += v * v
  return pcm.length ? Math.sqrt(sum / pcm.length) : 0
}

export async function startCall() {
  if (!deps || session || useCall.getState().status !== 'idle') return
  const d = deps
  if (d.dictating()) return
  const started = performance.now()
  const since = () => performance.now() - started
  const transcripts = new CallTranscripts(d.transcriber, i18n.language.slice(0, 2))
  const mic = new Recorder()
  const current: Session = {
    mic,
    ...(d.systemAudio ? { system: d.systemAudio } : {}),
    transcripts,
    started,
    limit: setTimeout(() => void stopCall(), MAX_CALL_MS),
  }
  session = current
  set({ status: 'recording', startedAt: Date.now(), me: 0, them: 0, left: 0 })
  try {
    await mic.start(
      (level) => set({ me: level }),
      (pcm) => transcripts.add('me', pcm, since()),
      { keep: false, dropSilent: true },
    )
    if (d.systemAudio) {
      const them = new Segmenter({ dropSilent: true })
      let heard = 0
      await d.systemAudio.start(
        (pcm) => {
          if (session !== current) return
          const level = rms(pcm)
          set({ them: Math.min(1, level * 4) })
          heard += pcm.length
          const piece = them.push(pcm, level, (heard / RATE) * 1000)
          if (piece) transcripts.add('them', piece, since())
        },
        () => {
          if (session === current) toast(i18n.t('call.soundLost'))
        },
      )
      // What is left when the call ends.
      current.flushThem = () => {
        const rest = them.flush()
        if (rest) transcripts.add('them', rest, since())
      }
    }
  } catch (err) {
    clearTimeout(current.limit)
    mic.cancel()
    void d.systemAudio?.stop().catch(() => undefined)
    session = null
    set({ status: 'idle', me: 0, them: 0 })
    const message =
      err instanceof MicrophoneError && err.reason !== 'other'
        ? i18n.t(err.reason === 'denied' ? 'voice.noMic' : 'voice.missingMic')
        : i18n.t('call.failed', { message: err instanceof Error ? err.message : String(err) })
    toast.error(message)
    return
  }
  toast(i18n.t('call.started'), { duration: 10_000 })
  // Load the speech model while people talk, so the first pieces do not wait for it.
  void d
    .transcriber()
    .then((tr) => tr.ready())
    .catch(() => undefined)
}

/** Stops recording and discards the call. */
export function cancelCall() {
  const current = session
  if (!current) return
  session = null
  clearTimeout(current.limit)
  current.mic.cancel()
  void current.system?.stop().catch(() => undefined)
  set({ status: 'idle', me: 0, them: 0, left: 0 })
}

/** Ends the call: the rest is transcribed, written up and saved as a note. */
export async function stopCall() {
  const current = session
  if (!current || !deps) return
  const d = deps
  session = null
  clearTimeout(current.limit)
  const durationMs = performance.now() - current.started
  const startedAt = useCall.getState().startedAt
  await current.system?.stop().catch(() => undefined)
  current.flushThem?.()
  // The microphone's last piece goes to the transcripts as it stops.
  await current.mic.stop()
  set({ status: 'transcribing', me: 0, them: 0, left: current.transcripts.left })
  try {
    const pieces = dropEcho(await current.transcripts.done())
    const turns = callTurns(pieces)
    if (!turns.length) {
      toast(i18n.t('call.empty'))
      return
    }
    set({ status: 'summarizing' })
    const summary = await writeUp(transcriptText(turns, { me: 'Me', them: 'Them' }))
    const markdown = callNoteMarkdown({
      title: i18n.t('call.title', {
        date: new Intl.DateTimeFormat(i18n.language, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(startedAt),
        duration: duration(durationMs),
      }),
      summary,
      turns,
      labels: {
        me: i18n.t('call.me'),
        them: i18n.t('call.them'),
        summary: i18n.t('call.summary'),
        decisions: i18n.t('call.decisions'),
        tasks: i18n.t('call.tasks'),
        transcript: i18n.t('call.transcript'),
      },
    })
    await d.save(markdown)
    toast(i18n.t('call.saved'))
  } catch (err) {
    toast.error(
      i18n.t('call.failed', { message: err instanceof Error ? err.message : String(err) }),
    )
  } finally {
    set({ status: 'idle', left: 0 })
  }
}

export function duration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 60_000))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? i18n.t('call.hours', { h, m }) : i18n.t('call.minutes', { m })
}

/** The model's summary; null (and a note saying why) when there is no model or it failed. */
async function writeUp(transcript: string): Promise<CallWriteUp | null> {
  const reach = await llm()
  if (!reach.ok) {
    toast(
      i18n.t('call.summaryFailed', { message: i18n.t(`aiProvider.unavailable.${reach.reason}`) }),
      { duration: 10_000 },
    )
    return null
  }
  const ask = async (messages: ChatMessage[]) => {
    let reply = ''
    for await (const delta of streamChat({
      ...reach.route,
      messages,
      temperature: 0.2,
      maxTokens: 2000,
    })) {
      reply += delta
    }
    return parseCallReply(reply)
  }
  try {
    const chunks = splitTranscript(transcript)
    if (chunks.length === 1) return await ask(buildCallMessages(transcript))
    const parts: CallWriteUp[] = []
    for (const chunk of chunks) {
      const part = await ask(buildCallMessages(chunk))
      if (part) parts.push(part)
    }
    return parts.length ? await ask(buildCallMergeMessages(parts)) : null
  } catch (err) {
    toast.error(
      i18n.t('call.summaryFailed', {
        message: aiRefusalText(err) ?? (err instanceof Error ? err.message : String(err)),
      }),
      { duration: 10_000 },
    )
    return null
  }
}
