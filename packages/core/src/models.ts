/**
 * Models that run on the device (in a worker on every platform), for Settings → Advanced →
 * Models. Sizes are what downloads the first time, roughly; `gpuBytes` when the WebGPU build of
 * the model differs (it keeps the encoder in full precision).
 */
export interface ModelInfo {
  id: string
  approxBytes: number
  gpuBytes?: number
}

/** Search by meaning (embeddings). */
export const SEARCH_MODEL: ModelInfo = { id: 'Xenova/multilingual-e5-small', approxBytes: 118e6 }

/**
 * Language models that run in the app itself (Settings → AI → On this device), lightest first:
 * for writing help, Tidy up and answers from notes without the internet, or for people who want
 * nothing to leave the device. Qwen3 (Apache-2.0), 4-bit ONNX; on WebGPU when there is one.
 */
export const LOCAL_LLM_MODELS = {
  small: { id: 'onnx-community/Qwen3-0.6B-ONNX', approxBytes: 570e6 },
  standard: { id: 'onnx-community/Qwen3-1.7B-ONNX', approxBytes: 1.3e9 },
} as const satisfies Record<string, ModelInfo>

export type LocalLlmKey = keyof typeof LOCAL_LLM_MODELS

/** Text from images (Tesseract, English, Russian and Spanish). */
export const OCR_MODEL: ModelInfo = { id: '@tesseract.js-data', approxBytes: 7.8e6 }

/**
 * Whisper, for speech in any language but Russian, lightest first: `fast` (standard) is the
 * default, `light` is for weak computers (the app offers it when dictation is slow), `accurate`
 * handles mixed languages better (the default with WebGPU and a Russian interface, where it only
 * steps in for other languages).
 */
export const SPEECH_MODELS = {
  light: { id: 'onnx-community/whisper-tiny', approxBytes: 66e6, gpuBytes: 122e6 },
  fast: { id: 'onnx-community/whisper-base', approxBytes: 139e6, gpuBytes: 209e6 },
  accurate: { id: 'onnx-community/whisper-small', approxBytes: 252e6, gpuBytes: 589e6 },
} as const satisfies Record<string, ModelInfo>

export type SpeechModelKey = keyof typeof SPEECH_MODELS

/** Russian speech: GigaAM v3 (Sber, MIT), with punctuation; far better than Whisper at Russian. */
export const RUSSIAN_SPEECH_MODEL: ModelInfo = {
  id: 'istupakov/gigaam-v3-onnx',
  approxBytes: 225e6,
}

/**
 * Where speech is in a recording (Silero VAD, MIT): silence and music never reach the speech
 * models, which make up words in them. Downloads with the first speech model; too small for a
 * row of its own in Settings.
 */
export const VOICE_ACTIVITY_MODEL: ModelInfo = {
  id: 'onnx-community/silero-vad',
  approxBytes: 2.3e6,
}
