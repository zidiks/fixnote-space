/** The sample rate speech models take. */
export const SPEECH_RATE = 16_000

/** Loudness is measured over this many milliseconds when looking for a quiet place to cut. */
const STEP_MS = 20

/**
 * The quietest place between `from` and `to` (sample indexes), to cut a recording where nobody
 * is in the middle of a word. Ties go to the latest place, so a piece is as long as it may be.
 */
export function quietestCut(
  samples: Float32Array,
  from: number,
  to: number,
  rate = SPEECH_RATE,
): number {
  const step = Math.max(1, Math.round((rate * STEP_MS) / 1000))
  const start = Math.max(0, Math.min(from, samples.length))
  const end = Math.max(start, Math.min(to, samples.length))
  if (end - start < step) return end
  let best = end
  let quietest = Infinity
  for (let at = start; at + step <= end; at += step) {
    let sum = 0
    for (let i = at; i < at + step; i++) sum += (samples[i] ?? 0) ** 2
    if (sum <= quietest) {
      quietest = sum
      best = at + Math.floor(step / 2)
    }
  }
  return best
}

/**
 * A recording in pieces of at most `maxS` seconds, each cut at the quietest place of its last
 * `lookS` seconds; together they are the whole recording.
 */
export function splitAtQuiet(
  samples: Float32Array,
  maxS: number,
  lookS = 4,
  rate = SPEECH_RATE,
): Float32Array[] {
  const max = Math.round(maxS * rate)
  const look = Math.min(max - 1, Math.round(lookS * rate))
  const out: Float32Array[] = []
  let at = 0
  while (samples.length - at > max) {
    const cut = quietestCut(samples, at + max - look, at + max, rate)
    out.push(samples.subarray(at, cut))
    at = cut
  }
  if (at < samples.length || !out.length) out.push(samples.subarray(at))
  return out
}
