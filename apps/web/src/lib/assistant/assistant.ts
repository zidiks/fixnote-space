import {
  buildAgentMessages,
  buildSummaryMessages,
  ChatError,
  type ChatRequest,
  confidence,
  expandQuery,
  parseCitations,
  streamChat,
  type Turn,
} from '@fixnote/ai'
import {
  type AuditLog,
  type BlobStore,
  type ChatEntry,
  ChatRepo,
  type ChatScope,
  type Embedder,
  Indexer,
  type NotesRepo,
  NoteTools,
  OPEN_GATE,
  retrieve,
  type SimilarNote,
  type SqlDriver,
  sameScope,
  similarNotes,
  type VoiceClip,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { create } from 'zustand'
import { aiRefusalText } from '../plan'
import {
  actionCollector,
  type ConfirmAnswer,
  type ConfirmRequest,
  runAgent,
  TOOLS_TOKENS,
} from './agent'
import { contextWindow, type LlmUnavailable, llm as llmRoute, providerLabel, useLlm } from './llm'
import { openNote } from './open-notes'

export type AssistantStatus = 'idle' | 'thinking' | 'answering' | 'done' | 'error'
export type SemanticState = 'off' | 'loading' | 'ready' | 'unavailable'

interface AssistantState {
  messages: ChatEntry[]
  status: AssistantStatus
  error: string | null
  /** The error is FixNote AI saying no (plan or allowance), not a failure: shown calmly. */
  refused: boolean
  scopeMode: 'auto' | 'all'
  semantic: SemanticState
  modelProgress: number
  pending: number
  /** What the assistant is doing right now ("Searching «bot»"), while it answers. */
  activity: string | null
  /** A change waiting for the user's yes (delete, or any change in ask mode). */
  confirm: ConfirmRequest | null
  /** How full the model's context is with this conversation, 0..1. */
  context: number
}

export const useAssistant = create<AssistantState>()(() => ({
  messages: [],
  status: 'idle',
  error: null,
  refused: false,
  scopeMode: 'auto',
  semantic: 'off',
  modelProgress: 0,
  pending: 0,
  activity: null,
  confirm: null,
  context: 0,
}))

const set = useAssistant.setState

export { providerLabel }

const SEMANTIC_KEY = 'assistant.semantic'

interface Deps {
  db: SqlDriver
  embedder: () => Promise<Embedder>
  /** Recordings of voice messages. */
  blobs: BlobStore
  /** The assistant changes notes through the same repository and activity log as the app. */
  repo: NotesRepo
  audit: AuditLog
  /** Notes changed: the app refreshes what it shows. */
  onNotesChanged: () => void
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
  void measureContext()
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
  aiRefusalText(err) ??
  (err instanceof ChatError ? err.message : err instanceof Error ? err.message : String(err))

/** Rough share of the model's context the conversation takes (the ring by the input). */
const SYSTEM_TOKENS = 700
/** Past this share of the context, the start of the thread is summarized. */
const HISTORY_SHARE = 0.45
/** What the summary leaves of the thread word for word. */
const KEEP_SHARE = 0.2

/** An answer as the model will remember it: its text and what it changed. */
function turnOf(m: ChatEntry): Turn {
  if (m.kind === 'user') return { role: 'user', content: m.content }
  const done = m.actions?.items.length
    ? `\n\n[${m.actions.undone ? 'Undone by the user' : 'Done'}: ${m.actions.items.map((a) => a.label).join('; ')}]`
    : ''
  return { role: 'assistant', content: m.content + done }
}

/** The thread since "new chat" (after the summary, when there is one), as turns. */
async function memory(): Promise<{ summary: string | null; turns: Turn[]; upTo: number[] }> {
  const saved = await chat?.summary()
  const entries = useAssistant
    .getState()
    .messages.filter(
      (m) =>
        (m.kind === 'user' || m.kind === 'assistant') &&
        m.status !== 'error' &&
        m.status !== 'streaming' &&
        (m.content || m.actions?.items.length) &&
        m.createdAt > (saved?.upTo ?? 0),
    )
  return {
    summary: saved?.text ?? null,
    turns: entries.map(turnOf),
    upTo: entries.map((m) => m.createdAt),
  }
}

const turnsTokens = (turns: Turn[]) => turns.reduce((n, t) => n + 4 + t.content.length / 3, 0)

/**
 * When the thread no longer fits comfortably, its older part becomes a short summary the model
 * reads instead (kept until "new chat"). On failure the older part is just left out.
 */
async function compact(
  request: Omit<ChatRequest, 'messages'>,
  mem: Awaited<ReturnType<typeof memory>>,
): Promise<{ summary: string | null; turns: Turn[] }> {
  const window = contextWindow()
  if (turnsTokens(mem.turns) <= window * HISTORY_SHARE) return mem
  let keep = mem.turns.length
  while (keep > 0 && turnsTokens(mem.turns.slice(keep - 1)) <= window * KEEP_SHARE) keep--
  // Whole exchanges only: the kept part starts with a question.
  while (keep < mem.turns.length && mem.turns[keep]?.role !== 'user') keep++
  const older = mem.turns.slice(0, keep)
  const kept = mem.turns.slice(keep)
  const upTo = mem.upTo[keep - 1] ?? 0
  set({ activity: i18n.t('agent.compacting') })
  try {
    let text = ''
    for await (const d of streamChat({
      ...request,
      messages: buildSummaryMessages(mem.summary, older),
      maxTokens: 400,
    })) {
      text += d
    }
    if (text.trim()) {
      await chat?.setSummary({ text: text.trim(), upTo })
      return { summary: text.trim(), turns: kept }
    }
  } catch (err) {
    if (request.signal?.aborted) throw err
  } finally {
    set({ activity: null })
  }
  return { summary: mem.summary, turns: kept }
}

/** Updates the ring by the input: how much of the context the thread takes now. */
async function measureContext() {
  const mem = await memory()
  const tokens =
    SYSTEM_TOKENS +
    TOOLS_TOKENS +
    (mem.summary ? mem.summary.length / 3 : 0) +
    turnsTokens(mem.turns)
  set({ context: Math.min(1, tokens / contextWindow()) })
}

let confirming: ((answer: ConfirmAnswer) => void) | null = null

/** The user's answer to the change waiting for it. */
export function answerConfirm(answer: ConfirmAnswer) {
  const resolve = confirming
  confirming = null
  set({ confirm: null })
  resolve?.(answer)
}

function askUser(request: ConfirmRequest, signal: AbortSignal): Promise<ConfirmAnswer> {
  confirming?.('deny')
  return new Promise((resolve) => {
    if (signal.aborted) return resolve('deny')
    confirming = resolve
    set({ confirm: request })
    signal.addEventListener('abort', () => answerConfirm('deny'), { once: true })
  })
}

/**
 * Asks the assistant something in `scope`, streaming the answer into the thread. It reads the
 * notes it needs and changes them when asked (with the note tools of core, like the MCP server);
 * the changes are listed under the answer, where one click takes them all back.
 */
export async function ask(
  question: string,
  scope: ChatScope,
  opts: { voice?: VoiceClip } = {},
): Promise<'ok' | LlmUnavailable> {
  const repo = chat
  const d = deps
  if (!repo || !d || !question.trim()) return 'ok'
  const reach = await llmRoute()
  if (!reach.ok) {
    set({ status: 'error', error: unavailableText(reach.reason), refused: false })
    return reach.reason
  }
  const route = reach.route

  clearTimeout(doneTimer)
  const before = useAssistant.getState().messages
  const mem = await memory()

  const lastQuestion = [...before].reverse().find((m) => m.kind === 'user')
  const added: ChatEntry[] = []
  if (lastQuestion ? !sameScope(lastQuestion.scope, scope) : scope.kind !== 'all') {
    added.push(await repo.add({ kind: 'divider', content: '', scope }))
  }
  added.push(
    await repo.add({
      kind: 'user',
      content: question.trim(),
      scope,
      ...(opts.voice ? { voice: opts.voice } : {}),
    }),
  )
  const answer = await repo.add({ kind: 'assistant', content: '', scope, status: 'streaming' })
  added.push(answer)
  set((s) => ({ messages: [...s.messages, ...added], status: 'thinking', error: null }))

  controller?.abort()
  const ctrl = new AbortController()
  controller = ctrl
  let text = ''
  const done = actionCollector()
  /** The note the assistant is changing now, if it is open. */
  let editing: string | null = null
  const tools = new NoteTools(d.db, d.repo, d.audit, {
    gate: OPEN_GATE,
    provider: providerLabel,
    kinds: 'chat',
    onChange: (action) => {
      done.add(action.id)
      // A note open on screen shows the change as it happens.
      for (const c of action.changes) {
        if (c.before && c.after && c.before.content !== c.after.content)
          openNote(c.noteId)?.aiChanged(c.after.content)
      }
      patchMessage(answer.id, { actions: { items: [...done.items], undone: false } })
      d.onNotesChanged()
    },
  })
  try {
    const llm = { ...route, signal: ctrl.signal }
    const { summary, turns } = await compact(llm, mem)
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
    const messages = buildAgentMessages({
      question: question.trim(),
      fragments,
      scope,
      history: turns,
      summary,
    })
    text = await runAgent(
      {
        request: llm,
        messages,
        tools,
        repo: d.repo,
        mode: useLlm.getState().mode,
        onText: (t) => {
          if (!text) set({ status: 'answering' })
          text = t
          patchMessage(answer.id, { content: t })
        },
        onActivity: (activity) => set({ activity }),
        onEditing: (id) => {
          if (id) {
            editing = id
            openNote(id)?.aiStarts()
          } else if (editing) {
            openNote(editing)?.aiEnds()
            editing = null
          }
        },
        confirm: (request) => askUser(request, ctrl.signal),
      },
      done.label,
    )
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
    set({
      status: aborted ? 'idle' : 'error',
      error: aborted ? null : errorText(err),
      refused: !aborted && aiRefusalText(err) !== null,
    })
    if (!aborted) doneTimer = setTimeout(() => set({ status: 'idle' }), 4000)
  } finally {
    if (controller === ctrl) controller = null
    set({ activity: null })
    if (done.items.length) {
      await repo.setActions(answer.id, { items: done.items, undone: false })
    }
    void measureContext()
  }
  return 'ok'
}

/**
 * Takes back everything one answer changed, newest first. Stops at a change the user has edited
 * since (that one and older stay); returns how it went.
 */
export async function undoAnswer(id: string): Promise<'ok' | 'changed'> {
  const d = deps
  const entry = useAssistant.getState().messages.find((m) => m.id === id)
  if (!d || !chat || !entry?.actions || entry.actions.undone) return 'ok'
  let result: 'ok' | 'changed' = 'ok'
  for (const action of [...entry.actions.items].reverse()) {
    const r = await d.audit.undo(action.id)
    if (!r.ok && r.reason === 'changed') {
      result = 'changed'
      break
    }
  }
  if (result === 'ok') {
    const actions = { ...entry.actions, undone: true }
    await chat.setActions(id, actions)
    patchMessage(id, { actions })
  }
  d.onNotesChanged()
  return result
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
  const recordings = (await chat?.clear()) ?? []
  for (const key of recordings) await deps?.blobs.delete(key).catch(() => undefined)
  set({ messages: [], status: 'idle', error: null, context: 0 })
  void measureContext()
}
