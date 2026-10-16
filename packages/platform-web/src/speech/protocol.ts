export type SpeechRequest =
  | { id: number; op: 'init'; model: string }
  | {
      id: number
      op: 'transcribe'
      /** The Whisper model the person picked, for speech that is not Russian. */
      whisper: string
      audio: Float32Array
      language?: string
      languages?: string[]
      prefer?: string
      prompt?: string
    }

type Body<T> = T extends unknown ? Omit<T, 'id'> : never

/** Request without the id the client assigns. */
export type SpeechBody = Body<SpeechRequest>

export type SpeechResponse =
  | {
      kind: 'result'
      id: number
      ok: true
      text?: string
      /** The language the speech was taken as (detected, or the one asked for). */
      language?: string
      /** The model that wrote the text (none when nobody spoke). */
      model?: string
      device?: string
    }
  | { kind: 'result'; id: number; ok: false; error: string }
  | { kind: 'progress'; progress: number }
