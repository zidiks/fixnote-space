import { openMicrophone } from './recorder'
import { Vad } from './vad'

/** What Whisper takes. */
const RATE = 16_000
/** Kept from before a phrase is detected, so its first syllable is not lost. */
const PREROLL_MS = 400

export interface Phrase {
  /** 16 kHz mono WAV. */
  audio: Blob
  durationMs: number
  /** Loudness over the phrase, 0..1, one value per ~0.1 s. */
  levels: number[]
}

/**
 * The microphone kept open for a spoken conversation: finds phrases with the loudness VAD and hands
 * each over as a WAV once it is over. Paused while the app itself speaks, so it does not hear itself.
 */
export class LiveMic {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private node: ScriptProcessorNode | null = null
  private readonly vad = new Vad()
  private preroll: Float32Array[] = []
  private phrase: Float32Array[] | null = null
  private levels: number[] = []
  private paused = false

  constructor(
    private readonly on: {
      level: (level: number) => void
      /** Someone started speaking. */
      start: () => void
      phrase: (phrase: Phrase) => void
      /** What started was too short to be a phrase. */
      cancel: () => void
    },
  ) {}

  async open(): Promise<void> {
    this.stream = await openMicrophone()
    const ctx = new AudioContext()
    this.ctx = ctx
    const source = ctx.createMediaStreamSource(this.stream)
    const node = ctx.createScriptProcessor(2048, 1, 1)
    this.node = node
    // It only runs when connected to the output: through a silent gain.
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(node)
    node.connect(mute)
    mute.connect(ctx.destination)
    node.onaudioprocess = (e) => this.frame(new Float32Array(e.inputBuffer.getChannelData(0)))
    if (ctx.state === 'suspended') await ctx.resume()
  }

  private frame(samples: Float32Array) {
    const ctx = this.ctx
    if (!ctx) return
    let sum = 0
    for (const v of samples) sum += v * v
    const rms = Math.sqrt(sum / samples.length)
    this.on.level(Math.min(1, rms * 4))
    if (this.paused) return
    const event = this.vad.push(rms, ctx.currentTime * 1000)
    if (this.phrase) {
      this.phrase.push(samples)
      this.levels.push(Math.min(1, rms * 4))
    } else {
      this.preroll.push(samples)
      const keep = Math.ceil((PREROLL_MS / 1000) * (ctx.sampleRate / samples.length))
      if (this.preroll.length > keep) this.preroll.splice(0, this.preroll.length - keep)
    }
    if (event === 'start') {
      this.phrase = [...this.preroll]
      this.levels = this.preroll.map(() => 0)
      this.preroll = []
      this.on.start()
    } else if (event === 'cancel') {
      this.phrase = null
      this.on.cancel()
    } else if (event === 'end' && this.phrase) {
      const pcm = downsample(concat(this.phrase), ctx.sampleRate, RATE)
      this.phrase = null
      this.on.phrase({
        audio: wav(pcm, RATE),
        durationMs: Math.round((pcm.length / RATE) * 1000),
        levels: this.levels,
      })
    }
  }

  /** Stops listening (the app speaks or thinks); the microphone stays open. */
  pause() {
    this.paused = true
    this.phrase = null
    this.preroll = []
    this.vad.reset()
  }

  resume() {
    this.vad.reset()
    this.paused = false
  }

  close() {
    this.node?.disconnect()
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    void this.ctx?.close().catch(() => undefined)
    this.node = null
    this.stream = null
    this.ctx = null
  }
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Averages the samples down to `to` Hz (enough for speech). */
export function downsample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples
  const ratio = from / to
  const out = new Float32Array(Math.floor(samples.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += samples[j] ?? 0
    out[i] = end > start ? sum / (end - start) : 0
  }
  return out
}

/** 16-bit PCM WAV. */
export function wav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
