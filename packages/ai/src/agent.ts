import type { ChatScope, Fragment, ToolSpec } from '@fixnote/core'
import type { AgentMessage, ChatMessage, ToolDef } from './client'

/** In the system prompt of every agent turn; the dev backend's fake LLM looks for it. */
export const AGENT_MARKER = 'You can read and change the notes with tools'
/** In the prompt that shortens a long conversation; the dev backend's fake LLM looks for it. */
export const SUMMARY_MARKER = 'Summarize this conversation for yourself'

/** An earlier turn of the conversation (what the user said, what the assistant answered). */
export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentInput {
  question: string
  fragments: Fragment[]
  scope: ChatScope
  /** The conversation since the last "new chat", oldest first (a summary may stand for the start). */
  history: Turn[]
  /** What the conversation was about before `history`, when it was shortened. */
  summary?: string | null
  now?: Date
}

const SYSTEM = `You are the assistant inside FixNote, a private notes app. ${AGENT_MARKER}: search, read, create, edit, move and delete notes and folders.

Rules:
- For questions about what the user wrote, use the numbered note fragments below and search_notes when they are not enough. Do not use outside knowledge about the user.
- After each statement that comes from a fragment, cite it like [1] or [2][3]. Do not cite tool results with numbers; name the note instead.
- Change notes only when the user asks for it. Read a note with get_note before editing it, and prefer edit_note for small changes. Never invent ids: take them from fragments or tool results.
- Do not ask the user to confirm deletions yourself: the app asks when needed, and every change can be undone.
- After changing notes, say in one short sentence what you did. If a tool fails, say what went wrong.
- In notes, "- [x]" is a finished task and "- [ ]" an open one.
- Answer in the language of the user's last message. Be brief and concrete; use short lists when it helps.`

function scopeLine(scope: ChatScope): string {
  if (scope.kind === 'note')
    return `The user is looking at the note "${scope.title}" (id: ${scope.id}).`
  if (scope.kind === 'folder') return `The user is looking at the folder "${scope.name}".`
  return 'The user is looking at all notes.'
}

/**
 * Messages for an agent turn: rules, the summary of what came before, the conversation so far,
 * then the fragments found for this question and the question itself.
 */
export function buildAgentMessages(input: AgentInput): AgentMessage[] {
  const now = input.now ?? new Date()
  const fragments = input.fragments
    .map(
      (f, i) =>
        `[${i + 1}] "${f.title || 'Untitled'}" (id: ${f.noteId}, edited ${new Date(f.updatedAt).toISOString().slice(0, 10)})\n${f.text}`,
    )
    .join('\n\n')
  return [
    {
      role: 'system',
      content: input.summary
        ? `${SYSTEM}\n\nEarlier in this conversation (summary):\n${input.summary}`
        : SYSTEM,
    },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: [
        `Today is ${now.toISOString().slice(0, 10)}. ${scopeLine(input.scope)}`,
        fragments ? `Note fragments:\n\n${fragments}` : 'Note fragments: none were found.',
        `Message: ${input.question}`,
      ].join('\n\n'),
    },
  ]
}

/** The tools in the form chat completion APIs take. */
export const toolDefs = (specs: readonly ToolSpec[]): ToolDef[] =>
  specs.map((s) => ({
    type: 'function',
    function: { name: s.name, description: s.description, parameters: s.parameters },
  }))

/** Roughly how many tokens a text takes (about 3 characters each across ru, en and es). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3)

export function messagesTokens(messages: readonly AgentMessage[]): number {
  let total = 0
  for (const m of messages) {
    total += 4 + estimateTokens(m.content ?? '')
    if ('tool_calls' in m) {
      for (const c of m.tool_calls) total += estimateTokens(c.function.name + c.function.arguments)
    }
  }
  return total
}

/** Asks the model for a short summary of the turns that no longer fit, to keep the thread going. */
export function buildSummaryMessages(previous: string | null, turns: Turn[]): ChatMessage[] {
  const text = turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content: `${SUMMARY_MARKER}, so you can continue it without the full text. Keep what matters later: what the user wants, facts from notes, note titles and ids, changes made, open questions. Plain sentences, at most 150 words, in the language of the conversation.`,
    },
    {
      role: 'user',
      content: [previous ? `Summary so far:\n${previous}` : '', `Conversation:\n${text}`]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}
