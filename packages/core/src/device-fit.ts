import { LOCAL_LLM_MODELS, type LocalLlmKey } from './models'

/** What the device has, as far as the app can tell (some of it is unknown in some webviews). */
export interface DeviceHardware {
  /** A real GPU through WebGPU (not a software fallback adapter). */
  gpu: boolean
  /** Apple Silicon (unified memory: the GPU uses the whole RAM). */
  appleSilicon: boolean
  /** A GPU of its own (not one built into the processor), when the adapter says so. */
  discreteGpu: boolean
  /** RAM in GB; browsers round down and stop at 8 (`navigator.deviceMemory`); null: unknown. */
  memoryGb: number | null
  /** Logical processor cores. */
  cores: number
}

/** How well a model should run here: badge in Settings. */
export type DeviceFit = 'good' | 'ok' | 'slow'

export interface FitVerdict {
  fit: DeviceFit
  /** Measured on this device after the download (tokens per second), or a guess from hardware. */
  measured: boolean
  tokensPerSecond?: number
}

/** Generation speed that reads as fluent, usable, or a wait (tokens per second). */
export const FIT_SPEED = { good: 15, ok: 6 } as const

export const fitOfSpeed = (tokensPerSecond: number): DeviceFit =>
  tokensPerSecond >= FIT_SPEED.good ? 'good' : tokensPerSecond >= FIT_SPEED.ok ? 'ok' : 'slow'

/**
 * How a model should run on this hardware, before it is downloaded. The measured speed (after the
 * download) replaces this guess. Small models on a GPU are fine almost anywhere; on the processor
 * alone they are slow, and the larger one needs a GPU with memory to spare.
 */
export function guessFit(model: LocalLlmKey, hw: DeviceHardware): DeviceFit {
  const heavy = LOCAL_LLM_MODELS[model].approxBytes > 1e9
  const memory = hw.memoryGb
  if (!hw.gpu) {
    if (heavy) return 'slow'
    return hw.cores >= 8 && (memory === null || memory >= 8) ? 'ok' : 'slow'
  }
  if (!heavy) return memory !== null && memory < 4 ? 'ok' : 'good'
  if (hw.appleSilicon || hw.discreteGpu) return memory !== null && memory < 8 ? 'ok' : 'good'
  // A GPU in the processor shares the RAM: fine with plenty of it, a stretch otherwise.
  if (memory === null) return 'ok'
  return memory >= 8 ? 'ok' : 'slow'
}

/** The badge for a model: what was measured here, else the guess. */
export function fitVerdict(
  model: LocalLlmKey,
  hw: DeviceHardware,
  measuredTokensPerSecond?: number | null,
): FitVerdict {
  if (measuredTokensPerSecond && measuredTokensPerSecond > 0)
    return {
      fit: fitOfSpeed(measuredTokensPerSecond),
      measured: true,
      tokensPerSecond: measuredTokensPerSecond,
    }
  return { fit: guessFit(model, hw), measured: false }
}
