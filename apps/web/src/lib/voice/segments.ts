import { Vad } from './vad'

/** What Whisper takes. */
export const RATE = 16_000
/** A piece shorter than this is not cut off yet: Whisper hears words better with some context. */
const MIN_SEGMENT_S = 3
/** Cut here even without a pause (Whisper hears 30 s at a time). */
const MAX_SEGMENT_S = 25

/**
 * Cuts a dictation into pieces at pauses while it is being recorded, so each piece is transcribed
 * while the person goes on speaking and only the last one is left when they stop. Nothing is
 * dropped: the pieces together are the whole recording.
 */
export class Segmenter {
  private parts: Float32Array[] = []
  private length = 0
  private cuts = 0
  /** Speech was heard in the piece being collected. */
  private speech = false
  private readonly vad = new Vad({ endSilenceMs: 700 })

  /**
   * `dropSilent`: a piece in which nobody spoke is dropped, not returned (a call, where one side
   * is often quiet for minutes; Whisper makes up words in silence).
   */
  constructor(private readonly opts: { dropSilent?: boolean } = {}) {}

  /** A frame at 16 kHz with its loudness; returns a finished piece when a pause ends one. */
  push(samples: Float32Array, rms: number, timeMs: number): Float32Array | null {
    this.parts.push(samples)
    this.length += samples.length
    const event = this.vad.push(rms, timeMs)
    if (event === 'start') this.speech = true
    // Nobody speaks on this side yet: keep only the last second, the lead-in to what comes.
    if (this.opts.dropSilent && !this.speech && !this.vad.speaking) this.keepLast(RATE)
    if (
      (event === 'end' && this.length >= MIN_SEGMENT_S * RATE) ||
      this.length >= MAX_SEGMENT_S * RATE
    ) {
      const piece = concat(this.parts)
      const heard = this.speech || this.vad.speaking
      this.parts = []
      this.length = 0
      this.cuts++
      this.speech = this.vad.speaking
      return heard || !this.opts.dropSilent ? piece : null
    }
    return null
  }

  private keepLast(samples: number) {
    while (this.parts.length > 1 && this.length - (this.parts[0]?.length ?? 0) >= samples) {
      this.length -= this.parts.shift()?.length ?? 0
    }
  }

  /**
   * What is left when recording stops; null when it is only the silence after the last piece
   * (Whisper makes up words in silence). A recording never cut is always returned whole.
   */
  flush(): Float32Array | null {
    if (!this.length) return null
    const heard = this.speech || this.vad.speaking || (this.cuts === 0 && !this.opts.dropSilent)
    const rest = concat(this.parts)
    this.parts = []
    this.length = 0
    return heard ? rest : null
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
