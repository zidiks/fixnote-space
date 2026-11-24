import { ChatError } from '@fixnote/ai'
import { LOCAL_LLM_MODELS, type LocalLlmKey } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { create } from 'zustand'
import { chatTransport, onLocalOnlyChanged, setLocalOnlyCheck } from '../account/account'
import { platform } from '../platform'

/** Where the assistant's language model runs. */
export type ProviderKind = 'fixnote' | 'custom' | 'ollama' | 'device'
export type Preset = 'openai' | 'openrouter' | 'groq' | 'deepseek' | 'other'

export interface ProviderSettings {
  kind: ProviderKind
  preset: Preset
  /** OpenAI-compatible base URL (…/v1) for `custom`, the Ollama address for `ollama`. */
  baseUrl: string
  model: string
  /**
   * How many tokens the model takes at once, when the person knows better than the guess from the
   * model's name (Ollama's num_ctx, a model we do not know). Not for Fixnote AI.
   */
  contextTokens?: number | null
  /** Which model runs in the app itself (`device`; models.ts, LOCAL_LLM_MODELS). */
  deviceModel?: LocalLlmKey
}

export const PRESETS: Record<
  Exclude<Preset, 'other'>,
  { name: string; baseUrl: string; model: string }
> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' },
}

export const OLLAMA_URL = 'http://localhost:11434'
/** What Fixnote AI is called in requests; llm-proxy picks the real model from `level`. */
const FIXNOTE_MODEL = 'fixnote'
const SETTINGS_KEY = 'ai.provider'
const LOCAL_ONLY_KEY = 'mode.localOnly'
/** The on-device models downloaded on this device (kv, JSON list of LocalLlmKey). */
const DEVICE_MODELS_KEY = 'ai.deviceModels'
/** Their measured speed on this device (kv, JSON { key: tokens per second }). */
const DEVICE_SPEED_KEY = 'ai.deviceSpeed'
export const API_KEY_SECRET = 'llm-api-key'

const DEFAULTS: ProviderSettings = { kind: 'fixnote', preset: 'openai', baseUrl: '', model: '' }

/**
 * How AI changes reach notes, like Claude Code's modes. ask: every change waits for Accept;
 * edits: changes you ask for in a note apply at once (with Undo); auto: Tidy's suggestions too.
 * Everything still goes to the AI activity log.
 */
export type AiMode = 'ask' | 'edits' | 'auto'
export const AI_MODES: readonly AiMode[] = ['ask', 'edits', 'auto']
const AI_MODE_KEY = 'ai.mode'

/**
 * How hard Fixnote AI thinks in the chat. medium: the fast model, no reasoning; hard: the larger
 * model reasoning before it answers, slower and using the monthly allowance several times faster
 * (llm-proxy weighs its tokens).
 */
export type AiLevel = 'medium' | 'hard'
export const AI_LEVELS: readonly AiLevel[] = ['medium', 'hard']
const AI_LEVEL_KEY = 'ai.level'

interface LlmState {
  mode: AiMode
  level: AiLevel
  settings: ProviderSettings
  /** Desktop: nothing leaves the device (no sync, no server AI; Ollama only). */
  localOnly: boolean
  hasKey: boolean
  /** On-device models downloaded here; one of them answers when the device is offline. */
  deviceModels: LocalLlmKey[]
  /** Tokens per second each on-device model made here, measured after its download. */
  deviceSpeed: Partial<Record<LocalLlmKey, number>>
  /** The settings above were read from this device (until then they are defaults). */
  loaded: boolean
}

export const useLlm = create<LlmState>()(() => ({
  mode: 'ask',
  level: 'medium',
  settings: DEFAULTS,
  localOnly: false,
  hasKey: false,
  deviceModels: [],
  deviceSpeed: {},
  loaded: false,
}))

interface Kv {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}
let kv: Kv | null = null

export async function initLlm(store: Kv) {
  kv = store
  let settings = DEFAULTS
  try {
    settings = {
      ...DEFAULTS,
      ...(JSON.parse((await store.get(SETTINGS_KEY)) ?? '{}') as Partial<ProviderSettings>),
    }
  } catch {
    // keep defaults
  }
  const saved = await store.get(AI_MODE_KEY)
  const mode = AI_MODES.find((m) => m === saved) ?? 'ask'
  const savedLevel = await store.get(AI_LEVEL_KEY)
  const level = AI_LEVELS.find((l) => l === savedLevel) ?? 'medium'
  const localOnly = platform.kind === 'desktop' && (await store.get(LOCAL_ONLY_KEY)) === 'on'
  const hasKey = Boolean(await platform.secrets.get(API_KEY_SECRET).catch(() => null))
  const deviceModels = await installedDeviceModels(store)
  let deviceSpeed: LlmState['deviceSpeed'] = {}
  try {
    deviceSpeed = JSON.parse((await store.get(DEVICE_SPEED_KEY)) ?? '{}') as LlmState['deviceSpeed']
  } catch {
    // measured again on the next download
  }
  useLlm.setState({
    mode,
    level,
    settings,
    localOnly,
    hasKey,
    deviceModels,
    deviceSpeed,
    loaded: true,
  })
  if (localOnly) onLocalOnlyChanged(true)
}

export async function saveProvider(patch: Partial<ProviderSettings>) {
  const settings = { ...useLlm.getState().settings, ...patch }
  useLlm.setState({ settings })
  await kv?.set(SETTINGS_KEY, JSON.stringify(settings))
}

export async function saveApiKey(key: string | null) {
  if (key?.trim()) await platform.secrets.set(API_KEY_SECRET, key.trim())
  else await platform.secrets.delete(API_KEY_SECRET)
  useLlm.setState({ hasKey: Boolean(key?.trim()) })
}

export async function setLocalOnly(on: boolean) {
  useLlm.setState({ localOnly: on })
  await kv?.set(LOCAL_ONLY_KEY, on ? 'on' : 'off')
  const { settings, deviceModels } = useLlm.getState()
  if (on && settings.kind !== 'ollama' && settings.kind !== 'device')
    await saveProvider({ kind: deviceModels.length ? 'device' : 'ollama' })
  // Disconnect active Realtime / background sync when entering local-only; resume on exit.
  onLocalOnlyChanged(on)
}

export const isLocalOnly = () => useLlm.getState().localOnly
setLocalOnlyCheck(isLocalOnly)

export interface LlmRoute {
  url: string
  headers: Record<string, string>
  fetch?: typeof fetch
  model: string
  /** More request fields this provider needs. */
  body?: Record<string, unknown>
}

export type LlmUnavailable = 'signed-out' | 'no-key' | 'no-model' | 'local-only' | 'offline'

/** A model on this computer (in the app, or Ollama at localhost) works without the internet. */
function runsHere(s: ProviderSettings): boolean {
  if (s.kind === 'device') return true
  if (s.kind !== 'ollama') return false
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(baseUrlOf(s)).hostname)
  } catch {
    return false
  }
}

/**
 * The words for a request that failed because the connection is gone (the device went offline,
 * or the request could not reach the server at all); null for any other failure.
 */
export function offlineText(err: unknown): string | null {
  if (err instanceof ChatError || runsHere(useLlm.getState().settings)) return null
  const message = err instanceof Error ? err.message : String(err)
  const network =
    !navigator.onLine ||
    err instanceof TypeError ||
    /failed to fetch|network|connection|offline|timed? ?out|dns|resolve/i.test(message)
  return network ? i18n.t('aiProvider.unavailable.offline') : null
}

/** Translates local ONNX out-of-memory errors (`std::bad_alloc` / `FIXNOTE_LOCAL_LLM_OOM`). */
export function localOomText(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (
    /FIXNOTE_LOCAL_LLM_OOM|bad_alloc|out of memory|cannot allocate|allocation failed/i.test(message)
  ) {
    return i18n.t('deviceModels.outOfMemory')
  }
  return null
}

/** True when the current request will actually run on a downloaded on-device model. */
export function isUsingDeviceModel(): boolean {
  const { settings: s, localOnly, deviceModels } = useLlm.getState()
  if (s.kind === 'device') return true
  if (!deviceModels.length) return false
  if (localOnly && s.kind !== 'ollama') return true
  if (typeof navigator !== 'undefined' && !navigator.onLine && !runsHere(s)) return true
  return false
}

const trimSlash = (url: string) => url.trim().replace(/\/+$/, '')

export function baseUrlOf(s: ProviderSettings): string {
  if (s.kind === 'ollama') return trimSlash(s.baseUrl || OLLAMA_URL)
  if (s.preset !== 'other') return PRESETS[s.preset].baseUrl
  return trimSlash(s.baseUrl)
}

export function modelOf(s: ProviderSettings): string {
  if (s.kind === 'fixnote') return FIXNOTE_MODEL
  if (s.model.trim()) return s.model.trim()
  return s.kind === 'custom' && s.preset !== 'other' ? PRESETS[s.preset].model : ''
}

/** How the chat, AI edits and Tidy reach a model right now. */
export async function llm(): Promise<
  { ok: true; route: LlmRoute } | { ok: false; reason: LlmUnavailable }
> {
  const { settings: s, localOnly, deviceModels } = useLlm.getState()
  if (s.kind === 'device') return deviceRoute(s.deviceModel)
  // No internet (or nothing may leave the device) and a model here: it answers instead.
  const fallback = deviceModels.at(-1)
  if (localOnly && !runsHere(s))
    return fallback ? deviceRoute(fallback) : { ok: false, reason: 'local-only' }
  if (!navigator.onLine && !runsHere(s))
    return fallback ? deviceRoute(fallback) : { ok: false, reason: 'offline' }
  if (s.kind === 'fixnote') {
    const t = await chatTransport()
    return t
      ? { ok: true, route: { ...t, model: FIXNOTE_MODEL } }
      : { ok: false, reason: 'signed-out' }
  }
  const model = modelOf(s)
  if (!model) return { ok: false, reason: 'no-model' }
  // The desktop app goes through its own HTTP (no CORS, localhost allowed).
  const viaApp = platform.httpFetch
  if (s.kind === 'ollama') {
    return {
      ok: true,
      route: {
        url: `${baseUrlOf(s)}/v1/chat/completions`,
        headers: {},
        model,
        ...(viaApp ? { fetch: viaApp } : {}),
      },
    }
  }
  const key = await platform.secrets.get(API_KEY_SECRET).catch(() => null)
  if (!key) return { ok: false, reason: 'no-key' }
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` }
  if (s.preset === 'openrouter') {
    headers['HTTP-Referer'] = 'https://fixnote.space'
    headers['X-Title'] = 'Fixnote'
  }
  // DeepSeek's models think by default, and with tools then want their reasoning back with every
  // earlier answer, which the chat does not keep: plain answers, as with the other providers.
  const deepseek = baseUrlOf(s).includes('api.deepseek.com')
  return {
    ok: true,
    route: {
      url: `${baseUrlOf(s)}/chat/completions`,
      headers,
      model,
      ...(deepseek ? { body: { thinking: { type: 'disabled' } } } : {}),
      ...(viaApp ? { fetch: viaApp } : {}),
    },
  }
}

/** The model running in the app: its fetch answers like an OpenAI endpoint (platform-web/llm). */
function deviceRoute(
  key: LocalLlmKey | undefined,
): { ok: true; route: LlmRoute } | { ok: false; reason: LlmUnavailable } {
  const { deviceModels } = useLlm.getState()
  const pick = key && deviceModels.includes(key) ? key : deviceModels.at(-1)
  const local = platform.localLlm?.()
  if (!pick || !local) return { ok: false, reason: 'no-model' }
  return {
    ok: true,
    route: {
      url: 'local://chat',
      headers: {},
      model: LOCAL_LLM_MODELS[pick].id,
      fetch: local.fetch,
    },
  }
}

const DEVICE_ORDER = Object.keys(LOCAL_LLM_MODELS) as LocalLlmKey[]

/** The on-device models this device has: recorded when downloaded, and still there. */
async function installedDeviceModels(store: Kv): Promise<LocalLlmKey[]> {
  let keys: LocalLlmKey[] = []
  try {
    keys = (JSON.parse((await store.get(DEVICE_MODELS_KEY)) ?? '[]') as string[]).filter(
      (k): k is LocalLlmKey => k in LOCAL_LLM_MODELS,
    )
  } catch {
    return []
  }
  const present = await Promise.all(
    keys.map(async (k) => {
      const id = LOCAL_LLM_MODELS[k].id
      if (platform.models?.has) return platform.models.has(id).catch(() => false)
      return ((await platform.models?.size(id).catch(() => 0)) ?? 0) > 0
    }),
  )
  return keys.filter((_, i) => present[i])
}

/** Downloads (the first time) and loads an on-device model; it then shows as installed. */
export async function installDeviceModel(key: LocalLlmKey, onProgress?: (p: number) => void) {
  const local = platform.localLlm?.()
  if (!local) throw new Error('On-device models are not available here')
  await local.load(LOCAL_LLM_MODELS[key].id, onProgress)
  // How fast it really is here: the badge in Settings shows this instead of the guess.
  const speed = await local.benchmark(LOCAL_LLM_MODELS[key].id).catch(() => 0)
  if (speed > 0) {
    const deviceSpeed = { ...useLlm.getState().deviceSpeed, [key]: Math.round(speed * 10) / 10 }
    useLlm.setState({ deviceSpeed })
    await kv?.set(DEVICE_SPEED_KEY, JSON.stringify(deviceSpeed))
  }
  const deviceModels = [...new Set([...useLlm.getState().deviceModels, key])].sort(
    (a, b) => DEVICE_ORDER.indexOf(a) - DEVICE_ORDER.indexOf(b),
  )
  useLlm.setState({ deviceModels })
  await kv?.set(DEVICE_MODELS_KEY, JSON.stringify(deviceModels))
}

/** Removes an on-device model's files; a chat that used it goes back to Fixnote AI. */
export async function removeDeviceModel(key: LocalLlmKey) {
  platform.localLlm?.().unload()
  await platform.models?.remove(LOCAL_LLM_MODELS[key].id)
  const deviceModels = useLlm.getState().deviceModels.filter((k) => k !== key)
  useLlm.setState({ deviceModels })
  await kv?.set(DEVICE_MODELS_KEY, JSON.stringify(deviceModels))
  const s = useLlm.getState().settings
  if (s.kind === 'device' && (s.deviceModel ?? 'small') === key)
    await saveProvider(
      deviceModels.length ? { deviceModel: deviceModels.at(-1) } : { kind: 'fixnote' },
    )
}

/** A small on-device ONNX model stays fast and avoids WASM/WebGPU OOM with a compact window. */
export const DEVICE_WINDOW = 4096

/** What a chat may send and get back, in tokens. */
export interface ContextLimits {
  /** What the model takes at once (prompt and answer). */
  window: number
  /** What a chat's prompt may take: the window less the answer, or less where it costs. */
  prompt: number
  /** The longest answer of one step (`max_tokens`; a thinking model's reasoning counts in it). */
  answer: number
}

/** Fixnote AI's models (deepseek-flash, deepseek-v4-pro) take 1M tokens (DeepSeek docs, 2026). */
export const FIXNOTE_WINDOW = 1_000_000
/**
 * What a chat with Fixnote AI sends at most. Every step of an answer sends the whole prompt and
 * counts against the monthly allowance (cached tokens a tenth), so a chat is summarized long
 * before the window is full.
 */
export const FIXNOTE_CHAT_TOKENS = 64_000
/** Answers: medium leaves room for rewriting a long note in one call; hard also reasons. */
export const FIXNOTE_ANSWER = { medium: 8192, hard: 16_000 } as const
/** With the person's own key, a chat still stops growing here (their money, and slower answers). */
const OWN_KEY_CHAT_TOKENS = 128_000
/** Ollama runs with a short context unless its num_ctx is raised (then set it in Settings). */
export const OLLAMA_WINDOW = 8192

/** The context of a model by its name (known families; small when unknown). */
export function modelWindow(s: ProviderSettings): number {
  if (s.kind === 'fixnote') return FIXNOTE_WINDOW
  if (s.kind === 'ollama') return OLLAMA_WINDOW
  if (s.kind === 'device') return DEVICE_WINDOW
  const model = modelOf(s).toLowerCase()
  if (/gpt-4\.1|gemini|deepseek-(flash|v4)/.test(model)) return 1_000_000
  if (/gpt-5/.test(model)) return 400_000
  if (/claude/.test(model)) return 200_000
  if (/gpt-4o|(^|\/)o\d|llama-3\.[1-3]|llama-4|qwen|mistral-large|deepseek/.test(model))
    return 128_000
  return 32_000
}

/** How much the current model takes and gives, for the chat (configurable in Settings → AI). */
export function contextLimits(): ContextLimits {
  const { settings: s, level } = useLlm.getState()
  if (isUsingDeviceModel()) {
    return { window: DEVICE_WINDOW, prompt: 3072, answer: 1024 }
  }
  if (s.kind === 'fixnote') {
    return { window: FIXNOTE_WINDOW, prompt: FIXNOTE_CHAT_TOKENS, answer: FIXNOTE_ANSWER[level] }
  }
  const window = s.contextTokens && s.contextTokens >= 2048 ? s.contextTokens : modelWindow(s)
  const answer = Math.min(8192, Math.max(1024, Math.floor(window / 4)))
  return { window, prompt: Math.min(window - answer, OWN_KEY_CHAT_TOKENS), answer }
}

/** Who answers, for the AI activity log. */
export function providerLabel(): string {
  const s = useLlm.getState().settings
  if (s.kind === 'fixnote') return 'DeepSeek · Fixnote'
  if (s.kind === 'ollama') return `Ollama · ${modelOf(s)}`
  if (s.kind === 'device')
    return `On this device · ${LOCAL_LLM_MODELS[s.deviceModel ?? 'small'].id.split('/').pop()}`
  const name =
    s.preset === 'other' ? new URL(baseUrlOf(s) || 'http://custom').host : PRESETS[s.preset].name
  return `${name} · ${modelOf(s)}`
}

/** Models installed in Ollama (`ollama list`). */
export async function ollamaModels(baseUrl: string): Promise<string[]> {
  const f = platform.httpFetch ?? fetch
  const res = await f(`${trimSlash(baseUrl || OLLAMA_URL)}/api/tags`)
  if (!res.ok) throw new Error(`Ollama: HTTP ${res.status}`)
  const json = (await res.json()) as { models?: { name: string }[] }
  return (json.models ?? []).map((m) => m.name)
}

export async function setAiMode(mode: AiMode) {
  useLlm.setState({ mode })
  await kv?.set(AI_MODE_KEY, mode)
}

export async function setAiLevel(level: AiLevel) {
  useLlm.setState({ level })
  await kv?.set(AI_LEVEL_KEY, level)
}
