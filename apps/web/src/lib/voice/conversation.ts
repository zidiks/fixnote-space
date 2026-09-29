import { type ChatScope, type Transcriber, voiceBlobKey } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { toast } from 'sonner'
import { create } from 'zustand'
import { answerConfirm, ask, useAssistant } from '../assistant/assistant'
import { platform } from '../platform'
import { LiveMic, type Phrase } from './live-mic'
import { MicrophoneError } from './recorder'
import { serverSpeech, voiceTranscriber } from './server'
import { fillerFor, Sentences, Speaker, yesNo, yesOrNo } from './speech'
import { toPeaks } from './voice'

/**
 * A spoken conversation with the assistant: it listens (loudness VAD), transcribes on the device,
 * asks the assistant as a voice message, and reads the answer aloud sentence by sentence as it
 * streams, in the language the person spoke. Honest about waiting: a short "let me check" when the
 * answer takes a moment.
 */
export type TalkPhase =
  | 'off'
  | 'starting'
  | 'listening'
  | 'hearing'
  | 'transcribing'
  | 'thinking'
  | 'speaking'

interface TalkState {
  phase: TalkPhase
  /** Microphone level, 0..1. */
  level: number
  /** Speech model download (first use only). */
  download: number | null
}

export const useTalk = create<TalkState>()(() => ({ phase: 'off', level: 0, download: null }))
const set = useTalk.setState

/** Without any answer text by then, a short phrase says the assistant is on it. */
const FILLER_AFTER_MS = 1200

let mic: LiveMic | null = null
let transcriber: Transcriber | null = null
let scopeOf: () => ChatScope = () => ({ kind: 'all' })
const speaker = new Speaker(serverSpeech)
/** Changes when the conversation stops or is interrupted: late work from before then is dropped. */
let generation = 0
/** The language the person spoke last (the answer is read in it). */
let lang = (i18n.language || 'en').slice(0, 2)
/** Waiting for a spoken yes or no to a change the assistant asks about. */
let confirming: { tries: number } | null = null

const listen = () => {
  if (useTalk.getState().phase === 'off') return
  set({ phase: 'listening' })
  mic?.resume()
}

/** Starts the conversation: the speech model (downloads once) and the microphone. */
export async function startTalk(scope: () => ChatScope): Promise<void> {
  if (useTalk.getState().phase !== 'off') return
  scopeOf = scope
  generation++
  lang = (i18n.language || 'en').slice(0, 2)
  set({ phase: 'starting', download: null, level: 0 })
  try {
    transcriber = await voiceTranscriber()
    await transcriber.ready((p) => set({ download: p < 1 ? p : null }))
    set({ download: null })
    mic = new LiveMic({
      level: (level) => set({ level }),
      start: () => {
        if (useTalk.getState().phase === 'listening') set({ phase: 'hearing' })
      },
      cancel: () => {
        if (useTalk.getState().phase === 'hearing') set({ phase: 'listening' })
      },
      phrase: (p) => void heard(p, generation),
    })
    await mic.open()
    if (useTalk.getState().phase === 'off') {
      mic.close()
      return
    }
    listen()
  } catch (err) {
    stopTalk()
    toast.error(
      err instanceof MicrophoneError
        ? i18n.t(err.reason === 'missing' ? 'voice.missingMic' : 'voice.noMic')
        : i18n.t('voice.failed', { message: err instanceof Error ? err.message : String(err) }),
    )
  }
}

/** Ends the conversation: stops speaking and listening (the answer being written stays). */
export function stopTalk() {
  generation++
  confirming = null
  speaker.cancel()
  mic?.close()
  mic = null
  set({ phase: 'off', level: 0, download: null })
}

/** Stops reading the answer aloud and listens again (the answer itself goes on in the chat). */
export function interruptTalk() {
  generation++
  speaker.cancel()
  listen()
}

/** A phrase was heard: a reply to a yes/no question, or something to ask the assistant. */
async function heard(phrase: Phrase, gen: number) {
  if (gen !== generation || !transcriber) return
  mic?.pause()
  set({ phase: 'transcribing' })
  let text = ''
  try {
    // The language spoken last stays unless a phrase is clearly in another one; a yes or no
    // answers the question asked in the app's language.
    const result = await transcriber.transcribe(
      phrase.audio,
      confirming ? { language: i18n.language.slice(0, 2) } : { prefer: lang },
    )
    text = result.text.trim()
    if (text && !confirming) lang = result.language || lang
  } catch {
    // Unclear audio: listen again.
  }
  if (gen !== generation) return
  if (!text) return listen()

  if (confirming) {
    const answer = yesNo(text)
    if (answer !== null || confirming.tries >= 1) {
      confirming = null
      answerConfirm(answer ? 'allow' : 'deny')
      set({ phase: 'thinking' })
      return
    }
    confirming.tries++
    set({ phase: 'speaking' })
    await speaker.say(yesOrNo(i18n.language), i18n.language)
    if (gen === generation) listen()
    return
  }

  set({ phase: 'thinking' })
  const key = voiceBlobKey(crypto.randomUUID())
  const voice = await platform.blobs
    .put(key, phrase.audio)
    .then(() => ({ key, durationMs: phrase.durationMs, peaks: toPeaks(phrase.levels) }))
    .catch(() => undefined)
  const before = new Set(useAssistant.getState().messages.map((m) => m.id))
  await answerAloud(
    gen,
    before,
    ask(text, scopeOf(), voice ? { voice, language: lang } : { language: lang }),
  )
}

/** Reads the answer aloud as it streams, and the assistant's questions; then listens again. */
async function answerAloud(gen: number, before: Set<string>, answering: Promise<unknown>) {
  const sentences = new Sentences()
  /** The answer this question gets: the assistant's message that was not there before. */
  const answer = () =>
    [...useAssistant.getState().messages]
      .reverse()
      .find((m) => m.kind === 'assistant' && !before.has(m.id))
  let spoke = false
  const say = (text: string, language = lang) => {
    if (gen !== generation) return
    spoke = true
    set({ phase: 'speaking' })
    void speaker.say(text, language).then(() => {
      if (gen === generation && !speaker.speaking && useTalk.getState().phase === 'speaking')
        set({ phase: 'thinking' })
    })
  }
  const filler = setTimeout(() => {
    const phrase = fillerFor(lang)
    if (!spoke && phrase) say(phrase)
  }, FILLER_AFTER_MS)

  const unsubscribe = useAssistant.subscribe((s, prev) => {
    if (gen !== generation) return
    const content = answer()?.content
    if (content) for (const sentence of sentences.take(content)) say(sentence)
    // A change waits for a yes: ask it aloud, then listen for the answer.
    if (s.confirm && !prev.confirm) {
      confirming = { tries: 0 }
      say(`${s.confirm.text} ${yesOrNo(i18n.language)}`, i18n.language)
      void speaker.idle().then(() => {
        if (gen === generation && confirming) listen()
      })
    }
  })
  try {
    const result = await answering
    const content = answer()?.content
    if (result === 'ok' && content) for (const sentence of sentences.rest(content)) say(sentence)
    if (result !== 'ok') {
      // The model cannot be reached: the chat says why; the conversation ends.
      stopTalk()
      return
    }
  } finally {
    clearTimeout(filler)
    unsubscribe()
  }
  await speaker.idle()
  if (gen === generation) listen()
}
