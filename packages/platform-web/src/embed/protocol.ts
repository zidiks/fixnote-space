export type EmbedRequest = { id: number; op: 'init' } | { id: number; op: 'embed'; texts: string[] }

/** Request without the id the client assigns. */
export type EmbedBody = { op: 'init' } | { op: 'embed'; texts: string[] }

export type EmbedResponse =
  | { kind: 'result'; id: number; ok: true; vectors?: Float32Array[] }
  | { kind: 'result'; id: number; ok: false; error: string }
  | { kind: 'progress'; progress: number }
