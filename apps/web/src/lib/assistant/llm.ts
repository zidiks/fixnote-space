import { create } from 'zustand'
import { chatTransport, requestSync, setLocalOnlyCheck } from '../account/account'
import { platform } from '../platform'

/** Where the assistant's language model runs. */
export type ProviderKind = 'fixnote' | 'custom' | 'ollama'
export type Preset = 'openai' | 'openrouter' | 'groq' | 'deepseek' | 'other'

export interface ProviderSettings {
  kind: ProviderKind
  preset: Preset
  /** OpenAI-compatible base URL (…/v1) for `custom`, the Ollama address for `ollama`. */
  baseUrl: string
  model: string
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
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
}

export const OLLAMA_URL = 'http://localhost:11434'
const FIXNOTE_MODEL = 'deepseek-chat'
const SETTINGS_KEY = 'ai.provider'
const LOCAL_ONLY_KEY = 'mode.localOnly'
export const API_KEY_SECRET = 'llm-api-key'

const DEFAULTS: ProviderSettings = { kind: 'fixnote', preset: 'openai', baseUrl: '', model: '' }

interface LlmState {
  settings: ProviderSettings
  /** Desktop: nothing leaves the device (no sync, no server AI; Ollama only). */
  localOnly: boolean
  hasKey: boolean
}

export const useLlm = create<LlmState>()(() => ({
  settings: DEFAULTS,
  localOnly: false,
  hasKey: false,
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
  const localOnly = platform.kind === 'desktop' && (await store.get(LOCAL_ONLY_KEY)) === 'on'
  const hasKey = Boolean(await platform.secrets.get(API_KEY_SECRET).catch(() => null))
  useLlm.setState({ settings, localOnly, hasKey })
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
  if (on && useLlm.getState().settings.kind !== 'ollama') await saveProvider({ kind: 'ollama' })
  // Back from local-only: catch up with the other devices.
  if (!on) requestSync()
}

export const isLocalOnly = () => useLlm.getState().localOnly
setLocalOnlyCheck(isLocalOnly)

export interface LlmRoute {
  url: string
  headers: Record<string, string>
  fetch?: typeof fetch
  model: string
}

export type LlmUnavailable = 'signed-out' | 'no-key' | 'no-model' | 'local-only'

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
  const { settings: s, localOnly } = useLlm.getState()
  if (localOnly && s.kind !== 'ollama') return { ok: false, reason: 'local-only' }
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
    headers['X-Title'] = 'FixNote'
  }
  return {
    ok: true,
    route: {
      url: `${baseUrlOf(s)}/chat/completions`,
      headers,
      model,
      ...(viaApp ? { fetch: viaApp } : {}),
    },
  }
}

/** Who answers, for the AI activity log. */
export function providerLabel(): string {
  const s = useLlm.getState().settings
  if (s.kind === 'fixnote') return 'DeepSeek · FixNote'
  if (s.kind === 'ollama') return `Ollama · ${modelOf(s)}`
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
