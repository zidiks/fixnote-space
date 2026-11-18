/// <reference lib="webworker" />
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  env,
  InterruptableStoppingCriteria,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  TextStreamer,
} from '@huggingface/transformers'
import { ortPaths } from '../ort'
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
const stopping = new InterruptableStoppingCriteria()

/** The GPU here: none, or one with or without 16-bit floats (older GPUs, e.g. NVIDIA Pascal). */
async function webGpu(): Promise<'none' | 'f16' | 'f32'> {
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

/** Qwen3 thinks aloud unless its answer starts with an empty thought: answers come straight. */
const NO_THINKING = '<think>\n\n</think>\n\n'

self.onmessage = async (event: MessageEvent<LlmRequest>) => {
  const req = event.data
  if (req.op === 'stop') {
    stopping.interrupt()
    return
  }
  try {
    const { tokenizer, model, device } = await load(req.model)
    if (req.op === 'load') {
      self.postMessage({ kind: 'result', id: req.id, ok: true, device } satisfies LlmResponse)
      return
    }
    const prompt =
      (tokenizer.apply_chat_template(req.messages, {
        add_generation_prompt: true,
        tokenize: false,
      }) as string) + NO_THINKING
    const inputs = tokenizer(prompt, { add_special_tokens: false })
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
    await model.generate({
      ...inputs,
      max_new_tokens: req.maxTokens,
      do_sample: req.temperature > 0,
      temperature: Math.max(req.temperature, 0.01),
      top_p: 0.8,
      top_k: 20,
      streamer,
      stopping_criteria: stopping,
    })
    const ms = tokens > 1 ? performance.now() - first : 0
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: true,
      device,
      tokens: Math.max(tokens - 1, 0),
      ms,
    } satisfies LlmResponse)
  } catch (err) {
    self.postMessage({
      kind: 'result',
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies LlmResponse)
  }
}
