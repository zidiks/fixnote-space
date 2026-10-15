import {
  type AgentInput,
  buildAgentMessages,
  buildSummaryMessages,
  ChatError,
  type ChatRequest,
  confidence,
  estimateTokens,
  historyAnswer,
  historyMessages,
  messagesTokens,
  overflow,
  type PastTurn,
  parseCitations,
  planContext,
  planSearch,
  streamChat,
  summaryBatches,
} from '@fixnote/ai'
import {
  type AuditLog,
  type BlobStore,
  type ChatEntry,
  ChatRepo,
  type ChatScope,
  type ChatTrace,
  type Embedder,
  Indexer,
  type NotesRepo,
  NoteTools,
  OPEN_GATE,
  readMemory,
  retrieve,
  type SimilarNote,
  type SqlDriver,
  sameScope,
  similarNotes,
  type VoiceClip,
  withFact,
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
import { pastTurns } from './history'
import {
  type ContextLimits,
  contextLimits,
  type LlmUnavailable,
  llm as llmRoute,
  providerLabel,
  useLlm,
} from './llm'
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
  /** What the assistant knows about the user (Settings → AI), sent with every message. */
  memoryText: string
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
  memoryText: '',
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
  await loadAssistantMemory()
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

/** What the rules and the tools take of the context, roughly (the ring by the input). */
const SYSTEM_TOKENS = 1500

interface Memory {
  summary: string | null
  turns: PastTurn[]
  /** Turns asked up to this time have their tool results cleared. */
  cleared: number
}

/** The thread since "new chat" (after the summary, when there is one). */
async function memory(): Promise<Memory> {
  const saved = await chat?.summary()
  const cleared = (await chat?.cleared()) ?? 0
  const turns = pastTurns(useAssistant.getState().messages).filter((t) => t.at > (saved?.upTo ?? 0))
  return { summary: saved?.text ?? null, turns, cleared }
}

/**
 * Folds `turns` into the running summary, in rounds that fit a small model. Null when the model
 * fails: then nothing is lost, the turns stay and it is tried again on the next message.
 */
async function summarize(
  request: Omit<ChatRequest, 'messages'>,
  previous: string | null,
  turns: PastTurn[],
  limits: ContextLimits,
): Promise<string | null> {
  const target = Math.max(300, Math.min(1500, Math.floor(limits.prompt * 0.08)))
  let summary = previous
  for (const batch of summaryBatches(turns, Math.floor(limits.prompt * 3 * 0.5))) {
    let text = ''
    for await (const d of streamChat({
      ...request,
      messages: buildSummaryMessages(summary, batch, target),
      maxTokens: target * 2,
    })) {
      text += d
    }
    if (!text.trim()) return null
    summary = text.trim()
  }
  return summary
}

/**
 * Makes the thread fit the model before a request, the way Claude Code does: old tool results
 * become a stub first; when that is not enough, the oldest turns are summarized (kept until "new
 * chat"); if summarizing fails, the oldest turns are left out of this one request only.
 */
async function fitContext(
  request: Omit<ChatRequest, 'messages'>,
  mem: Memory,
  fixed: number,
  limits: ContextLimits,
  reasoning: boolean,
): Promise<Memory> {
  let { summary, turns, cleared } = mem
  const tokens = () => fixed + (summary ? estimateTokens(summary) : 0)
  const plan = planContext(turns, {
    fixed: tokens(),
    prompt: limits.prompt,
    clearedUpTo: cleared,
    reasoning,
  })
  if (plan.clearedUpTo !== cleared) {
    cleared = plan.clearedUpTo
    await chat?.setCleared(cleared)
  }
  if (plan.compact > 0) {
    const older = turns.slice(0, plan.compact)
    set({ activity: i18n.t('agent.compacting') })
    try {
      const next = await summarize(request, summary, older, limits)
      if (next) {
        summary = next
        turns = turns.slice(plan.compact)
        await chat?.setSummary({ text: next, upTo: older.at(-1)?.at ?? 0 })
      }
    } catch (err) {
      if (request.signal?.aborted) throw err
    } finally {
      set({ activity: null })
    }
  }
  const skip = overflow(turns, {
    fixed: tokens(),
    prompt: limits.prompt,
    clearedUpTo: cleared,
    reasoning,
  })
  return { summary, turns: turns.slice(skip), cleared }
}

/** Updates the ring by the input: how much of the context the thread takes now. */
async function measureContext() {
  const mem = await memory()
  const { settings, level } = useLlm.getState()
  const tokens =
    SYSTEM_TOKENS +
    TOOLS_TOKENS +
    estimateTokens(useAssistant.getState().memoryText) +
    (mem.summary ? estimateTokens(mem.summary) : 0) +
    messagesTokens(
      historyMessages(mem.turns, {
        clearedUpTo: mem.cleared,
        reasoning: settings.kind === 'fixnote' && level === 'hard',
      }),
    )
  set({ context: Math.min(1, tokens / contextLimits().prompt) })
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

/** What the assistant knows about the user (Settings → AI), as the next chat will see it. */
export async function loadAssistantMemory(): Promise<string> {
  const text = deps ? await readMemory(deps.db) : ''
  set({ memoryText: text })
  return text
}

/** A remembered fact as it is listed under the answer. */
const shortFact = (fact: string) => (fact.length > 60 ? `${fact.slice(0, 59)}…` : fact)

/**
 * Asks the assistant something in `scope`, streaming the answer into the thread. It reads the
 * notes it needs and changes them when asked (with the note tools of core, like the MCP server);
 * the changes are listed under the answer, where one click takes them all back.
 */
export async function ask(
  question: string,
  scope: ChatScope,
  /** `language`: the one a voice message was spoken in. */
  opts: { voice?: VoiceClip; language?: string } = {},
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
  const llm = { ...route, signal: ctrl.signal }
  let text = ''
  const trace: ChatTrace = { steps: [] }
  const done = actionCollector()
  const semantic = () => (useAssistant.getState().semantic === 'ready' ? indexer : null)
  /** The note the assistant is changing now, if it is open. */
  let editing: string | null = null
  const tools = new NoteTools(d.db, d.repo, d.audit, {
    gate: OPEN_GATE,
    provider: providerLabel,
    kinds: 'chat',
    // search_notes finds what the look-up before each answer finds: by meaning too, in all languages.
    semantic,
    expand: async (query) => (await planSearch(llm, query, [], 4000)).keywords,
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
    const limits = contextLimits()
    // "Think harder" (Settings → AI) is for FixNote AI; other models are what the person chose.
    const { settings, level } = useLlm.getState()
    const hard = settings.kind === 'fixnote' && level === 'hard'
    // A follow-up ("and what else was there?") is searched as the question it stands for; notes
    // mix languages, so the same short call adds translations and synonyms. Best effort: on
    // failure or timeout it is the question as typed.
    const plan =
      scope.kind === 'note'
        ? { query: question, keywords: [], search: true }
        : await planSearch(
            llm,
            question,
            mem.turns.slice(-3).flatMap((t) => [
              { role: 'user' as const, content: t.question },
              { role: 'assistant' as const, content: historyAnswer(t) },
            ]),
          )
    const followUp = !plan.search && mem.turns.length > 0
    const fragments = await retrieve(d.db, semantic(), plan.query, scope, {
      extraKeywords: plan.keywords,
      limit: followUp ? 3 : limits.prompt < 16_000 ? 4 : 8,
      // The open note is given whole when it fits comfortably.
      wholeNoteChars: Math.min(20_000, Math.floor(limits.prompt * 3 * 0.3)),
    })
    const found = new Map<string, { n: number; noteId: string; title: string }>()
    for (const [i, f] of fragments.entries()) {
      if (!found.has(f.noteId)) found.set(f.noteId, { n: i + 1, noteId: f.noteId, title: f.title })
    }
    trace.found = [...found.values()]
    const memoryText = await loadAssistantMemory()
    const base: AgentInput = {
      question: question.trim(),
      fragments,
      scope,
      history: [],
      memory: memoryText,
      language: (opts.language ?? i18n.language).slice(0, 2),
      spoken: Boolean(opts.voice),
      // The folders at a glance, so "what is in Work" needs no guessing.
      folders: await tools.folders().catch(() => ''),
      reasoning: hard,
      followUp,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    const fixed = messagesTokens(buildAgentMessages(base)) + TOOLS_TOKENS
    const fit = await fitContext(llm, mem, fixed, limits, hard)
    const input: AgentInput = {
      ...base,
      history: fit.turns,
      summary: fit.summary,
      clearedUpTo: fit.cleared,
    }
    text = await runAgent(
      {
        request: hard ? { ...llm, body: { ...llm.body, level: 'hard' } } : llm,
        messages: buildAgentMessages(input),
        fallback: () => buildAgentMessages({ ...input, historyAsText: true }),
        maxTokens: limits.answer,
        tools,
        repo: d.repo,
        mode: useLlm.getState().mode,
        remember: async (fact, replaces) => {
          const after = withFact(await readMemory(d.db), fact, replaces)
          const label = i18n.t('agent.did.remember', { title: shortFact(fact.trim()) })
          const action = await d.audit.recordMemory(
            { kind: 'chat.memory', summary: label, provider: providerLabel() },
            after,
          )
          if (!action) return 'This is already in the memory.'
          done.label.current = label
          done.add(action.id)
          patchMessage(answer.id, { actions: { items: [...done.items], undone: false } })
          void loadAssistantMemory()
          return `Remembered: "${fact.trim()}". It comes with every chat from now on.`
        },
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
      trace,
    )
    const citations = parseCitations(text, fragments)
    const conf = confidence(citations, fragments)
    await repo.finish(answer.id, {
      content: text,
      status: 'done',
      citations,
      confidence: conf,
      trace,
    })
    patchMessage(answer.id, { content: text, status: 'done', citations, confidence: conf, trace })
    set({ status: 'done' })
    doneTimer = setTimeout(() => set({ status: 'idle' }), 1600)
  } catch (err) {
    const aborted = ctrl.signal.aborted
    const status = aborted ? 'stopped' : 'error'
    await repo.finish(answer.id, { content: text, status, trace })
    patchMessage(answer.id, { content: text, status, trace })
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
  // An answer may have remembered something about the user: Settings → AI shows it as it is now.
  await loadAssistantMemory()
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
