import { type ChatMessage, type ChatRequest, streamChat } from './client'

/** Marker the dev backend uses to recognize this request; keep it in the prompt. */
export const EXPANSION_MARKER = 'search keywords'

const SYSTEM = `You turn a question about someone's personal notes into search keywords.
Notes may be written in English, Russian or Spanish, and people mix languages and slang.

Return only JSON: {"keywords": ["...", "..."]}. Include:
- the key terms of the question in their base form;
- their translations into English, Russian and Spanish;
- common synonyms and slang, including loanwords written in the other alphabet
  (for example "гивевей" and "розыгрыш" both mean "giveaway"; "телега" means "Telegram").
At most 15 short keywords. No stopwords, no dates, no explanations.`

export function buildExpansionMessages(question: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM.replace('search keywords', EXPANSION_MARKER) },
    { role: 'user', content: question },
  ]
}

/** Keywords from a model reply: JSON if possible, else a comma/line separated list. */
export function parseKeywords(reply: string): string[] {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  let items: unknown[] = []
  if (json) {
    try {
      const parsed = JSON.parse(json) as { keywords?: unknown }
      if (Array.isArray(parsed.keywords)) items = parsed.keywords
    } catch {
      // fall through to the plain list
    }
  }
  if (!items.length) items = reply.replace(/[[\]{}"]/g, '').split(/[,\n;]/)
  return [
    ...new Set(
      items
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length >= 2 && k.length <= 40),
    ),
  ].slice(0, 15)
}

/**
 * Asks the model for multilingual search keywords. Never throws: on error, timeout or a useless
 * reply it returns [] and search falls back to the question as typed.
 */
export async function expandQuery(
  req: Omit<ChatRequest, 'messages' | 'temperature' | 'maxTokens'>,
  question: string,
  timeoutMs = 4000,
): Promise<string[]> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout
  try {
    let reply = ''
    for await (const d of streamChat({
      ...req,
      signal,
      messages: buildExpansionMessages(question),
      temperature: 0,
      maxTokens: 200,
    })) {
      reply += d
    }
    return parseKeywords(reply)
  } catch {
    return []
  }
}
