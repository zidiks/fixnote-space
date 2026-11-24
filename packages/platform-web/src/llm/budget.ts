/** Sentinel error code sent by the local LLM worker when WebGPU/WASM runs out of memory. */
export const LOCAL_OOM_CODE = 'FIXNOTE_LOCAL_LLM_OOM'

/** Prefill chunk size (tokens per OrtRun call) to keep logits `[1, chunk, 151936]` small. */
export const PREFILL_CHUNK = {
  webgpu: 256,
  wasm: 128,
} as const

/** Hard prompt token ceiling per backend so a single chat turn never exceeds WebGPU/WASM RAM. */
export const MAX_PROMPT_TOKENS = {
  webgpu: 3072,
  wasm: 1536,
} as const

/** Tighter fallback prompt token cap used when retrying after a WASM OOM. */
export const RETRY_WASM_PROMPT_TOKENS = 768

/** True when an ONNX Runtime / WebGPU / WASM error indicates memory exhaustion. */
export function isOomError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /bad_alloc|out of memory|\boom\b|cannot allocate|allocation failed|memory access out of bounds|rangeerror.*array buffer/i.test(
    msg,
  )
}

/**
 * Caps a flat token-id sequence to `maxTokens` by keeping the beginning (system prompt) and end
 * (most recent context + user question + generation header), dropping the middle if needed.
 */
export function trimTokenIds(ids: BigInt64Array, maxTokens: number): BigInt64Array {
  if (ids.length <= maxTokens || maxTokens < 16) return ids
  const head = Math.min(Math.floor(maxTokens * 0.35), maxTokens - 8)
  const tail = maxTokens - head
  const out = new BigInt64Array(maxTokens)
  out.set(ids.subarray(0, head), 0)
  out.set(ids.subarray(ids.length - tail), head)
  return out
}
