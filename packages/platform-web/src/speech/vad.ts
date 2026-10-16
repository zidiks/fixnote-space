import type * as Ort from 'onnxruntime-web'

type OrtModule = typeof Ort

const RATE = 16_000
/** Silero v5 hears 512 samples (32 ms) at a time, after the last 64 of the frame before. */
const FRAME = 512
const CONTEXT = 64

export interface Span {
  start: number
  end: number
}

/** Silero's own defaults, a little more forgiving of pauses inside a phrase. */
const ON = 0.5
const OFF = 0.35
const MIN_SPEECH_MS = 250
const MERGE_MS = 400

/** Stretches of speech, in samples, from Silero's per-frame probabilities. */
export function speechSpans(probs: ArrayLike<number>, frame = FRAME, rate = RATE): Span[] {
  const spans: Span[] = []
  let start = -1
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i] as number
    if (start < 0 && p >= ON) start = i
    else if (start >= 0 && p < OFF) {
      spans.push({ start: start * frame, end: i * frame })
      start = -1
    }
  }
  if (start >= 0) spans.push({ start: start * frame, end: probs.length * frame })
  const merged: Span[] = []
  for (const span of spans) {
    const last = merged.at(-1)
    if (last && span.start - last.end < (MERGE_MS * rate) / 1000) last.end = span.end
    else merged.push({ ...span })
  }
  return merged.filter((s) => s.end - s.start >= (MIN_SPEECH_MS * rate) / 1000)
}

/**
 * The recording from a little before the first word to a little after the last; null when
 * nobody speaks in it. Pauses inside stay: they are where sentences end.
 */
export function trimToSpeech(
  audio: Float32Array,
  spans: readonly Span[],
  padMs = 250,
  rate = RATE,
): Float32Array | null {
  const first = spans[0]
  const last = spans.at(-1)
  if (!first || !last) return null
  const pad = Math.round((padMs * rate) / 1000)
  return audio.subarray(Math.max(0, first.start - pad), Math.min(audio.length, last.end + pad))
}

/** Silero VAD on the device: where people speak in a recording. */
export class SileroVad {
  private constructor(
    private readonly ort: OrtModule,
    private readonly session: Ort.InferenceSession,
  ) {}

  static async load(ort: OrtModule, model: Uint8Array): Promise<SileroVad> {
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
    return new SileroVad(ort, session)
  }

  /** The probability of speech in each 32 ms frame. */
  async probabilities(audio: Float32Array): Promise<Float32Array> {
    const { ort } = this
    const count = Math.ceil(audio.length / FRAME)
    const out = new Float32Array(count)
    let state: Ort.Tensor = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128])
    const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(RATE)]), [])
    const input = new Float32Array(CONTEXT + FRAME)
    for (let i = 0; i < count; i++) {
      // The context is the end of the previous frame (zeros before the first).
      input.copyWithin(0, FRAME, FRAME + CONTEXT)
      if (i === 0) input.fill(0, 0, CONTEXT)
      input.fill(0, CONTEXT)
      input.set(audio.subarray(i * FRAME, (i + 1) * FRAME), CONTEXT)
      const result = await this.session.run({
        input: new ort.Tensor('float32', input.slice(), [1, CONTEXT + FRAME]),
        state,
        sr,
      })
      out[i] = (result.output?.data as Float32Array | undefined)?.[0] ?? 0
      state = result.stateN as Ort.Tensor
    }
    return out
  }

  async spans(audio: Float32Array): Promise<Span[]> {
    return speechSpans(await this.probabilities(audio))
  }

  release() {
    void this.session.release()
  }
}
