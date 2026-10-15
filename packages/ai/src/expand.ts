import { type ChatMessage, type ChatRequest, streamChat } from './client'

/** Marker the dev backend uses to recognize this request; keep it in the prompt. */
export const EXPANSION_MARKER = 'search keywords'

const SYSTEM = `You prepare a search of someone's personal notes for their latest message, and choose search keywords for it.
Notes may be written in English, Russian or Spanish, and people mix languages and slang.

Return only JSON: {"query": "...", "keywords": ["...", "..."], "search": true}
- query: the latest message as a standalone question. Use the conversation to resolve what "it", "there", "that note", "what else" or "and the second one" mean, and name the subject. Keep the user's language and keep names, numbers and dates exact. If the message already stands alone, repeat it.
- keywords: the key terms of the query in their base form; their translations into English, Russian and Spanish; common synonyms and slang, including loanwords written in the other alphabet (for example "гивевей" and "розыгрыш" both mean "giveaway"; "телега" means "Telegram"). At most 15 short keywords. No stopwords, no dates, no explanations.
- search: false only when the message needs no other notes than those already in the conversation (make it shorter, translate that, fix the second point, thanks); otherwise true.`

/** An earlier message, for resolving a follow-up ("what else was there?"). */
export interface RecentMessage {
  role: 'user' | 'assistant'
  content: string
}

/** The earlier messages the rewrite sees: the last few, each cut short. */
const RECENT = 6
const RECENT_CHARS = 600

export function buildExpansionMessages(
  question: string,
  recent: readonly RecentMessage[] = [],
): ChatMessage[] {
  const context = recent
    .slice(-RECENT)
    .map(
      (m) =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.length > RECENT_CHARS ? `${m.content.slice(0, RECENT_CHARS)}…` : m.content}`,
    )
    .join('\n')
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: context
        ? `Conversation so far (latest last):\n${context}\n\nLatest message: ${question}`
        : `Latest message: ${question}`,
    },
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
  if (!items.length && !json) items = reply.replace(/[[\]{}"]/g, '').split(/[,\n;]/)
  return [
    ...new Set(
      items
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length >= 2 && k.length <= 40),
    ),
  ].slice(0, 15)
}

/** What to look up for a message: the question on its own, more words for it, and whether to. */
export interface SearchPlan {
  /** The message as a standalone question (the follow-up resolved); used for every search. */
  query: string
  keywords: string[]
  /** false: the message goes on with notes already in the conversation (look up only a little). */
  search: boolean
}

/** The plan in a model reply; the question as typed where the reply has nothing better. */
export function parseSearchPlan(reply: string, question: string): SearchPlan {
  let query = question
  let search = true
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (json) {
    try {
      const parsed = JSON.parse(json) as { query?: unknown; search?: unknown }
      if (typeof parsed.query === 'string' && parsed.query.trim()) {
        query = parsed.query.trim().slice(0, 500)
      }
      if (parsed.search === false) search = false
    } catch {
      // keywords may still parse
    }
  }
  return { query, keywords: parseKeywords(reply), search }
}

/**
 * Asks the model, in one short call, to rewrite the message as a standalone question with the
 * conversation in mind and to add multilingual keywords. Never throws: on error, timeout or a
 * useless reply the plan is the question as typed, with no extra keywords.
 */
export async function planSearch(
  req: Omit<ChatRequest, 'messages' | 'temperature' | 'maxTokens'>,
  question: string,
  recent: readonly RecentMessage[] = [],
  timeoutMs = 5000,
): Promise<SearchPlan> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout
  try {
    let reply = ''
    for await (const d of streamChat({
      ...req,
      signal,
      messages: buildExpansionMessages(question, recent),
      temperature: 0,
      maxTokens: 400,
    })) {
      reply += d
    }
    return parseSearchPlan(reply, question)
  } catch {
    return { query: question, keywords: [], search: true }
  }
}

/** Multilingual keywords for a search query (no conversation). Never throws. */
export async function expandQuery(
  req: Omit<ChatRequest, 'messages' | 'temperature' | 'maxTokens'>,
  question: string,
  timeoutMs = 4000,
): Promise<string[]> {
  return (await planSearch(req, question, [], timeoutMs)).keywords
}
