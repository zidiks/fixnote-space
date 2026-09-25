import { buildEditMessages, cleanEditOutput, type EditInput, streamChat } from '@fixnote/ai'
import { type LlmUnavailable, llm } from './llm'

/**
 * Asks the model for a changed version of `input.text`. Streams the raw reply to `onText` and
 * resolves with the cleaned result; nothing is applied here, the caller shows a diff first.
 */
export async function proposeEdit(
  input: EditInput,
  opts: { signal: AbortSignal; onText?: (text: string) => void },
): Promise<{ kind: 'ok'; text: string } | { kind: 'unavailable'; reason: LlmUnavailable }> {
  const reach = await llm()
  if (!reach.ok) return { kind: 'unavailable', reason: reach.reason }
  let reply = ''
  for await (const delta of streamChat({
    ...reach.route,
    messages: buildEditMessages(input),
    temperature: input.action === 'fix' ? 0 : 0.4,
    maxTokens: 2048,
    signal: opts.signal,
  })) {
    reply += delta
    opts.onText?.(reply)
  }
  return { kind: 'ok', text: cleanEditOutput(reply) }
}
