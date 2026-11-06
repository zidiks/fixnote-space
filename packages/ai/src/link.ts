import type { ChatMessage } from './client'

/** Marker the dev backend uses to recognize a link placement request; keep it in the prompt. */
export const LINK_MARKER = 'You file a saved web page into a notes app'

export interface LinkPlaceRequest {
  link: { title: string; site: string; excerpt: string }
  folders: { ref: number; path: string }[]
  /** Where the person moved earlier links themselves. */
  examples: { title: string; site: string; folder: string }[]
}

export interface LinkPlaceReply {
  folder?: number
  newFolder?: string
}

const SYSTEM = `${LINK_MARKER}. Nobody is asked: you decide where it goes.

Return only JSON, one of:
{"folder": 3}            an existing folder that clearly fits the page's topic
{"newFolder": "Topic"}   otherwise: a short topic name for a new folder of saved links

Rules:
- Prefer an existing folder only when the page really belongs there (a project, a subject).
- A new topic name: 1–2 words, a general subject (Design, Recipes, Programming), in the language
  of the folder names (or of the page if there are none), no quotes or emoji.
- Follow the examples of where the person moved links before.`

export function buildLinkPlaceMessages(req: LinkPlaceRequest): ChatMessage[] {
  const folders = req.folders.length
    ? req.folders.map((f) => `[${f.ref}] ${f.path}`).join('\n')
    : '(none yet)'
  const examples = req.examples.length
    ? `\n\nThe person moved earlier links:\n${req.examples
        .map((e) => `- "${e.title}" (${e.site}) → ${e.folder}`)
        .join('\n')}`
    : ''
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Folders:\n${folders}${examples}\n\nPage:\n${req.link.title} (${req.link.site})\n${req.link.excerpt}`,
    },
  ]
}

export function parseLinkPlaceReply(reply: string, req: LinkPlaceRequest): LinkPlaceReply | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
  const ref = Number(data.folder)
  if (req.folders.some((f) => f.ref === ref)) return { folder: ref }
  if (typeof data.newFolder === 'string') {
    const name = data.newFolder
      .replace(/^["'«\s]+|["'»\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 40)
    if (name) return { newFolder: name }
  }
  return null
}
