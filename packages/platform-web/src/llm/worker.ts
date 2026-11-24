/// <reference lib="webworker" />
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  DynamicCache,
  env,
  InterruptableStoppingCriteria,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  Tensor,
  TextStreamer,
} from '@huggingface/transformers'
import { ortPaths } from '../ort'
import {
  isOomError,
  LOCAL_OOM_CODE,
  MAX_PROMPT_TOKENS,
  PREFILL_CHUNK,
  RETRY_WASM_PROMPT_TOKENS,
  trimTokenIds,
} from './budget'
import type { LlmRequest, LlmResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

env.allowLocalModels = false
env.useBrowserCache = true
// Not a top-level await: a module worker still evaluating misses the first message in WebKit.
const runtime = (async () => {
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = await ortPaths()
})()

type Device = 'webgpu' | 'wasm'
type Loaded = { tokenizer: PreTrainedTokenizer; model: PreTrainedModel; device: Device }

/** One model in memory at a time; switching frees the other. */
let current: { id: string; loaded: Promise<Loaded> } | null = null
/** Once WebGPU runs out of VRAM on this device, stay on WASM for the rest of the session. */
let forceWasm = false
const stopping = new InterruptableStoppingCriteria()

/** The GPU here: none, or one with or without 16-bit floats (older GPUs, e.g. NVIDIA Pascal). */
async function webGpu(): Promise<'none' | 'f16' | 'f32'> {
  if (forceWasm) return 'none'
  try {
    type Adapter = { features: { has(name: string): boolean }; isFallbackAdapter?: boolean }
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<Adapter | null> } })
      .gpu
    const adapter = gpu ? await gpu.requestAdapter() : null
    if (!adapter || (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter) return 'none'
    return adapter.features.has('shader-f16') ? 'f16' : 'f32'
  } catch {
    return 'none'
  }
}

/** Download progress summed over all files of a load, so the bar only moves forward. */
function progressReporter() {
  const files = new Map<string, { loaded: number; total: number }>()
  let last = 0
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
    let sum = 0
    let all = 0
    for (const f of files.values()) {
      sum += f.loaded
      all += f.total
    }
    const progress = all ? sum / all : 0
    if (progress - last < 0.01 && progress < 1) return
    last = progress
    self.postMessage({ kind: 'progress', progress } satisfies LlmResponse)
  }
}

async function create(id: string, device: Device, f16: boolean): Promise<Loaded> {
  const report = progressReporter()
  const tokenizer = await AutoTokenizer.from_pretrained(id, { progress_callback: report })
  const model = await AutoModelForCausalLM.from_pretrained(id, {
    device,
    // 16-bit weights only where the GPU computes in 16 bits; elsewhere 4-bit with 32-bit math.
    dtype: device === 'webgpu' && f16 ? 'q4f16' : 'q4',
    progress_callback: report,
  })
  // One token through the model: a GPU that loads it but cannot run it fails here, not mid-answer.
  const probe = tokenizer('Hi', { add_special_tokens: false })
  await model.generate({ ...probe, max_new_tokens: 1, do_sample: false })
  return { tokenizer, model, device }
}

async function disposeCurrent() {
  const prev = current
  current = null
  if (!prev) return
  await prev.loaded.then(({ model }) => model.dispose()).catch(() => {})
}

function load(id: string): Promise<Loaded> {
  if (current?.id === id) return current.loaded
  if (current) current.loaded.then(({ model }) => model.dispose()).catch(() => {})
  const loaded = (async () => {
    await runtime
    const gpu = await webGpu()
    if (gpu !== 'none') {
      try {
        return await create(id, 'webgpu', gpu === 'f16')
      } catch {
        // Driver or adapter trouble: the CPU is slower but works everywhere.
      }
    }
    return create(id, 'wasm', false)
  })()
  const mine = { id, loaded }
  current = mine
  loaded.catch(() => {
    if (current === mine) current = null
  })
  return loaded
}

/** Extracts `present.*` KV tensors into a DynamicCache and immediately disposes logits/temp outputs. */
function updateKvCache(outputs: Record<string, Tensor>, past: DynamicCache | null): DynamicCache {
  const entries: Record<string, Tensor> = {}
  for (const [name, tensor] of Object.entries(outputs)) {
    if (name.startsWith('present')) {
      const key = name
        .replace('present_ssm', 'past_ssm')
        .replace('present_conv', 'past_conv')
        .replace('present_recurrent', 'past_recurrent')
        .replace('present_compressor', 'past_compressor')
        .replace('present_indexer', 'past_indexer')
        .replace('present', 'past_key_values')
      entries[key] = tensor
    } else if (tensor && typeof tensor.dispose === 'function') {
      tensor.dispose()
    }
  }
  if (past) {
    past.update(entries)
    return past
  }
  return new DynamicCache(entries)
}

/**
 * Prefills long prompts in small chunks so ONNX Runtime never allocates a multi-gigabyte
 * `[1, seq_len, 151936]` logits tensor in one `OrtRun()` call (which causes `std::bad_alloc`
 * on 32-bit WASM and low-VRAM GPUs). Leaves the last token for `model.generate()`.
 */
async function prefillInChunks(
  model: PreTrainedModel,
  inputIds: Tensor,
  attentionMask: Tensor,
  chunkSize: number,
): Promise<DynamicCache | null> {
  const total = inputIds.dims[1] ?? 0
  if (total <= chunkSize) return null
  const keepOne = new Tensor('int64', [1n], [])
  let past: DynamicCache | null = null
  try {
    for (let offset = 0; offset < total - 1; offset += chunkSize) {
      if (stopping.interrupted) break
      const end = Math.min(offset + chunkSize, total - 1)
      const chunkIds = inputIds.slice(null, [offset, end])
      const chunkMask = attentionMask.slice(null, [0, end])
      const outputs = (await model.forward({
        input_ids: chunkIds,
        attention_mask: chunkMask,
        num_logits_to_keep: keepOne,
        ...(past ? { past_key_values: past } : {}),
      })) as Record<string, Tensor>
      past = updateKvCache(outputs, past)
    }
    return past
  } catch (err) {
    await past?.dispose().catch(() => {})
    throw err
  }
}

/** Qwen3 thinks aloud unless its answer starts with an empty thought: answers come straight. */
const NO_THINKING = '<think>\n\n</think>\n\n'

async function runGeneration(
  loaded: Loaded,
  req: Extract<LlmRequest, { op: 'generate' }>,
  maxPromptTokens: number,
): Promise<{ tokens: number; ms: number }> {
  const { tokenizer, model, device } = loaded
  const prompt =
    (tokenizer.apply_chat_template(req.messages, {
      add_generation_prompt: true,
      tokenize: false,
    }) as string) + NO_THINKING
  const raw = tokenizer(prompt, { add_special_tokens: false }) as {
    input_ids: Tensor
    attention_mask: Tensor
  }
  const trimmedIds = trimTokenIds(raw.input_ids.data as BigInt64Array, maxPromptTokens)
  const len = trimmedIds.length
  const inputIds =
    trimmedIds === raw.input_ids.data ? raw.input_ids : new Tensor('int64', trimmedIds, [1, len])
  const attentionMask =
    trimmedIds === raw.input_ids.data
      ? raw.attention_mask
      : new Tensor('int64', new BigInt64Array(len).fill(1n), [1, len])

  stopping.reset()
  let tokens = 0
  let first = 0
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) =>
      self.postMessage({ kind: 'text', id: req.id, text } satisfies LlmResponse),
    // Speed from the first token on: the prompt's processing is not generation.
    token_callback_function: () => {
      if (!tokens) first = performance.now()
      tokens++
    },
  })

  const past = await prefillInChunks(model, inputIds, attentionMask, PREFILL_CHUNK[device])
  try {
    if (!stopping.interrupted) {
      await model.generate({
        input_ids: inputIds,
        attention_mask: attentionMask,
        ...(past ? { past_key_values: past } : {}),
        max_new_tokens: req.maxTokens,
        do_sample: req.temperature > 0,
        temperature: Math.max(req.temperature, 0.01),
        top_p: 0.8,
        top_k: 20,
        streamer,
        stopping_criteria: stopping,
      })
    }
  } finally {
    await past?.dispose().catch(() => {})
  }
  const ms = tokens > 1 ? performance.now() - first : 0
  return { tokens: Math.max(tokens - 1, 0), ms }
}

self.onmessage = async (event: MessageEvent<LlmRequest>) => {
  const req = event.data
  if (req.op === 'stop') {
    stopping.interrupt()
    return
  }
  try {
    let loaded = await load(req.model)
    if (req.op === 'load') {
      self.postMessage({
        kind: 'result',
        id: req.id,
        ok: true,
        device: loaded.device,
      } satisfies LlmResponse)
      return
    }
    let result: { tokens: number; ms: number }
    try {
      result = await runGeneration(loaded, req, MAX_PROMPT_TOKENS[loaded.device])
    } catch (err) {
      if (!isOomError(err)) throw err
      // Out of VRAM on WebGPU: release the GPU session and retry on WASM with smaller chunks.
      if (loaded.device === 'webgpu') {
        forceWasm = true
        await disposeCurrent()
        loaded = await load(req.model)
        result = await runGeneration(loaded, req, MAX_PROMPT_TOKENS.wasm)
      } else {
        // Already on WASM: retry once with a compact prompt cap before surfacing a clear OOM error.
        result = await runGeneration(loaded, req, RETRY_WASM_PROMPT_TOKENS)
      }
    }
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: true,
      device: loaded.device,
      tokens: result.tokens,
      ms: result.ms,
    } satisfies LlmResponse)
  } catch (err) {
    const message = isOomError(err)
      ? LOCAL_OOM_CODE
      : err instanceof Error
        ? err.message
        : String(err)
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: false,
      error: message,
    } satisfies LlmResponse)
  }
}
