/** A message of the chat, as the model's template takes it. */
export interface LocalChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LlmRequest =
  | { id: number; op: 'load'; model: string }
  | {
      id: number
      op: 'generate'
      model: string
      messages: LocalChatMessage[]
      maxTokens: number
      temperature: number
    }
  | { id: number; op: 'stop' }

/** Request without the id the client assigns. */
export type LlmBody =
  | { op: 'load'; model: string }
  | {
      op: 'generate'
      model: string
      messages: LocalChatMessage[]
      maxTokens: number
      temperature: number
    }
  | { op: 'stop' }

export type LlmResponse =
  | { kind: 'progress'; progress: number }
  | { kind: 'text'; id: number; text: string }
  | {
      kind: 'result'
      id: number
      ok: true
      device?: 'webgpu' | 'wasm'
      /** Tokens made and how long that took (generate). */
      tokens?: number
      ms?: number
    }
  | { kind: 'result'; id: number; ok: false; error: string }
