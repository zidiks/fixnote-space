import {
  type AgentMessage,
  ChatError,
  type ChatRequest,
  estimateTokens,
  REMEMBER_TOOL,
  streamTurn,
  type ToolCall,
  toolDefs,
} from '@fixnote/ai'
import {
  type ChatAction,
  type ChatTrace,
  type ChatTraceStep,
  changesNotes,
  firstLine,
  NOTE_TOOL_SPECS,
  type NotesRepo,
  type NoteTools,
  runNoteTool,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import type { AiMode } from './llm'

/** A model that keeps calling tools is stopped here and asked to answer. */
const MAX_STEPS = 10
/** More changes than this in one answer (edits and auto modes) are asked about once. */
const MASS = 5
/** Longer tool results are cut: a huge note should not fill the whole context. */
const MAX_RESULT = 16_000

/** The note tools (shared with the MCP server) and the assistant's own `remember`. */
export const AGENT_TOOLS = toolDefs([...NOTE_TOOL_SPECS, REMEMBER_TOOL])
/** What the tool list takes of the context, roughly. */
export const TOOLS_TOKENS = estimateTokens(JSON.stringify(AGENT_TOOLS))

/** A question to the user before a change; `danger` for deletions. */
export interface ConfirmRequest {
  text: string
  danger: boolean
  /** Offer "allow all" for the rest of this answer (ask mode). */
  many: boolean
}
export type ConfirmAnswer = 'allow' | 'all' | 'deny'

export interface AgentRun {
  request: Omit<ChatRequest, 'messages' | 'tools'>
  messages: AgentMessage[]
  /**
   * The same request with the earlier turns as text, for a provider that refuses the history as
   * sent (DeepSeek thinking, when an earlier answer has no reasoning kept).
   */
  fallback?: () => AgentMessage[]
  /** The longest answer the model may write in one step (reasoning included). */
  maxTokens: number
  /** Saves a fact to the assistant's memory of the user; returns what the model is told. */
  remember?: (fact: string, replaces?: string) => Promise<string>
  /** Built by the caller with `onChange` wired to `onAction`. */
  tools: NoteTools
  repo: NotesRepo
  mode: AiMode
  onText(text: string): void
  onActivity(label: string | null): void
  /** The note the next change is about (null once it is made), to show the assistant at work. */
  onEditing?(noteId: string | null): void
  confirm(request: ConfirmRequest): Promise<ConfirmAnswer>
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function parseArgs(call: ToolCall): Record<string, unknown> | null {
  if (!call.arguments.trim()) return {}
  try {
    const v = JSON.parse(call.arguments) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The note or folder a call is about, by name, for the labels the user sees. */
async function subject(repo: NotesRepo, name: string, args: Record<string, unknown>) {
  if (name === 'create_note') return firstLine(str(args.content)) || i18n.t('common.untitled')
  if (name.endsWith('_folder')) return str(args.folder) || str(args.name)
  if (name === 'daily_note') return str(args.date) || i18n.t('agent.today')
  const id = str(args.id)
  if (!id) return ''
  const note = await repo.getNote(id).catch(() => null)
  return note ? note.title || i18n.t('common.untitled') : ''
}

/** What the assistant is doing right now, under its answer. */
function activity(name: string, args: Record<string, unknown>, title: string): string {
  switch (name) {
    case 'search_notes':
      return i18n.t('agent.doing.search', { query: str(args.query) })
    case 'get_note':
      return i18n.t('agent.doing.read', { title })
    case 'list_recent':
    case 'list_folders':
      return i18n.t('agent.doing.look')
    case 'daily_note':
      return i18n.t('agent.doing.daily')
    case 'remember':
      return i18n.t('agent.doing.remember')
    default:
      return i18n.t('agent.doing.write')
  }
}

/** The tools that change notes or folders, each with its labels in `agent.did` and `agent.ask`. */
const CHANGE_TOOLS = [
  'create_note',
  'append_to_note',
  'edit_note',
  'update_note',
  'move_note',
  'delete_note',
  'create_folder',
  'rename_folder',
  'delete_folder',
  'daily_note',
] as const
type ChangeTool = (typeof CHANGE_TOOLS)[number]
const isChangeTool = (name: string): name is ChangeTool =>
  (CHANGE_TOOLS as readonly string[]).includes(name)

/** The change as it will be listed under the answer ("Created «Shopping»"). */
const doneLabel = (name: string, title: string) =>
  isChangeTool(name) ? i18n.t(`agent.did.${name}`, { title }) : name

/** The question before a change ("Delete «Shopping»?"). */
const askLabel = (name: string, title: string) =>
  isChangeTool(name) ? i18n.t(`agent.ask.${name}`, { title }) : name

const isDelete = (name: string) => name === 'delete_note' || name === 'delete_folder'

/**
 * Runs the model with the note tools until it answers: streams the text of each step, runs the
 * tools it calls (asking the user first where the mode says so) and returns the answer, which is
 * the text of the last step (what the model said before calling tools is not part of it). The
 * steps, with their results and reasoning, go into `trace` as they finish, for later turns. The
 * changes reach the caller through the tools' `onChange`; `label.current` names the change being
 * made.
 */
export async function runAgent(
  run: AgentRun,
  label: { current: string },
  trace: ChatTrace = { steps: [] },
): Promise<string> {
  const messages = [...run.messages]
  let answer = ''
  let lastText = ''
  let changes = 0
  let allowAll = run.mode !== 'ask'
  let massAsked = false
  let fellBack = false
  // Some models (small ones in Ollama) take no tools: then the assistant only reads, as before.
  let toolsOk = true
  for (let step = 0; step < MAX_STEPS; step++) {
    let stepText = ''
    let reasoning = ''
    let calls: ToolCall[] = []
    // The last round has no tools: the model has to answer with what it has.
    const withTools = toolsOk && step < MAX_STEPS - 1
    try {
      for await (const event of streamTurn({
        ...run.request,
        messages,
        ...(withTools ? { tools: AGENT_TOOLS } : {}),
        maxTokens: run.maxTokens,
      })) {
        if (event.type === 'reasoning') {
          reasoning += event.text
        } else if (event.type === 'text') {
          stepText += event.text
          run.onText(stepText)
        } else if (event.type === 'tool_calls') {
          calls = event.calls
        }
      }
    } catch (err) {
      if (!stepText && !fellBack && run.fallback && refusedHistory(err)) {
        fellBack = true
        messages.splice(0, run.messages.length, ...run.fallback())
        step--
        continue
      }
      if (!(withTools && !stepText && noTools(err))) throw err
      toolsOk = false
      const [system, ...rest] = messages
      if (system?.role === 'system') {
        messages.splice(
          0,
          messages.length,
          { role: 'system', content: system.content + NO_TOOLS },
          ...rest,
        )
      }
      step--
      continue
    }
    if (stepText.trim()) lastText = stepText
    if (!calls.length) {
      answer = stepText
      if (reasoning) trace.reasoning = reasoning
      break
    }
    messages.push({
      role: 'assistant',
      content: stepText || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments },
      })),
      // A thinking model goes on from its own reasoning (DeepSeek refuses the next step without).
      ...(reasoning ? { reasoning_content: reasoning } : {}),
    })
    const done: ChatTraceStep = {
      ...(stepText.trim() ? { text: stepText } : {}),
      ...(reasoning ? { reasoning } : {}),
      calls: [],
    }
    for (const call of calls) {
      const args = parseArgs(call)
      let result: string
      if (!args) {
        result =
          'Error: the arguments were cut off or are not valid JSON. If you were writing a long text, change the note in smaller parts with edit_note.'
      } else if (call.name === 'remember') {
        run.onActivity(activity(call.name, args, ''))
        try {
          result = run.remember
            ? await run.remember(str(args.fact), str(args.replaces) || undefined)
            : 'Error: the memory is not available here.'
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`
        }
      } else {
        const title = await subject(run.repo, call.name, args)
        run.onActivity(activity(call.name, args, title))
        const changing = changesNotes(call.name, args)
        let allowed = true
        if (changing) {
          if (isDelete(call.name) || !allowAll) {
            const answer = await run.confirm({
              text: askLabel(call.name, title),
              danger: isDelete(call.name),
              many: !allowAll && !isDelete(call.name),
            })
            allowed = answer !== 'deny'
            // "Allow all" covers however many changes follow.
            if (answer === 'all') allowAll = massAsked = true
          } else if (changes >= MASS && !massAsked) {
            massAsked = true
            const answer = await run.confirm({
              text: i18n.t('agent.ask.mass'),
              danger: false,
              many: false,
            })
            allowed = answer !== 'deny'
          }
        }
        if (!allowed) {
          result = 'The user declined this change. Do not retry it; say what was not done.'
        } else {
          label.current = doneLabel(call.name, title)
          const target = changing && typeof args.id === 'string' ? args.id : null
          if (target) run.onEditing?.(target)
          try {
            result = await runNoteTool(run.tools, call.name, args)
            if (changing) changes++
          } catch (err) {
            result = `Error: ${err instanceof Error ? err.message : String(err)}`
          } finally {
            if (target) run.onEditing?.(null)
          }
        }
      }
      const content = result.length > MAX_RESULT ? `${result.slice(0, MAX_RESULT)}\n…(cut)` : result
      messages.push({ role: 'tool', tool_call_id: call.id, content })
      done.calls.push({ id: call.id, name: call.name, arguments: call.arguments, result: content })
    }
    trace.steps.push(done)
    run.onActivity(null)
  }
  run.onActivity(null)
  // A model that said everything before its last tool call and then nothing: that is the answer.
  const text = answer.trim() ? answer : lastText
  if (text !== answer) run.onText(text)
  return text
}

/** The provider refused the earlier turns as sent (a thinking model's reasoning missing). */
const refusedHistory = (err: unknown) =>
  err instanceof ChatError && err.status === 400 && /reasoning/i.test(err.message)

const NO_TOOLS =
  '\n\nThis model cannot use the tools: answer from the fragments only. If the user asks to change notes, say that this model cannot do it and that another model can be chosen in Settings → AI.'

/** The provider refused the request because the model cannot call tools. */
const noTools = (err: unknown) =>
  err instanceof ChatError && err.status === 400 && /tool|function/i.test(err.message)

/** Collects the changes of one answer, named by what the agent was doing when each happened. */
export function actionCollector() {
  const label = { current: '' }
  const items: ChatAction[] = []
  return {
    label,
    items,
    add: (id: string) => items.push({ id, label: label.current }),
  }
}
