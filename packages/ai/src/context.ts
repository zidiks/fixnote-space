import type { ChatTrace, ChatTraceStep } from '@fixnote/core'
import type { AgentMessage, ChatMessage } from './client'

/**
 * The conversation as the model sees it again in later turns, like Claude Code: each earlier
 * answer with the tools it called and what they returned, so the model remembers what it read.
 * When the context gets tight, old tool results become a short stub first (they can be fetched
 * again); only then is the start of the conversation summarized.
 */

/** An earlier exchange: the question, how the answer was reached, and the answer. */
export interface PastTurn {
  /** When the question was asked; orders turns and is what the cleared mark compares with. */
  at: number
  question: string
  answer: string
  trace?: ChatTrace | null
  /** The fragments the answer cited by number (numbers are only valid within their turn). */
  citations?: readonly { n: number; noteId: string; title: string }[]
  /** The changes listed under the answer, and whether the user took them back. */
  changes?: { labels: string[]; undone: boolean } | null
  /** The answer was stopped part way. */
  stopped?: boolean
}

/** What an old tool result is replaced with when the context gets tight. */
export const CLEARED_RESULT = '[result cleared to save space — call the tool again if needed]'
const CLEARED_ARG = '…(cleared to save space)'

/** Shares of the prompt budget: when old tool results are cleared, and the thread summarized. */
export const CONTEXT_SHARES = {
  /** Past this, old tool results are cleared… */
  clearAt: 0.6,
  /** …until the prompt is down to this. */
  clearTo: 0.45,
  /** Past this (even with results cleared), the start of the thread is summarized… */
  compactAt: 0.75,
  /** …keeping this much of the latest turns word for word. */
  keepAfterCompact: 0.3,
  /** Past this, a request would not fit: the oldest turns are left out of it (not deleted). */
  fit: 0.95,
} as const
/** The latest turns whose tool results are never cleared. */
export const KEEP_INTACT = 2

/** Roughly how many tokens a text takes (about 3 characters each across ru, en and es). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3)

export function messagesTokens(messages: readonly AgentMessage[]): number {
  let total = 0
  for (const m of messages) {
    total += 4 + estimateTokens(m.content ?? '')
    if ('reasoning_content' in m && m.reasoning_content)
      total += estimateTokens(m.reasoning_content)
    if ('tool_calls' in m) {
      for (const c of m.tool_calls) total += estimateTokens(c.function.name + c.function.arguments)
    }
  }
  return total
}

const CITE = /\s?\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g

/**
 * An earlier answer as the model reads it again: fragment numbers ([2]) meant something only in
 * their own turn, so they become the names and ids of the notes; what the answer changed, and
 * whether the user undid it, follows.
 */
export function historyAnswer(turn: PastTurn): string {
  const byN = new Map((turn.citations ?? []).map((c) => [c.n, c]))
  const sources = new Map<string, string>()
  const text = turn.answer
    .replace(CITE, (_, nums: string) => {
      for (const part of nums.split(',')) {
        const c = byN.get(Number(part.trim()))
        if (c) sources.set(c.noteId, c.title)
      }
      return ''
    })
    .trim()
  const parts = [text || (turn.stopped ? '(The user stopped this answer.)' : '(No answer.)')]
  if (turn.stopped && text) parts.push('(The user stopped this answer here.)')
  if (sources.size) {
    parts.push(
      `Sources: ${[...sources].map(([id, title]) => `"${title || 'Untitled'}" (id: ${id})`).join('; ')}`,
    )
  }
  const labels = turn.changes?.labels ?? []
  if (labels.length) {
    parts.push(
      turn.changes?.undone
        ? `[The user then undid all of these changes: ${labels.join('; ')}]`
        : `[Changes made: ${labels.join('; ')}]`,
    )
  }
  return parts.join('\n\n')
}

/** An earlier question with the notes that were found for it (titles and ids, not their text). */
export function historyQuestion(turn: PastTurn): string {
  const found = turn.trace?.found ?? []
  if (!found.length) return turn.question
  return `${turn.question}\n\n(Notes found for this message: ${found
    .map((f) => `"${f.title || 'Untitled'}" (id: ${f.noteId})`)
    .join('; ')})`
}

/** Tool arguments with long texts (a whole note) cut short, still valid JSON. */
function shrinkArgs(args: string): string {
  try {
    const v = JSON.parse(args) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return '{}'
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = typeof x === 'string' && x.length > 200 ? `${x.slice(0, 80)}${CLEARED_ARG}` : x
    }
    return JSON.stringify(out)
  } catch {
    return '{}'
  }
}

/** Ids the same on every turn (the prompt's start stays cacheable) and unique in the thread. */
const callId = (turn: PastTurn, step: number, i: number) => `h${turn.at.toString(36)}_${step}_${i}`

const toolSteps = (turn: PastTurn): ChatTraceStep[] =>
  (turn.trace?.steps ?? []).filter((s) => s.calls.length)

/**
 * One earlier turn as messages. `cleared`: tool results as a stub, long arguments cut.
 * `reasoning`: a thinking model's reasoning goes back with each answer and call (DeepSeek wants
 * it with tools).
 */
export function turnMessages(
  turn: PastTurn,
  opts: { cleared: boolean; reasoning: boolean; prefix?: string },
): AgentMessage[] {
  const out: AgentMessage[] = [
    { role: 'user', content: `${opts.prefix ?? ''}${historyQuestion(turn)}` },
  ]
  for (const [s, step] of toolSteps(turn).entries()) {
    out.push({
      role: 'assistant',
      content: step.text?.trim() || null,
      tool_calls: step.calls.map((c, i) => ({
        id: callId(turn, s, i),
        type: 'function',
        function: { name: c.name, arguments: opts.cleared ? shrinkArgs(c.arguments) : c.arguments },
      })),
      ...(opts.reasoning ? { reasoning_content: step.reasoning ?? '' } : {}),
    })
    for (const [i, c] of step.calls.entries()) {
      out.push({
        role: 'tool',
        tool_call_id: callId(turn, s, i),
        content: opts.cleared ? CLEARED_RESULT : c.result,
      })
    }
  }
  out.push({
    role: 'assistant',
    content: historyAnswer(turn),
    ...(opts.reasoning ? { reasoning_content: turn.trace?.reasoning ?? '' } : {}),
  })
  return out
}

export interface HistoryOptions {
  /** Turns asked up to this time have their tool results cleared (except the last KEEP_INTACT). */
  clearedUpTo: number
  reasoning: boolean
  /** Put before the first question: the summary of what came before. */
  prefix?: string
}

/** The earlier turns as messages, oldest first. */
export function historyMessages(turns: readonly PastTurn[], opts: HistoryOptions): AgentMessage[] {
  const intactFrom = turns.length - KEEP_INTACT
  return turns.flatMap((t, i) =>
    turnMessages(t, {
      cleared: i < intactFrom && t.at <= opts.clearedUpTo,
      reasoning: opts.reasoning,
      ...(i === 0 && opts.prefix ? { prefix: opts.prefix } : {}),
    }),
  )
}

export interface ContextPlan {
  /** The new cleared mark (only ever moves forward). */
  clearedUpTo: number
  /** How many of the oldest turns to summarize now (0: none). */
  compact: number
}

/**
 * What to do so the next request fits: clear old tool results past `clearAt` of the budget, down
 * to `clearTo`; past `compactAt` even then, summarize the oldest turns and keep the latest ones
 * word for word. `fixed`: the tokens of everything but the history (rules, tools, memory, this
 * message); `prompt`: what the prompt may take in all.
 */
export function planContext(
  turns: readonly PastTurn[],
  opts: { fixed: number; prompt: number; clearedUpTo: number; reasoning: boolean },
): ContextPlan {
  const history = (cleared: number) =>
    messagesTokens(historyMessages(turns, { clearedUpTo: cleared, reasoning: opts.reasoning }))
  const total = (cleared: number) => opts.fixed + history(cleared)
  let cleared = opts.clearedUpTo
  if (total(cleared) > CONTEXT_SHARES.clearAt * opts.prompt) {
    for (const t of turns.slice(0, Math.max(0, turns.length - KEEP_INTACT))) {
      if (t.at <= cleared) continue
      cleared = t.at
      if (total(cleared) <= CONTEXT_SHARES.clearTo * opts.prompt) break
    }
  }
  let compact = 0
  // Summarizing helps only when the history is a real part of the prompt (not with a tiny window
  // that the rules and tools fill almost alone).
  if (
    turns.length > 1 &&
    total(cleared) > CONTEXT_SHARES.compactAt * opts.prompt &&
    history(cleared) > 0.15 * opts.prompt
  ) {
    const intactFrom = turns.length - KEEP_INTACT
    let keep = 0
    let used = 0
    for (let i = turns.length - 1; i > 0; i--) {
      const t = turns[i] as PastTurn
      const tokens = messagesTokens(
        turnMessages(t, {
          cleared: i < intactFrom && t.at <= cleared,
          reasoning: opts.reasoning,
        }),
      )
      if (keep >= 1 && used + tokens > CONTEXT_SHARES.keepAfterCompact * opts.prompt) break
      used += tokens
      keep++
    }
    compact = turns.length - Math.max(1, keep)
  }
  return { clearedUpTo: cleared, compact }
}

/**
 * How many of the oldest turns to leave out of this one request so it fits (when summarizing
 * failed or could not shrink it enough). They stay in the chat and are summarized later.
 */
export function overflow(
  turns: readonly PastTurn[],
  opts: { fixed: number; prompt: number; clearedUpTo: number; reasoning: boolean },
): number {
  let skip = 0
  while (
    skip < turns.length - 1 &&
    opts.fixed +
      messagesTokens(
        historyMessages(turns.slice(skip), {
          clearedUpTo: opts.clearedUpTo,
          reasoning: opts.reasoning,
        }),
      ) >
      CONTEXT_SHARES.fit * opts.prompt
  ) {
    skip++
  }
  return skip
}

/** An earlier turn as plain text (for summaries, and for models that take the history as text). */
export function turnText(turn: PastTurn, resultChars = 1200): string {
  const lines = [`User: ${historyQuestion(turn)}`]
  for (const step of toolSteps(turn)) {
    for (const c of step.calls) {
      const result = c.result.length > resultChars ? `${c.result.slice(0, resultChars)}…` : c.result
      lines.push(`Assistant called ${c.name} ${shrinkArgs(c.arguments)} → ${result}`)
    }
  }
  lines.push(`Assistant: ${historyAnswer(turn)}`)
  return lines.join('\n')
}

/** In the prompt that summarizes a long conversation; the dev backend's fake LLM looks for it. */
export const SUMMARY_MARKER = 'Summarize this conversation for yourself'

/**
 * Asks the model to fold `turns` into the running summary. It keeps every section of the summary
 * so far (incremental), so details from the very start survive several rounds.
 */
export function buildSummaryMessages(
  previous: string | null,
  turns: readonly PastTurn[],
  targetTokens = 1500,
): ChatMessage[] {
  const words = Math.max(150, Math.round(targetTokens * 0.6))
  return [
    {
      role: 'system',
      content: `${SUMMARY_MARKER}, so you can continue it without the full text. Write in the language of the conversation, under these headings (leave out a heading with nothing under it):

## Goal
What the user is trying to do, in their words where possible.
## Facts found
Facts from the notes that answered the user's questions, each with the note it came from.
## Notes touched
Each note read or changed: "Title" (id: …) and what it is about or what was done to it.
## Changes made
What was created, edited, moved or deleted, and what the user declined or undid.
## Preferences
How the user wants things done (language, tone, format), as they said it.
## Open questions
What is still unanswered, or was promised for later.

If there is a summary so far, update it: keep every point of it that still holds (never drop its sections), add what the new part of the conversation adds, and correct what it changed. Be specific: names, dates, numbers, note titles and ids. At most about ${words} words.`,
    },
    {
      role: 'user',
      content: [
        previous ? `Summary so far:\n${previous}` : '',
        `Conversation:\n\n${turns.map((t) => turnText(t)).join('\n\n')}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

/** The turns cut into parts whose text fits `maxChars` each (a small model summarizes in rounds). */
export function summaryBatches(turns: readonly PastTurn[], maxChars: number): PastTurn[][] {
  const out: PastTurn[][] = []
  let batch: PastTurn[] = []
  let size = 0
  for (const t of turns) {
    const n = turnText(t).length
    if (batch.length && size + n > maxChars) {
      out.push(batch)
      batch = []
      size = 0
    }
    batch.push(t)
    size += n
  }
  if (batch.length) out.push(batch)
  return out
}
