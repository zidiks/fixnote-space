import { WRITING_PROSE } from '@fixnote/core'
import type { ChatMessage } from './client'

/** Marker the dev backend uses to recognize a call write-up; keep it in the prompt. */
export const CALL_MARKER = 'You write up a recorded call'

export interface CallTopic {
  title: string
  points: string[]
}

export interface CallWriteUp {
  summary: string
  /** What was discussed, in the call's order; empty for a short call about one thing. */
  topics: CallTopic[]
  decisions: string[]
  tasks: string[]
  /** Questions raised and left open. */
  questions: string[]
}

/** How much the write-up keeps: a quick call reads in seconds, a long working session in full. */
export type CallDepth = 'brief' | 'standard' | 'detailed'

/**
 * The depth for a call of this length with this much said (characters of transcript): a long call
 * that was mostly silence stays brief, a dense half hour gets the full write-up.
 */
export function callDepth(minutes: number, chars: number): CallDepth {
  if (minutes < 8 || chars < 5_000) return 'brief'
  if (minutes < 30 || chars < 20_000) return 'standard'
  return 'detailed'
}

const DEPTH: Record<CallDepth, string> = {
  brief: `This was a short call. summary: 1–3 sentences. topics: only when it covered several
separate subjects, 1–3 points each; otherwise an empty array.`,
  standard: `summary: 2–4 sentences on what the call was about and where it ended.
topics: each subject discussed, 2–6 points each.`,
  detailed: `This was a long call. The person needs a write-up they can work from instead of
relistening, not a teaser. summary: one or two short paragraphs (blank line between them) on the
purpose, the main threads and the outcome. topics: every subject that took real time, in the order
discussed, 3–10 points each: the positions and arguments (who said what when it matters), numbers,
dates, names, options considered and why they were kept or dropped.`,
}

const SYSTEM = `${CALL_MARKER} for the person who recorded it, as a note they will reread later.
"Me" is that person; "Them" is everyone else on the call.

Return only JSON:
{"summary": "…", "topics": [{"title": "…", "points": ["…"]}], "decisions": ["…"], "tasks": ["…"], "questions": ["…"]}

- summary: what the call was about and where it ended. Empty, with everything else empty too,
  if the recording has no real conversation (silence, noise, a few words).
- topics: what was discussed. title: a few words naming the subject. points: one specific line
  each, what was actually said about it (facts, figures, arguments, concerns), not "they
  discussed X". Leave decisions and tasks to their own lists.
- decisions: what was agreed or decided, one short line each.
- tasks: things someone committed to do, one per line, starting with who when it is clear
  ("Me: send the draft by Friday", "Anna: check the budget"). Use "Me" in the call's language.
- questions: questions raised and left unanswered or postponed, one per line.
- Match the detail to the discussion itself: small talk and repetition stay out even in a long
  call, while a dense technical or business discussion keeps its specifics.
- Only what was actually said. No advice, no guesses. An empty array when the call had none.
- Write in the language the call was held in.

${WRITING_PROSE}`

/** About 3 characters per token, with room to spare; llm-proxy caps it anyway. */
export const CALL_MAX_TOKENS: Record<CallDepth, number> = {
  brief: 1500,
  standard: 3000,
  detailed: 6000,
}

/** Roughly what fits one request with room for the answer (about 3 characters per token). */
export const CALL_CHUNK_CHARS = 60_000

export interface CallInfo {
  /** The whole call's length. */
  minutes: number
  depth: CallDepth
}

const length = (minutes: number) => `${Math.max(1, Math.round(minutes))} min`

export function buildCallMessages(
  transcript: string,
  call: CallInfo,
  part?: { index: number; count: number },
): ChatMessage[] {
  const where = part
    ? `This is part ${part.index + 1} of ${part.count} of a ${length(call.minutes)} call; write up this part only, at the detail below.`
    : `The call lasted ${length(call.minutes)}.`
  return [
    { role: 'system', content: `${SYSTEM}\n\n${DEPTH[call.depth]}` },
    { role: 'user', content: `${where}\n\nTranscript:\n\n${transcript}` },
  ]
}

const partText = (p: CallWriteUp, i: number) =>
  [
    `Part ${i + 1}`,
    `summary: ${p.summary || '(none)'}`,
    'topics:',
    ...(p.topics.length
      ? p.topics.flatMap((t) => [`  ${t.title}`, ...t.points.map((x) => `    - ${x}`)])
      : ['  (none)']),
    `decisions: ${p.decisions.join(' | ') || '(none)'}`,
    `tasks: ${p.tasks.join(' | ') || '(none)'}`,
    `questions: ${p.questions.join(' | ') || '(none)'}`,
  ].join('\n')

/** Write-ups of the parts of a long call, combined into one. */
export function buildCallMergeMessages(
  parts: readonly CallWriteUp[],
  call: CallInfo,
): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM}\n\n${DEPTH[call.depth]}` },
    {
      role: 'user',
      content: `The call lasted ${length(call.minutes)}, so it was written up in parts. Combine them into one write-up of the whole call. Keep the detail: join topics that are the same subject and keep their points, drop only repeats and what was later reversed or answered; the summary covers the whole call.\n\n${parts.map(partText).join('\n\n')}`,
    },
  ]
}

/** Splits a transcript at line ends into pieces the model can take. */
export function splitTranscript(transcript: string, max = CALL_CHUNK_CHARS): string[] {
  const chunks: string[] = []
  let current = ''
  for (const line of transcript.split('\n')) {
    if (current && current.length + line.length + 1 > max) {
      chunks.push(current)
      current = ''
    }
    current = current ? `${current}\n${line}` : line.slice(0, max)
  }
  if (current) chunks.push(current)
  return chunks
}

const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    : []

const topics = (v: unknown): CallTopic[] =>
  Array.isArray(v)
    ? v.flatMap((x) => {
        if (!x || typeof x !== 'object') return []
        const t = x as Record<string, unknown>
        const title = typeof t.title === 'string' ? t.title.replace(/\s+/g, ' ').trim() : ''
        const points = strings(t.points)
        return title || points.length ? [{ title, points }] : []
      })
    : []

/** The write-up from a reply; null when it is not the JSON asked for. */
export function parseCallReply(reply: string): CallWriteUp | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
  return {
    summary: typeof data.summary === 'string' ? data.summary.trim() : '',
    topics: topics(data.topics),
    decisions: strings(data.decisions),
    tasks: strings(data.tasks),
    questions: strings(data.questions),
  }
}
