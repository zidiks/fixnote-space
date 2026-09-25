export type WhisperRequest =
  | { id: number; op: 'init' }
  | { id: number; op: 'transcribe'; audio: Float32Array; language?: string }

/** Request without the id the client assigns. */
export type WhisperBody =
  | { op: 'init' }
  | { op: 'transcribe'; audio: Float32Array; language?: string }

export type WhisperResponse =
  | { kind: 'result'; id: number; ok: true; text?: string; device?: string }
  | { kind: 'result'; id: number; ok: false; error: string }
  | { kind: 'progress'; progress: number }
