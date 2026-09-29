/**
 * Models that run on the device (transformers.js in a worker on every platform), for Settings →
 * Advanced → Models. Sizes are what downloads the first time, roughly.
 */
export interface ModelInfo {
  id: string
  approxBytes: number
}

/** Search by meaning (embeddings). */
export const SEARCH_MODEL: ModelInfo = { id: 'Xenova/multilingual-e5-small', approxBytes: 118e6 }

/** Text from images (Tesseract, English, Russian and Spanish). */
export const OCR_MODEL: ModelInfo = { id: '@tesseract.js-data', approxBytes: 7.8e6 }

/** Speech to text: the fast one is the default, the accurate one handles mixed languages better. */
export const SPEECH_MODELS = {
  fast: { id: 'onnx-community/whisper-base', approxBytes: 77e6 },
  accurate: { id: 'onnx-community/whisper-small', approxBytes: 245e6 },
} as const satisfies Record<string, ModelInfo>

export type SpeechModelKey = keyof typeof SPEECH_MODELS
