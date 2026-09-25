import type { ChatScope, Fragment } from '@fixnote/core'
import type { ChatMessage } from './client'

export interface PromptInput {
  question: string
  fragments: Fragment[]
  scope: ChatScope
  /** Earlier turns of the conversation, oldest first; only the last few are kept. */
  history?: { role: 'user' | 'assistant'; content: string }[]
  now?: Date
}

const SYSTEM = `You are the assistant inside FixNote, a private notes app. You help the user remember what they wrote.

Rules:
- Answer only from the numbered note fragments provided. Do not use outside knowledge about the user.
- After each statement that comes from a fragment, cite it like [1] or [2][3].
- If the fragments do not contain the answer, say so in one short sentence and suggest what to search for. Do not guess.
- Answer in the language of the question. Be brief and concrete; use short lists when it helps.
- Never claim you changed a note; you can only read them.`

function scopeLine(scope: ChatScope): string {
  if (scope.kind === 'note') return `Context: the single note "${scope.title}".`
  if (scope.kind === 'folder') return `Context: notes in the folder "${scope.name}".`
  return 'Context: all notes.'
}

/** Messages for a grounded answer: rules, recent turns, then the fragments and the question. */
export function buildMessages(input: PromptInput): ChatMessage[] {
  const now = input.now ?? new Date()
  const fragments = input.fragments
    .map(
      (f, i) =>
        `[${i + 1}] "${f.title || 'Untitled'}" (edited ${new Date(f.updatedAt).toISOString().slice(0, 10)})\n${f.text}`,
    )
    .join('\n\n')
  const history = (input.history ?? []).slice(-6)
  return [
    { role: 'system', content: SYSTEM },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: [
        `Today is ${now.toISOString().slice(0, 10)}. ${scopeLine(input.scope)}`,
        fragments ? `Note fragments:\n\n${fragments}` : 'Note fragments: none were found.',
        `Question: ${input.question}`,
      ].join('\n\n'),
    },
  ]
}
