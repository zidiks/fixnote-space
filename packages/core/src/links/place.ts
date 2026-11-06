import { dot } from '../ai/vectors'
import { toPlainText } from '../notes/markdown'
import type { Folder } from '../notes/types'
import type { SqlDriver, SqlRow } from '../platform'

/**
 * Where a saved link goes, without asking: the folder whose notes are closest to the page (mean
 * of the best few), else a topic folder under "Links" (a new one named by the model), else
 * "Links/Misc". The person corrects a placement with one tap; corrections are remembered per site.
 */

/** A correction: a link from `host` was moved to `folderId`. */
export interface LinkLesson {
  host: string
  title: string
  folderId: string
  at: number
}

export const LESSONS_KEY = 'links.lessons'
const LESSONS_MAX = 200

export interface PlaceInput {
  title: string
  host: string
  /** Title, description and the start of the page text: what the page is about. */
  about: string
}

export interface ModelChoice {
  /** An existing folder (its ref in the request). */
  folder?: number
  /** A new topic under "Links". */
  newFolder?: string
}

export interface PlaceRequest {
  link: { title: string; site: string; excerpt: string }
  folders: { ref: number; path: string }[]
  examples: { title: string; site: string; folder: string }[]
}

export interface PlaceDeps {
  db: SqlDriver
  folders: Folder[]
  /** Embeds a query (normalized); null while on-device semantic search is off. */
  embed: ((text: string) => Promise<Float32Array>) | null
  /** Passage vectors of every indexed note. */
  vectors: (() => Promise<Map<string, { vector: Float32Array }[]>>) | null
  /** One short model call; null on Free or "only on this device". */
  ask: ((req: PlaceRequest) => Promise<ModelChoice | null>) | null
  lessons: LinkLesson[]
}

export type Placement =
  | { kind: 'folder'; folderId: string; how: 'learned' | 'semantic' | 'keywords' | 'model' }
  /** A topic folder under "Links" (made if missing): the model's name, or Misc. */
  | { kind: 'topic'; name: string | null }

/** Cosine of e5-family passage/query vectors: related pages sit above this, others below. */
export const SEMANTIC_MIN = 0.82
/** The same for word overlap (cosine of word sets), when semantic search is off. */
export const KEYWORDS_MIN = 0.16
/** A folder needs this many notes to say what it is about. */
const MIN_NOTES = 2
/** A folder's score: the mean of its best this-many notes. */
const TOP = 3

/** Folders a link may land in by itself: the person's own, not shared ones, not view only. */
export function placeableFolders(folders: Folder[]): Folder[] {
  const shared = new Set(folders.filter((f) => f.shared || f.access).map((f) => f.id))
  return folders.filter((f) => !shared.has(f.id))
}

/** "Design ▸ References": the folder's place in the tree. */
export function folderPath(folders: Folder[], id: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: string[] = []
  let at = id ? byId.get(id) : undefined
  for (let i = 0; at && i < 20; i++) {
    path.unshift(at.name)
    at = at.parentId ? byId.get(at.parentId) : undefined
  }
  return path
}

const STOP = new Set(
  'the and for with that this from you your are was were have has not but all can will about into how what when who why our out more www com http https html amp'.split(
    ' ',
  ),
)

export function wordsOf(text: string): Set<string> {
  return new Set(
    toPlainText(text)
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !STOP.has(w))
      // A rough stem, enough for "notes"/"note", "заметки"/"заметок".
      .map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w)),
  )
}

const setCosine = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0
  let common = 0
  for (const w of a) if (b.has(w)) common++
  return common / Math.sqrt(a.size * b.size)
}

/** Mean of the best `TOP` note scores per folder, for folders with enough notes. */
export function rankFolders(
  scores: { folderId: string; score: number }[],
): { folderId: string; score: number }[] {
  const by = new Map<string, number[]>()
  for (const s of scores) by.set(s.folderId, [...(by.get(s.folderId) ?? []), s.score])
  return [...by.entries()]
    .filter(([, list]) => list.length >= MIN_NOTES)
    .map(([folderId, list]) => {
      const best = list.sort((a, b) => b - a).slice(0, TOP)
      return { folderId, score: best.reduce((s, x) => s + x, 0) / best.length }
    })
    .sort((a, b) => b.score - a.score)
}

/** The folder this site's links were moved to the last two times, if it was the same one. */
export function learnedFolder(lessons: LinkLesson[], host: string, ok: Set<string>): string | null {
  const recent = lessons
    .filter((l) => l.host === host)
    .sort((a, b) => b.at - a.at)
    .slice(0, 2)
  const [a, b] = recent
  return a && b && a.folderId === b.folderId && ok.has(a.folderId) ? a.folderId : null
}

interface NoteRow extends SqlRow {
  id: string
  folder_id: string
  head: string
}

export async function placeLink(input: PlaceInput, deps: PlaceDeps): Promise<Placement> {
  const folders = placeableFolders(deps.folders)
  const ok = new Set(folders.map((f) => f.id))

  const learned = learnedFolder(deps.lessons, input.host, ok)
  if (learned) return { kind: 'folder', folderId: learned, how: 'learned' }

  const rows = ok.size
    ? await deps.db.query<NoteRow>(
        `SELECT id, folder_id, substr(content, 1, 1500) AS head FROM notes
          WHERE deleted_at IS NULL AND folder_id IS NOT NULL ORDER BY updated_at DESC LIMIT 2000`,
      )
    : []
  const notes = rows.filter((r) => ok.has(r.folder_id))

  if (deps.embed && deps.vectors && notes.length) {
    try {
      const q = await deps.embed(input.about)
      const all = await deps.vectors()
      const scores: { folderId: string; score: number }[] = []
      for (const n of notes) {
        const chunks = all.get(n.id)
        if (!chunks?.length) continue
        let best = -1
        for (const c of chunks) best = Math.max(best, dot(q, c.vector))
        scores.push({ folderId: n.folder_id, score: best })
      }
      const top = rankFolders(scores)[0]
      if (top && top.score >= SEMANTIC_MIN)
        return { kind: 'folder', folderId: top.folderId, how: 'semantic' }
    } catch {
      // The model failed to load: words still work.
    }
  } else if (notes.length) {
    const words = wordsOf(input.about)
    const top = rankFolders(
      notes.map((n) => ({ folderId: n.folder_id, score: setCosine(words, wordsOf(n.head)) })),
    )[0]
    if (top && top.score >= KEYWORDS_MIN)
      return { kind: 'folder', folderId: top.folderId, how: 'keywords' }
  }

  if (deps.ask) {
    const refs = folders.map((f, i) => ({
      ref: i + 1,
      id: f.id,
      path: folderPath(deps.folders, f.id),
    }))
    const names = new Map(folders.map((f) => [f.id, folderPath(deps.folders, f.id).join(' / ')]))
    try {
      const choice = await deps.ask({
        link: { title: input.title, site: input.host, excerpt: input.about.slice(0, 600) },
        folders: refs.map((r) => ({ ref: r.ref, path: r.path.join(' / ') })),
        examples: deps.lessons
          .slice(-8)
          .filter((l) => names.has(l.folderId))
          .map((l) => ({ title: l.title, site: l.host, folder: names.get(l.folderId) ?? '' })),
      })
      const picked = choice?.folder ? refs.find((r) => r.ref === choice.folder) : undefined
      if (picked) return { kind: 'folder', folderId: picked.id, how: 'model' }
      const name = choice?.newFolder?.replace(/\s+/g, ' ').trim().slice(0, 40)
      if (name) return { kind: 'topic', name }
    } catch {
      // No answer: Misc.
    }
  }
  return { kind: 'topic', name: null }
}

/** Adds a correction, keeping the newest `LESSONS_MAX`. */
export function addLesson(lessons: LinkLesson[], lesson: LinkLesson): LinkLesson[] {
  return [...lessons, lesson].slice(-LESSONS_MAX)
}

export function parseLessons(json: string | null | undefined): LinkLesson[] {
  try {
    const v: unknown = JSON.parse(json ?? '[]')
    return Array.isArray(v)
      ? v.filter(
          (l): l is LinkLesson =>
            typeof l === 'object' &&
            l !== null &&
            typeof (l as LinkLesson).host === 'string' &&
            typeof (l as LinkLesson).folderId === 'string' &&
            typeof (l as LinkLesson).at === 'number',
        )
      : []
  } catch {
    return []
  }
}
