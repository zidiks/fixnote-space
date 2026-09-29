/**
 * The assistant's voice in a spoken conversation, in the language the person spoke: a voice from
 * FixNote's voice server when there is one (Piper, `server.ts`), else the system's speech synthesis
 * (Web Speech API, on the device in Chrome/Edge/WebView2 and Safari).
 */

/** Short phrases said while the answer is being prepared, in the language the person spoke. */
const FILLERS: Record<string, readonly string[]> = {
  ru: ['Сейчас посмотрю.', 'Секунду.', 'Смотрю в заметках.'],
  en: ['Let me check.', 'One moment.', 'Looking in your notes.'],
  es: ['Déjame ver.', 'Un momento.', 'Miro en tus notas.'],
}

/** Asked after a question that needs a yes. */
const YES_OR_NO: Record<string, string> = { ru: 'Да или нет?', en: 'Yes or no?', es: '¿Sí o no?' }

// Whole words: `\b` only knows Latin letters.
const YES = /^(да|ага|конечно|давай|угу|yes|yeah|yep|sure|ok|okay|sí|si|claro|vale)(?![\p{L}])/iu
const NO = /^(нет|не надо|не|no|nope|cancel|отмена|stop|стоп)(?![\p{L}])/iu

const lang2 = (lang: string) => lang.slice(0, 2).toLowerCase()

export function fillerFor(lang: string, n = Math.random()): string | null {
  const list = FILLERS[lang2(lang)]
  return list ? (list[Math.floor(n * list.length)] ?? list[0] ?? null) : null
}

export const yesOrNo = (lang: string) => YES_OR_NO[lang2(lang)] ?? YES_OR_NO.en ?? ''

/** What a spoken reply to a yes/no question meant; null when it was neither. */
export function yesNo(text: string): boolean | null {
  const t = text
    .trim()
    .replace(/^[^\p{L}]+/u, '')
    .toLowerCase()
  if (NO.test(t)) return false
  if (YES.test(t)) return true
  return null
}

/** Text as it should sound: no citation marks, Markdown, links or list bullets. */
export function speakable(markdown: string): string {
  return markdown
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>~]+/g, '')
    .replace(/^\s*(?:[-+•]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,!?;:])/g, '$1')
    .trim()
}

/**
 * Cuts a growing answer into sentences as they complete, so speaking starts with the first one
 * instead of after the whole answer. `take(text)` returns the new complete sentences; `rest`
 * gives what is left once the answer is done.
 */
export class Sentences {
  private used = 0

  take(text: string): string[] {
    const out: string[] = []
    const re = /[^.!?…\n]*(?:[.!?…]+(?=\s)|\n+)/gu
    re.lastIndex = this.used
    for (let m = re.exec(text); m && m.index === this.used; m = re.exec(text)) {
      this.used = re.lastIndex
      const s = speakable(m[0])
      if (/[\p{L}\p{N}]/u.test(s)) out.push(s)
    }
    return out
  }

  rest(text: string): string[] {
    const tail = speakable(text.slice(this.used))
    this.used = text.length
    return /[\p{L}\p{N}]/u.test(tail) ? [tail] : []
  }
}

/** Speech synthesis where the platform has it. */
const synth = (): SpeechSynthesis | null =>
  typeof speechSynthesis !== 'undefined' ? speechSynthesis : null

export const canSpeak = () => synth() !== null

/** The best system voice for a language: a local, natural one when there is one. */
function voiceFor(lang: string): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices() ?? []
  const code = lang2(lang)
  const matching = voices.filter((v) => lang2(v.lang) === code)
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online|premium|enhanced/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0)
  return matching.sort((a, b) => score(b) - score(a))[0] ?? null
}

/** Speech for a sentence from elsewhere (a WAV or any format the browser decodes), or null. */
export type VoiceSource = (
  text: string,
  lang: string,
  signal: AbortSignal,
) => Promise<ArrayBuffer | null>

/**
 * Says the sentences one after another. Each resolves when it has been said, or after a safe time
 * (some engines never report the end); `cancel` stops at once. With a `voice`, each sentence is
 * fetched as soon as it is queued (so the next one is ready when this one ends) and played; when
 * that fails, the system's voice says it.
 */
export class Speaker {
  private queue: Promise<void> = Promise.resolve()
  private cancelled = 0
  private active = 0
  private fetching = new Set<AbortController>()
  private playing: AudioBufferSourceNode | null = null
  private audio: AudioContext | null = null

  constructor(private readonly voice?: VoiceSource) {}

  get speaking(): boolean {
    return this.active > 0
  }

  say(text: string, lang: string): Promise<void> {
    const s = synth()
    const generation = this.cancelled
    if ((!s && !this.voice) || !text.trim()) return this.queue
    const abort = new AbortController()
    this.fetching.add(abort)
    const sound = this.voice
      ? this.voice(text, lang, abort.signal).catch(() => null)
      : Promise.resolve(null)
    this.active++
    const mine = this.queue
      .then(async () => {
        const wav = await sound
        if (generation !== this.cancelled) return
        if (wav && (await this.play(wav, generation))) return
        if (s) await this.system(s, text, lang, generation)
      })
      .finally(() => {
        this.fetching.delete(abort)
        this.active--
      })
    this.queue = mine
    return mine
  }

  private system(s: SpeechSynthesis, text: string, lang: string, generation: number) {
    return new Promise<void>((resolve) => {
      if (generation !== this.cancelled) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang
      const voice = voiceFor(lang)
      if (voice) u.voice = voice
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(done, 2500 + text.length * 90)
      u.onend = done
      u.onerror = done
      s.speak(u)
    })
  }

  /** Plays a fetched sentence; false when it cannot be decoded or played. */
  private async play(data: ArrayBuffer, generation: number): Promise<boolean> {
    try {
      this.audio ??= new AudioContext()
      const ctx = this.audio
      if (ctx.state === 'suspended') await ctx.resume()
      const buffer = await ctx.decodeAudioData(data)
      if (generation !== this.cancelled) return true
      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        const done = () => {
          clearTimeout(timer)
          if (this.playing === source) this.playing = null
          resolve()
        }
        const timer = setTimeout(done, buffer.duration * 1000 + 1500)
        source.onended = done
        this.playing = source
        source.start()
      })
      return true
    } catch {
      return false
    }
  }

  /** Resolves once everything queued has been said. */
  idle(): Promise<void> {
    return this.queue
  }

  cancel() {
    this.cancelled++
    for (const f of this.fetching) f.abort()
    this.fetching.clear()
    try {
      this.playing?.stop()
    } catch {
      // Already stopped.
    }
    this.playing = null
    synth()?.cancel()
  }
}
