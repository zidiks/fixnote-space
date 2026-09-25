import type { SqlDriver } from '../platform'
import { chunkNote } from './chunk'
import type { Indexer } from './indexer'
import type { ChatScope } from './scope'
import { dot } from './vectors'

export interface Fragment {
  noteId: string
  title: string
  ord: number
  text: string
  updatedAt: number
  /** Which searches found it; both means stronger evidence. */
  via: { keyword: boolean; semantic: boolean }
  score: number
}

const STOPWORDS = new Set(
  (
    'the a an and or of to in on for with is are was were be been what when where who how why which ' +
    'about from that this these those it its my me i you your do does did not no can could would should ' +
    'и в во на не что как где когда кто почему зачем про о об от до по за из у к с со а но или ли же бы ' +
    'это эта этот эти то та те мой моя мои мне меня я ты вы мы он она они был была были есть был ' +
    'el la los las un una unos unas y o de del en con por para que qué cómo como cuando dónde quién es son ' +
    'fue era mi mis me yo tu tus se lo le les al su sus'
  ).split(' '),
)

// Longest first. Enough to turn inflected forms into a shared prefix for FTS prefix matching.
const RU_ENDINGS = [
  'иями',
  'ями',
  'ами',
  'ого',
  'его',
  'ому',
  'ему',
  'ыми',
  'ими',
  'иях',
  'ться',
  'ешь',
  'ишь',
  'ах',
  'ях',
  'ов',
  'ев',
  'ей',
  'ой',
  'ый',
  'ий',
  'ая',
  'яя',
  'ое',
  'ее',
  'ую',
  'юю',
  'ом',
  'ем',
  'ам',
  'ям',
  'ть',
  'ла',
  'ли',
  'ло',
  'ет',
  'ют',
  'ут',
  'ит',
  'ат',
  'ят',
  'ы',
  'и',
  'а',
  'я',
  'о',
  'е',
  'у',
  'ю',
  'ь',
  'й',
]
const LATIN_ENDINGS = ['iones', 'ción', 'es', 's']

/** A light stemmer: strips a common ending so "токенами" and "токены" share the prefix "токен". */
export function stem(word: string): string {
  const cyrillic = /[\u0400-\u04ff]/.test(word)
  for (const end of cyrillic ? RU_ENDINGS : LATIN_ENDINGS) {
    if (word.endsWith(end) && word.length - end.length >= 4) return word.slice(0, -end.length)
  }
  return word
}

/** Keywords for full-text recall: any word may match (OR), stopwords and 1–2 letter words dropped. */
export function keywordQuery(input: string): string | null {
  const terms = input
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .slice(0, 16)
  if (!terms.length) return null
  // Russian and Spanish inflect: match on a stem so "заметках" finds "заметки".
  return [...new Set(terms.map(stem))].map((t) => `"${t}"*`).join(' OR ')
}

interface NoteRow {
  id: string
  title: string
  content: string
  updated_at: number
}

async function scopeNoteIds(db: SqlDriver, scope: ChatScope): Promise<Set<string> | null> {
  if (scope.kind === 'all') return null
  if (scope.kind === 'note') return new Set([scope.id])
  const rows = await db.query<{ id: string }>(
    `WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id)
     SELECT n.id FROM notes n WHERE n.deleted_at IS NULL AND n.folder_id IN (SELECT id FROM sub)`,
    [scope.id],
  )
  return new Set(rows.map((r) => r.id))
}

const RRF_K = 60
const DAY = 86_400_000

/**
 * Passages for a question: full-text and semantic search fused by reciprocal rank, nudged towards
 * recent notes. Works without embeddings (keyword only) and without keywords (semantic only). In a
 * single-note scope, the whole note is the context.
 */
export async function retrieve(
  db: SqlDriver,
  indexer: Indexer | null,
  question: string,
  scope: ChatScope,
  opts: { limit?: number; now?: number } = {},
): Promise<Fragment[]> {
  const limit = opts.limit ?? 8
  const now = opts.now ?? Date.now()
  const allowed = await scopeNoteIds(db, scope)
  const candidates = new Map<string, Fragment & { rrf: number }>()
  const notes = new Map<string, NoteRow>()

  const loadNotes = async (ids: string[]) => {
    const missing = ids.filter((id) => !notes.has(id))
    if (!missing.length) return
    const rows = await db.query<NoteRow & { [k: string]: string | number }>(
      `SELECT id, title, content, updated_at FROM notes
        WHERE deleted_at IS NULL AND id IN (${missing.map(() => '?').join(',')})`,
      missing,
    )
    for (const r of rows) notes.set(r.id, r)
  }

  const add = (
    noteId: string,
    ord: number,
    text: string,
    rank: number,
    kind: 'keyword' | 'semantic',
  ) => {
    const key = `${noteId}:${ord}`
    const note = notes.get(noteId)
    if (!note) return
    const f = candidates.get(key) ?? {
      noteId,
      title: note.title,
      ord,
      text,
      updatedAt: Number(note.updated_at),
      via: { keyword: false, semantic: false },
      score: 0,
      rrf: 0,
    }
    f.via[kind] = true
    f.rrf += 1 / (RRF_K + rank)
    candidates.set(key, f)
  }

  // Single note: everything in it is relevant context.
  if (scope.kind === 'note') {
    await loadNotes([scope.id])
    const note = notes.get(scope.id)
    if (!note) return []
    return chunkNote(note.content)
      .slice(0, limit)
      .map((c) => ({
        noteId: note.id,
        title: note.title,
        ord: c.ord,
        text: c.text,
        updatedAt: Number(note.updated_at),
        via: { keyword: true, semantic: false },
        score: 1,
      }))
  }

  // Keyword recall at note level, then the best-matching passage of each note.
  const match = keywordQuery(question)
  if (match) {
    const hits = await db.query<{ id: string }>(
      `SELECT n.id FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
        WHERE notes_fts MATCH ? AND n.deleted_at IS NULL
        ORDER BY bm25(notes_fts, 4.0, 1.0) LIMIT 40`,
      [match],
    )
    const ids = hits.map((h) => h.id).filter((id) => !allowed || allowed.has(id))
    await loadNotes(ids)
    const stems = match.split(' OR ').map((t) => t.slice(1, -2))
    let rank = 0
    for (const id of ids) {
      const note = notes.get(id)
      if (!note) continue
      const chunks = chunkNote(note.content)
      const best = chunks
        .map((c) => ({ c, hits: stems.filter((s) => c.text.toLowerCase().includes(s)).length }))
        .sort((a, b) => b.hits - a.hits)[0]
      if (best) add(id, best.c.ord, best.c.text, rank++, 'keyword')
    }
  }

  // Semantic recall over indexed passages.
  if (indexer) {
    try {
      const q = await indexer.embedQuery(question)
      const scored: { noteId: string; ord: number; text: string; sim: number }[] = []
      for (const [noteId, chunks] of await indexer.all()) {
        if (allowed && !allowed.has(noteId)) continue
        for (const c of chunks)
          scored.push({ noteId, ord: c.ord, text: c.text, sim: dot(q, c.vector) })
      }
      scored.sort((a, b) => b.sim - a.sim)
      const top = scored.slice(0, 40)
      await loadNotes([...new Set(top.map((t) => t.noteId))])
      for (const [rank, t] of top.entries()) add(t.noteId, t.ord, t.text, rank, 'semantic')
    } catch {
      // Model unavailable (offline first run, blocked download): keyword results still answer.
    }
  }

  return [...candidates.values()]
    .map((f) => {
      const ageDays = Math.max(0, (now - f.updatedAt) / DAY)
      const { rrf, ...rest } = f
      return { ...rest, score: rrf * (1 + 0.15 * Math.exp(-ageDays / 30)) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
