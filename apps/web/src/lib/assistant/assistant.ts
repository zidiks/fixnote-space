import {
  buildMessages,
  ChatError,
  confidence,
  expandQuery,
  parseCitations,
  streamChat,
} from '@fixnote/ai'
import {
  type ChatEntry,
  ChatRepo,
  type ChatScope,
  type Embedder,
  Indexer,
  retrieve,
  type SimilarNote,
  type SqlDriver,
  sameScope,
  similarNotes,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { create } from 'zustand'
import { type LlmUnavailable, llm as llmRoute } from './llm'

export type AssistantStatus = 'idle' | 'thinking' | 'answering' | 'done' | 'error'
export type SemanticState = 'off' | 'loading' | 'ready' | 'unavailable'

interface AssistantState {
  messages: ChatEntry[]
  status: AssistantStatus
  error: string | null
  scopeMode: 'auto' | 'all'
  semantic: SemanticState
  modelProgress: number
  pending: number
}

export const useAssistant = create<AssistantState>()(() => ({
  messages: [],
  status: 'idle',
  error: null,
  scopeMode: 'auto',
  semantic: 'off',
  modelProgress: 0,
  pending: 0,
}))

const set = useAssistant.setState

export { providerLabel } from './llm'

const SEMANTIC_KEY = 'assistant.semantic'

interface Deps {
  db: SqlDriver
  embedder: () => Promise<Embedder>
}

let deps: Deps | null = null
let chat: ChatRepo | null = null
let indexer: Indexer | null = null
let controller: AbortController | null = null
let indexing: Promise<void> | null = null
let indexTimer: ReturnType<typeof setTimeout> | undefined
let doneTimer: ReturnType<typeof setTimeout> | undefined

export async function initAssistant(d: Deps) {
  deps = d
  chat = new ChatRepo(d.db)
  set({ messages: await chat.recent() })
  const [row] = await d.db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
    SEMANTIC_KEY,
  ])
  // The model downloads once, on the first visit to the assistant; later launches just load it.
  if (row?.value === 'on') void enableSemantic()
}

/** Loads the embedding model (first time: ~120 MB download) and indexes notes in the background. */
export async function enableSemantic() {
  if (!deps) return
  const state = useAssistant.getState().semantic
  if (state === 'loading' || state === 'ready') return
  set({ semantic: 'loading', modelProgress: 0 })
  try {
    const embedder = await deps.embedder()
    await embedder.ready((p) => set({ modelProgress: p }))
    const ix = new Indexer(deps.db, embedder)
    await ix.prepare()
    indexer = ix
    await deps.db.execute(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [SEMANTIC_KEY, 'on'],
    )
    set({ semantic: 'ready' })
    void runIndexing()
  } catch {
    set({ semantic: 'unavailable' })
  }
}

function runIndexing(): Promise<void> {
  const ix = indexer
  if (!ix) return Promise.resolve()
  indexing ??= (async () => {
    try {
      let left = await ix.pendingCount()
      set({ pending: left })
      while (left > 0) {
        left = await ix.indexSome(8)
        set({ pending: left })
        await new Promise((r) => setTimeout(r, 30))
      }
    } catch {
      // Try again on the next change.
    } finally {
      indexing = null
    }
  })()
  return indexing
}

/** Notes changed: re-embed them a little later, after typing settles. */
export function notifyNotesChanged() {
  if (!indexer) return
  clearTimeout(indexTimer)
  indexTimer = setTimeout(() => void runIndexing(), 3000)
}

/** Notes close in meaning to `query`; empty until the semantic index is on. */
export async function findSimilar(query: string, limit = 8): Promise<SimilarNote[]> {
  const ix = indexer
  if (!deps || !ix || useAssistant.getState().semantic !== 'ready' || query.trim().length < 3)
    return []
  try {
    return await similarNotes(deps.db, ix, query.trim(), { limit })
  } catch {
    return []
  }
}

export function setScopeMode(scopeMode: 'auto' | 'all') {
  set({ scopeMode })
}

function patchMessage(id: string, patch: Partial<ChatEntry>) {
  set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
}

const errorText = (err: unknown) =>
  err instanceof ChatError ? err.message : err instanceof Error ? err.message : String(err)

/** Asks one question about the notes in `scope`, streaming the answer into the thread. */
export async function ask(question: string, scope: ChatScope): Promise<'ok' | LlmUnavailable> {
  const repo = chat
  const d = deps
  if (!repo || !d || !question.trim()) return 'ok'
  const reach = await llmRoute()
  if (!reach.ok) {
    set({ status: 'error', error: unavailableText(reach.reason) })
    return reach.reason
  }
  const route = reach.route

  clearTimeout(doneTimer)
  const before = useAssistant.getState().messages
  const history = before
    .filter((m) => (m.kind === 'user' || m.kind === 'assistant') && m.status !== 'error')
    .slice(-6)
    .map((m) => ({ role: m.kind as 'user' | 'assistant', content: m.content }))

  const lastQuestion = [...before].reverse().find((m) => m.kind === 'user')
  const added: ChatEntry[] = []
  if (lastQuestion ? !sameScope(lastQuestion.scope, scope) : scope.kind !== 'all') {
    added.push(await repo.add({ kind: 'divider', content: '', scope }))
  }
  added.push(await repo.add({ kind: 'user', content: question.trim(), scope }))
  const answer = await repo.add({ kind: 'assistant', content: '', scope, status: 'streaming' })
  added.push(answer)
  set((s) => ({ messages: [...s.messages, ...added], status: 'thinking', error: null }))

  controller?.abort()
  const ctrl = new AbortController()
  controller = ctrl
  let text = ''
  try {
    const llm = { ...route, signal: ctrl.signal }
    // Notes mix languages ("giveaway" vs "розыгрыш"): ask the model for translations and synonyms
    // of the question first. Best effort — on failure or timeout it's just the question's words.
    const extraKeywords = scope.kind === 'note' ? [] : await expandQuery(llm, question)
    const fragments = await retrieve(
      d.db,
      useAssistant.getState().semantic === 'ready' ? indexer : null,
      question,
      scope,
      { extraKeywords },
    )
    const messages = buildMessages({ question: question.trim(), fragments, scope, history })
    for await (const delta of streamChat({ ...llm, messages })) {
      if (!text) set({ status: 'answering' })
      text += delta
      patchMessage(answer.id, { content: text })
    }
    const citations = parseCitations(text, fragments)
    const conf = confidence(citations, fragments)
    await repo.finish(answer.id, { content: text, status: 'done', citations, confidence: conf })
    patchMessage(answer.id, { content: text, status: 'done', citations, confidence: conf })
    set({ status: 'done' })
    doneTimer = setTimeout(() => set({ status: 'idle' }), 1600)
  } catch (err) {
    const aborted = ctrl.signal.aborted
    const status = aborted ? 'stopped' : 'error'
    await repo.finish(answer.id, { content: text, status })
    patchMessage(answer.id, { content: text, status })
    set({ status: aborted ? 'idle' : 'error', error: aborted ? null : errorText(err) })
    if (!aborted) doneTimer = setTimeout(() => set({ status: 'idle' }), 4000)
  } finally {
    if (controller === ctrl) controller = null
  }
  return 'ok'
}

/** Why the model cannot be reached, in the UI language. */
export function unavailableText(reason: LlmUnavailable): string {
  return i18n.t(`aiProvider.unavailable.${reason}`)
}

export function stop() {
  controller?.abort()
}

export async function clearChat() {
  stop()
  await chat?.clear()
  set({ messages: [], status: 'idle', error: null })
}
