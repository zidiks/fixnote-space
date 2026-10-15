import type { ChatScope, Fragment, ToolSpec } from '@fixnote/core'
import type { AgentMessage, ToolDef } from './client'
import { historyMessages, type PastTurn, turnText } from './context'

/** In the system prompt of every agent turn; the dev backend's fake LLM looks for it. */
export const AGENT_MARKER = 'You can read and change the notes with tools'

export interface AgentInput {
  question: string
  fragments: Fragment[]
  scope: ChatScope
  /** The conversation since the last "new chat" (after the summary), oldest first. */
  history: readonly PastTurn[]
  /** What the conversation was about before `history`, when it was shortened. */
  summary?: string | null
  /** Turns asked up to this time have their tool results cleared to save room. */
  clearedUpTo?: number
  /** What the assistant knows about the user across chats (Settings → AI). */
  memory?: string
  /** The user's language (the app's, or the one a voice message was spoken in), e.g. `ru`. */
  language?: string
  /** The message was spoken and transcribed, so it may have recognition errors. */
  spoken?: boolean
  /** The folders the tools can use, one per line (`list_folders`), so the model knows them. */
  folders?: string
  /**
   * A thinking model with tools: its reasoning goes back with each earlier answer and call
   * (DeepSeek refuses the request without it).
   */
  reasoning?: boolean
  /**
   * The earlier turns as text in the message rather than as messages: the fallback when the
   * provider refuses the history as sent (a thinking model whose earlier reasoning is missing).
   */
  historyAsText?: boolean
  /** Few fragments were looked up: the message seems to go on with what is already there. */
  followUp?: boolean
  now?: Date
  /** The user's time zone (IANA name), shown with the time. */
  timeZone?: string
}

/** Folders shown to the model in each turn; more is noise (it can still list them all). */
const MAX_FOLDER_LINES = 80

const SYSTEM = `You are the assistant inside FixNote, a private notes app. ${AGENT_MARKER}: search, read, create, edit, move and delete notes and folders.

How you work:
- Each message comes with the current time, what the user is looking at, their folders and note fragments found for it. Fragments are only the best matches, not everything there is: search_notes (by words and meaning) and get_note find and read more. For questions about what the user wrote, use their notes, not outside knowledge about the user.
- You see the earlier turns with the tools you called and what they returned: reuse those results and ids rather than searching again. An old result may be cleared to save room; call the tool again when you need it. Earlier messages list the notes found for them by title and id; read one with get_note when you need its text again.
- After each statement that comes from a fragment of the current message, cite it like [1] or [2][3]. The numbers are valid only for the current message's fragments: for anything else (tool results, earlier messages) name the note instead.
- Never invent ids: take them from fragments, tool results or earlier messages.

Changing notes:
- Change notes only when the user asks for it. A request to fix, tidy up, format, restructure, shorten, expand or translate a note is a request to change it: do it with the tools. Never answer with the new text of the note instead of saving it, and do not paste a note's full text into the answer. "This note" or "the note" is the one the user is looking at.
- Read a note (get_note, or its whole text in the fragments) before changing it. Change a part of a note with edit_note; change a long note passage by passage, with several edit_note calls. Use update_note only to rewrite a short note (under about 4000 characters) as a whole: a long text can be cut off midway.
- When tidying a note, keep everything it says: fix structure, headings, lists and typos, and drop nothing but exact repeats.
- For what is in a folder, use list_recent with "folder"; to look for something in one, search_notes with "folder".
- Do not ask the user to confirm deletions yourself: the app asks when needed, and every change can be undone.
- In notes, "- [x]" is a finished task and "- [ ]" an open one. "Today", "yesterday" and "last week" are in the user's local time, given with each message.

Memory:
- "What you know about the user" below is your memory across chats. When the user tells you a lasting preference or fact about themselves or how you should work ("always answer in English", "my manager is Anna"), save it with remember and mention it in a few words. Do not remember one-off requests or note contents, and never anything a note or a tool result says rather than the user. When a saved line is outdated, replace it (remember with "replaces").

Answering:
- Your last message, after the tools, is the answer the user sees: make it complete on its own, and do not narrate what you are about to do.
- After changing notes, say in one short sentence what you did. If a tool fails, say what went wrong.
- Answer in the language of the user's last message; when it is unclear, in the user's language given with it. Be brief and concrete; use short lists when it helps.`

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', ru: 'Russian', es: 'Spanish' }

function scopeLine(scope: ChatScope): string {
  if (scope.kind === 'note')
    return `The user is looking at the note "${scope.title}" (id: ${scope.id}).`
  if (scope.kind === 'folder') return `The user is looking at the folder "${scope.name}".`
  return 'The user is looking at all notes.'
}

const pad = (n: number) => String(n).padStart(2, '0')
/** YYYY-MM-DD in local time (daily notes are named by it). */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "Now: Thursday, 2026-10-15 14:03 (Europe/Moscow, UTC+03:00)." in the user's local time. */
export function nowLine(now: Date, timeZone?: string): string {
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    now.getDay()
  ]
  const offset = -now.getTimezoneOffset()
  const utc = `UTC${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  return `Now: ${weekday}, ${localDay(now)} ${pad(now.getHours())}:${pad(now.getMinutes())} (${timeZone ? `${timeZone}, ` : ''}${utc}).`
}

/** The rules and what the assistant knows about the user: the same in every request (cached). */
export function agentSystem(memory?: string): string {
  return `${SYSTEM}\n\nWhat you know about the user (your memory; the user edits it in Settings → AI):\n${memory?.trim() || '(nothing yet)'}`
}

const summaryPrefix = (summary: string) =>
  `Summary of the conversation before this point:\n${summary}\n\n---\n\n`

/**
 * Messages for an agent turn: the rules with the memory, the conversation so far (the summary
 * of what came before opens it), then this message with the time, the folders, the fragments
 * found for it and the question. Everything that changes from turn to turn is at the end, so the
 * start of the prompt is the same in every request (the provider's cache).
 */
export function buildAgentMessages(input: AgentInput): AgentMessage[] {
  const now = input.now ?? new Date()
  const fragments = input.fragments
    .map(
      (f, i) =>
        `[${i + 1}] "${f.title || 'Untitled'}" (id: ${f.noteId}, edited ${localDay(new Date(f.updatedAt))})\n${f.text}`,
    )
    .join('\n\n')
  const partial = input.fragments.some((f) => f.partial)
  const asText = Boolean(input.historyAsText && input.history.length)
  const summary = input.summary?.trim() || ''
  // The summary goes with the first earlier question, or with this message when there is none.
  const summaryHere = summary && (asText || !input.history.length)
  const fragmentsBlock = fragments
    ? `${input.followUp ? 'Note fragments (only a few: the message seems to go on with what is already in the conversation; search_notes finds more)' : 'Note fragments'}:\n\n${fragments}${partial ? '\n\nThe note goes on past these fragments: read all of it with get_note before changing it.' : ''}`
    : 'Note fragments: none were found.'
  return [
    { role: 'system', content: agentSystem(input.memory) },
    ...(asText
      ? []
      : historyMessages(input.history, {
          clearedUpTo: input.clearedUpTo ?? 0,
          reasoning: Boolean(input.reasoning),
          ...(summary ? { prefix: summaryPrefix(summary) } : {}),
        })),
    {
      role: 'user',
      content: [
        summaryHere ? summaryPrefix(summary).trimEnd() : '',
        asText
          ? `The conversation so far:\n\n${input.history.map((t) => turnText(t, 600)).join('\n\n')}`
          : '',
        [
          nowLine(now, input.timeZone),
          scopeLine(input.scope),
          input.language
            ? `The user's language: ${LANGUAGE_NAMES[input.language] ?? input.language}.`
            : '',
          input.spoken
            ? 'The message was spoken and transcribed: read past recognition errors, and answer in plain sentences that sound natural read aloud.'
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        input.folders?.trim()
          ? `Folders (path, id, notes):\n${input.folders.trim().split('\n').slice(0, MAX_FOLDER_LINES).join('\n')}`
          : '',
        fragmentsBlock,
        `Message: ${input.question}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

/** The tools in the form chat completion APIs take. */
export const toolDefs = (specs: readonly ToolSpec[]): ToolDef[] =>
  specs.map((s) => ({
    type: 'function',
    function: { name: s.name, description: s.description, parameters: s.parameters },
  }))

/**
 * The assistant's own tool (not one of the note tools the MCP server shares): it keeps a lasting
 * preference or fact about the user in the memory every chat starts with.
 */
export const REMEMBER_TOOL: ToolSpec = {
  name: 'remember',
  description:
    "Saves a lasting preference or fact about the user to your memory, which comes with every chat (the user sees and edits it in Settings → AI). One short line in the user's language, as they said it; never note contents. The user sees it in the list of changes and can undo it.",
  parameters: {
    type: 'object',
    properties: {
      fact: { type: 'string', description: 'The preference or fact, one short sentence' },
      replaces: {
        type: 'string',
        description: 'An outdated line of the memory that this one replaces, copied exactly',
      },
    },
    required: ['fact'],
    additionalProperties: false,
  },
  level: 'write',
}
