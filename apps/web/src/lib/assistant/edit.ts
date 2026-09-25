import { buildEditMessages, cleanEditOutput, type EditInput, streamChat } from '@fixnote/ai'
import { chatTransport } from '../account/account'
import { MODEL } from './assistant'

/**
 * Asks the model for a changed version of `input.text`. Streams the raw reply to `onText` and
 * resolves with the cleaned result; nothing is applied here, the caller shows a diff first.
 */
export async function proposeEdit(
  input: EditInput,
  opts: { signal: AbortSignal; onText?: (text: string) => void },
): Promise<{ kind: 'ok'; text: string } | { kind: 'signed-out' }> {
  const transport = await chatTransport()
  if (!transport) return { kind: 'signed-out' }
  let reply = ''
  for await (const delta of streamChat({
    url: transport.url,
    headers: transport.headers,
    fetch: transport.fetch,
    model: MODEL,
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
