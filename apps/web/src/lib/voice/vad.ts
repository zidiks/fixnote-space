/**
 * Voice activity detection by loudness, for the spoken conversation: when a phrase starts and when
 * it is over. The noise floor adapts (a fan, a street), so speech is "clearly louder than the room".
 */
export interface VadOptions {
  /** Loud frames in a row that make speech (ignores clicks and taps). */
  startMs: number
  /** Quiet this long after speech ends the phrase. */
  endSilenceMs: number
  /** Shorter bursts are not a phrase (a cough, a chair). */
  minSpeechMs: number
  /** A phrase is cut here even if the room never gets quiet. */
  maxMs: number
}

export const VAD_DEFAULTS: VadOptions = {
  startMs: 120,
  endSilenceMs: 900,
  minSpeechMs: 350,
  maxMs: 30_000,
}

/** Quietest level counted as speech, whatever the room. */
const MIN_SPEECH = 0.02
/** Speech is this many times louder than the noise floor. */
const OVER_FLOOR = 3

export type VadEvent = 'start' | 'end' | 'cancel' | null

export class Vad {
  private floor = 0.01
  private loudSince: number | null = null
  private quietSince: number | null = null
  private speechStart: number | null = null
  private readonly opts: VadOptions

  constructor(opts: Partial<VadOptions> = {}) {
    this.opts = { ...VAD_DEFAULTS, ...opts }
  }

  get speaking(): boolean {
    return this.speechStart !== null
  }

  /** Forgets any phrase in progress (after the app spoke, say). */
  reset() {
    this.loudSince = this.quietSince = this.speechStart = null
  }

  /**
   * One frame's loudness (RMS, 0..1) at time `t` (ms). `start`: a phrase began (it began
   * `startMs` ago); `end`: it is over; `cancel`: what began was too short to be one.
   */
  push(rms: number, t: number): VadEvent {
    const threshold = Math.max(MIN_SPEECH, this.floor * OVER_FLOOR)
    const loud = rms > threshold
    // The floor follows the room: down at once, up slowly (and not while someone speaks).
    if (rms < this.floor) this.floor = rms * 0.3 + this.floor * 0.7
    else if (!this.speaking && !loud) this.floor = this.floor * 0.995 + rms * 0.005
    this.floor = Math.max(this.floor, 0.002)

    if (this.speechStart === null) {
      if (!loud) {
        this.loudSince = null
        return null
      }
      this.loudSince ??= t
      if (t - this.loudSince < this.opts.startMs) return null
      this.speechStart = this.loudSince
      this.quietSince = null
      return 'start'
    }

    if (t - this.speechStart >= this.opts.maxMs) {
      this.reset()
      return 'end'
    }
    if (loud) {
      this.quietSince = null
      return null
    }
    this.quietSince ??= t
    if (t - this.quietSince < this.opts.endSilenceMs) return null
    const length = this.quietSince - this.speechStart
    this.reset()
    return length >= this.opts.minSpeechMs ? 'end' : 'cancel'
  }
}
