/**
 * GigaAM v3's input: log-mel spectrogram, 64 HTK mel bands without normalization, 20 ms Hann
 * windows every 10 ms, not centered (torchaudio's MelSpectrogram as GigaAM configures it). The
 * model was trained with its window and filters in bfloat16, so they are rounded the same way;
 * that makes the features match the reference to float precision.
 */
const RATE = 16_000
export const N_FFT = 320
export const HOP = 160
export const MELS = 64
const BINS = N_FFT / 2 + 1

/** Rounds to the nearest bfloat16 (ties to even), as torch does. */
function bf16(x: number): number {
  const f = new Float32Array([x])
  const u = new Uint32Array(f.buffer)
  const bits = u[0] ?? 0
  u[0] = (bits + 0x7fff + ((bits >>> 16) & 1)) & 0xffff0000
  return f[0] ?? 0
}

const WINDOW = Float64Array.from({ length: N_FFT }, (_, n) =>
  bf16(0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT)),
)

/** Triangular HTK mel filters, [bin][mel]. */
const FILTERS = (() => {
  const toMel = (f: number) => 2595 * Math.log10(1 + f / 700)
  const toHz = (m: number) => 700 * (10 ** (m / 2595) - 1)
  const top = toMel(RATE / 2)
  const points = Array.from({ length: MELS + 2 }, (_, i) => toHz((top * i) / (MELS + 1)))
  const out = new Float64Array(BINS * MELS)
  for (let k = 0; k < BINS; k++) {
    const f = (k * (RATE / 2)) / (BINS - 1)
    for (let m = 0; m < MELS; m++) {
      const lo = points[m] as number
      const mid = points[m + 1] as number
      const hi = points[m + 2] as number
      const down = (f - lo) / (mid - lo)
      const up = (hi - f) / (hi - mid)
      out[k * MELS + m] = bf16(Math.max(0, Math.min(down, up)))
    }
  }
  return out
})()

/**
 * A 320-point real DFT as five 64-point FFTs (320 = 5 × 64): x[5m + r] → Y_r, then
 * X[k] = Σ_r W^(rk) · Y_r[k mod 64]. Only the 161 bins up to Nyquist, as power.
 */
const SUB = 64
const BITS = 6
const REVERSE = Uint8Array.from({ length: SUB }, (_, i) => {
  let r = 0
  for (let b = 0; b < BITS; b++) r |= ((i >> b) & 1) << (BITS - 1 - b)
  return r
})
const SUB_COS = Float64Array.from({ length: SUB / 2 }, (_, i) => Math.cos((-2 * Math.PI * i) / SUB))
const SUB_SIN = Float64Array.from({ length: SUB / 2 }, (_, i) => Math.sin((-2 * Math.PI * i) / SUB))
const TW_COS = Float64Array.from({ length: 5 * BINS }, (_, i) =>
  Math.cos((-2 * Math.PI * Math.floor(i / BINS) * (i % BINS)) / N_FFT),
)
const TW_SIN = Float64Array.from({ length: 5 * BINS }, (_, i) =>
  Math.sin((-2 * Math.PI * Math.floor(i / BINS) * (i % BINS)) / N_FFT),
)

function fft64(re: Float64Array, im: Float64Array) {
  for (let i = 0; i < SUB; i++) {
    const j = REVERSE[i] as number
    if (j > i) {
      const t = re[i] as number
      re[i] = re[j] as number
      re[j] = t
    }
  }
  im.fill(0)
  for (let size = 2; size <= SUB; size *= 2) {
    const half = size / 2
    const step = SUB / size
    for (let start = 0; start < SUB; start += size) {
      for (let k = 0; k < half; k++) {
        const c = SUB_COS[k * step] as number
        const s = SUB_SIN[k * step] as number
        const a = start + k
        const b = a + half
        const br = re[b] as number
        const bi = im[b] as number
        const tr = br * c - bi * s
        const ti = br * s + bi * c
        re[b] = (re[a] as number) - tr
        im[b] = (im[a] as number) - ti
        re[a] = (re[a] as number) + tr
        im[a] = (im[a] as number) + ti
      }
    }
  }
}

/** Frames a recording of `samples` makes (a recording shorter than one window makes one). */
export const frameCount = (samples: number) =>
  Math.floor((Math.max(samples, N_FFT) - N_FFT) / HOP) + 1

/** Features [64 × frames], row-major (mel band first), as the model takes them. */
export function gigaamFeatures(audio: Float32Array): { data: Float32Array; frames: number } {
  const frames = frameCount(audio.length)
  const data = new Float32Array(MELS * frames)
  const res = Array.from({ length: 5 }, () => new Float64Array(SUB))
  const ims = Array.from({ length: 5 }, () => new Float64Array(SUB))
  const power = new Float64Array(BINS)
  for (let t = 0; t < frames; t++) {
    const at = t * HOP
    for (let r = 0; r < 5; r++) {
      const re = res[r] as Float64Array
      for (let m = 0; m < SUB; m++) {
        const n = 5 * m + r
        re[m] = (audio[at + n] ?? 0) * (WINDOW[n] as number)
      }
      fft64(re, ims[r] as Float64Array)
    }
    for (let k = 0; k < BINS; k++) {
      let xr = 0
      let xi = 0
      const j = k % SUB
      for (let r = 0; r < 5; r++) {
        const yr = (res[r] as Float64Array)[j] as number
        const yi = (ims[r] as Float64Array)[j] as number
        const c = TW_COS[r * BINS + k] as number
        const s = TW_SIN[r * BINS + k] as number
        xr += yr * c - yi * s
        xi += yr * s + yi * c
      }
      power[k] = xr * xr + xi * xi
    }
    for (let m = 0; m < MELS; m++) {
      let e = 0
      for (let k = 0; k < BINS; k++) e += (power[k] as number) * (FILTERS[k * MELS + m] as number)
      data[m * frames + t] = Math.log(Math.min(1e9, Math.max(1e-9, e)))
    }
  }
  return { data, frames }
}
