import { quietestCut } from '@fixnote/core'
import { Vad } from './vad'

/** What the speech models take. */
export const RATE = 16_000
/**
 * A piece is cut at a pause once it is this long: speech models hear words better with context,
 * and only the last piece is left to transcribe when the person stops, however long the pieces.
 */
const MIN_SEGMENT_S = 10
/** Cut here even without a pause, at the quietest place of the last few seconds. */
const MAX_SEGMENT_S = 20
const LOOK_BACK_S = 4
/**
 * A piece however short ends after this much more quiet once its phrase ended (2.5 s of quiet in
 * all): a call's turn, a thought.
 */
const LONG_PAUSE_MS = 1500

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
  /** When the last phrase of a piece too short to cut ended. */
  private endedAt: number | null = null
  private readonly vad = new Vad({ endSilenceMs: 1000 })

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
    if (event === 'start') {
      this.speech = true
      this.endedAt = null
    }
    if (event === 'end') this.endedAt = timeMs
    // Nobody speaks on this side yet: keep only the last second, the lead-in to what comes.
    if (this.opts.dropSilent && !this.speech && !this.vad.speaking) this.keepLast(RATE)
    const paused =
      event === 'end' ||
      (this.endedAt !== null && !this.vad.speaking && timeMs - this.endedAt >= LONG_PAUSE_MS)
    if (paused && (this.length >= MIN_SEGMENT_S * RATE || event !== 'end')) return this.cut(null)
    if (this.length >= MAX_SEGMENT_S * RATE) {
      const all = concat(this.parts)
      return this.cut(quietestCut(all, all.length - LOOK_BACK_S * RATE, all.length, RATE), all)
    }
    return null
  }

  /** Hands over the piece (up to `at`, the rest starts the next one). */
  private cut(at: number | null, all = concat(this.parts)): Float32Array | null {
    const piece = at === null ? all : all.slice(0, at)
    const rest = at === null ? null : all.slice(at)
    const heard = this.speech || this.vad.speaking
    this.parts = rest?.length ? [rest] : []
    this.length = rest?.length ?? 0
    this.cuts++
    this.speech = this.vad.speaking
    this.endedAt = null
    return heard || !this.opts.dropSilent ? piece : null
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

/** Zero crossings of the filter on each side: steep enough to keep 7 kHz and drop 8 kHz. */
const ZEROS = 16
/** Steps of the filter table per input sample (the rest is interpolated). */
const STEPS = 64

/**
 * Converts a stream to `to` Hz with a windowed-sinc low-pass (Blackman window):
 * what is above the new Nyquist is filtered out first, so it does not fold back as hiss over
 * "с", "ш" and "щ" the way plain averaging let it. Keeps its state between blocks.
 */
export class Resampler {
  private readonly step: number
  private readonly cutoff: number
  private readonly half: number
  private readonly table: Float32Array
  /** Input not consumed yet, with `half` samples of history before `pos`. */
  private buffer = new Float32Array(0)
  /** Position of the next output sample in `buffer`, in input samples. */
  private pos: number

  constructor(
    readonly from: number,
    readonly to: number,
  ) {
    this.step = from / to
    this.cutoff = Math.min(1, to / from) * 0.94
    this.half = Math.ceil(ZEROS / this.cutoff)
    this.pos = this.half
    this.buffer = new Float32Array(this.half)
    const size = this.half * STEPS + 1
    this.table = new Float32Array(size)
    for (let i = 0; i < size; i++) {
      const x = i / STEPS
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x * this.cutoff) / (Math.PI * x * this.cutoff)
      const w = x / this.half
      const blackman = 0.42 + 0.5 * Math.cos(Math.PI * w) + 0.08 * Math.cos(2 * Math.PI * w)
      this.table[i] = this.cutoff * sinc * blackman
    }
  }

  private tap(distance: number): number {
    const at = Math.abs(distance) * STEPS
    const i = Math.floor(at)
    if (i >= this.table.length - 1) return 0
    const f = at - i
    return (this.table[i] as number) * (1 - f) + (this.table[i + 1] as number) * f
  }

  push(input: Float32Array): Float32Array {
    if (this.from === this.to) return input
    const buffer = new Float32Array(this.buffer.length + input.length)
    buffer.set(this.buffer)
    buffer.set(input, this.buffer.length)
    const out: number[] = []
    while (this.pos + this.half < buffer.length) {
      const center = Math.floor(this.pos)
      const frac = this.pos - center
      let sum = 0
      for (let k = -this.half + 1; k <= this.half; k++) {
        sum += (buffer[center + k] ?? 0) * this.tap(k - frac)
      }
      out.push(sum)
      this.pos += this.step
    }
    // Keep the history the next block's first outputs need.
    const keep = Math.max(0, Math.floor(this.pos) - this.half)
    this.buffer = buffer.slice(keep)
    this.pos -= keep
    return Float32Array.from(out)
  }
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
