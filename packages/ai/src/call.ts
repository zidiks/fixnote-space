import type { ChatMessage } from './client'

/** Marker the dev backend uses to recognize a call write-up; keep it in the prompt. */
export const CALL_MARKER = 'You write up a recorded call'

export interface CallWriteUp {
  summary: string
  decisions: string[]
  tasks: string[]
}

const SYSTEM = `${CALL_MARKER} for the person who recorded it, as a note they will reread later.
"Me" is that person; "Them" is everyone else on the call.

Return only JSON:
{"summary": "…", "decisions": ["…"], "tasks": ["…"]}

- summary: what the call was about and where it ended, 1–4 short sentences. Empty if the
  recording has no real conversation (silence, noise, a few words).
- decisions: what was agreed or decided, one short line each.
- tasks: things someone committed to do, one per line, starting with who when it is clear
  ("Me: send the draft by Friday", "Anna: check the budget"). Use "Me" in the call's language.
- Only what was actually said. No advice, no guesses. An empty array when the call had none.
- Write in the language the call was held in.`

/** Roughly what fits one request with room for the answer (about 3 characters per token). */
export const CALL_CHUNK_CHARS = 60_000

export function buildCallMessages(transcript: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Transcript:\n\n${transcript}` },
  ]
}

/** Write-ups of the parts of a long call, combined into one. */
export function buildCallMergeMessages(parts: readonly CallWriteUp[]): ChatMessage[] {
  const text = parts
    .map((p, i) =>
      [
        `Part ${i + 1}`,
        `summary: ${p.summary || '(none)'}`,
        `decisions: ${p.decisions.join(' | ') || '(none)'}`,
        `tasks: ${p.tasks.join(' | ') || '(none)'}`,
      ].join('\n'),
    )
    .join('\n\n')
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `The call was long, so it was written up in parts. Combine them into one write-up of the whole call (drop repeats and anything later reversed):\n\n${text}`,
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
    decisions: strings(data.decisions),
    tasks: strings(data.tasks),
  }
}
