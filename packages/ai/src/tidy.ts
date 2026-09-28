import type { ChatMessage } from './client'

/** Marker the dev backend uses to recognize a tidy request; keep it in the prompt. */
export const TIDY_MARKER = 'You help keep a personal notes app tidy'

export interface TidyNoteInput {
  ref: number
  title: string
  excerpt: string
  /** The first line is long prose rather than a title. */
  needsTitle: boolean
  /** The note has no folder yet. */
  noFolder: boolean
}

export interface TidyRequest {
  notes: TidyNoteInput[]
  folders: { ref: number; name: string }[]
}

export type TidyProposal =
  | { kind: 'move'; note: number; folder: number }
  | { kind: 'move'; note: number; newFolder: string }
  | { kind: 'title'; note: number; title: string }

const SYSTEM = `${TIDY_MARKER}. You suggest small, safe changes; the user reviews each one.

Return only JSON:
{"moves": [{"note": 3, "folder": 2} or {"note": 3, "newFolder": "Name"}],
 "titles": [{"note": 3, "title": "Short title"}]}

Rules:
- Moves only for notes marked "no folder". Prefer an existing folder. Propose a new folder only
  when at least two notes clearly belong together; name it in the notes' language, 1–3 words.
- Titles only for notes marked "needs title": at most 6 words, in the note's language, no quotes.
- Leave out anything you are not confident about. Empty arrays are fine.`

export function buildTidyMessages(req: TidyRequest): ChatMessage[] {
  const folders = req.folders.length
    ? req.folders.map((f) => `[${f.ref}] ${f.name}`).join('\n')
    : '(none yet)'
  const notes = req.notes
    .map((n) =>
      [
        `[${n.ref}] ${n.title || '(untitled)'}`,
        n.excerpt ? `  ${n.excerpt}` : '',
        n.noFolder ? '  no folder' : '',
        n.needsTitle ? '  needs title' : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Folders:\n${folders}\n\nNotes:\n\n${notes}`,
    },
  ]
}

/** Proposals from a model reply, keeping only well-formed ones about the notes we sent. */
export function parseTidyReply(reply: string, req: TidyRequest): TidyProposal[] {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return []
  let data: { moves?: unknown; titles?: unknown }
  try {
    data = JSON.parse(json) as typeof data
  } catch {
    return []
  }
  const notes = new Map(req.notes.map((n) => [n.ref, n]))
  const folders = new Set(req.folders.map((f) => f.ref))
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  const out: TidyProposal[] = []
  const seen = new Set<string>()
  const push = (p: TidyProposal) => {
    const key = `${p.kind}:${p.note}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(p)
  }
  for (const m of list(data.moves)) {
    const note = Number(m.note)
    if (!notes.get(note)?.noFolder) continue
    if (folders.has(Number(m.folder))) push({ kind: 'move', note, folder: Number(m.folder) })
    else if (typeof m.newFolder === 'string') {
      const name = m.newFolder.replace(/\s+/g, ' ').trim().slice(0, 60)
      if (name) push({ kind: 'move', note, newFolder: name })
    }
  }
  for (const t of list(data.titles)) {
    const note = notes.get(Number(t.note))
    if (!note?.needsTitle || typeof t.title !== 'string') continue
    const title = t.title
      .replace(/^["'«#\s]+|["'»\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
    if (title) push({ kind: 'title', note: note.ref, title })
  }
  return out
}
