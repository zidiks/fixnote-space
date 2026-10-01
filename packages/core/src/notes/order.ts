import type { NoteSort, NoteSummary } from './types'

/**
 * The title as `listNotes` orders it: SQLite's lower() (ASCII letters only), untitled notes after
 * every title.
 */
const titleKey = (n: NoteSummary) =>
  n.title === '' ? '\u{10FFFF}' : n.title.replace(/[A-Z]/g, (c) => c.toLowerCase())

/**
 * The pages of a list as one run, in the order `listNotes` gives: each note once, sorted again.
 * Pages refetched after a change (sync moved dates) can overlap or come out of step; the list
 * still reads newest first.
 */
export function joinPages(
  pages: readonly (readonly NoteSummary[])[],
  sort: NoteSort,
): NoteSummary[] {
  const byId = new Map<string, NoteSummary>()
  // A note in two pages: the first page is the freshest read.
  for (const page of pages) for (const n of page) if (!byId.has(n.id)) byId.set(n.id, n)
  const notes = [...byId.values()]
  const tie = (a: NoteSummary, b: NoteSummary) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  if (sort === 'title') {
    return notes.sort((a, b) => {
      const ka = titleKey(a)
      const kb = titleKey(b)
      return ka < kb ? -1 : ka > kb ? 1 : -tie(a, b)
    })
  }
  const key = sort === 'created' ? 'createdAt' : 'updatedAt'
  return notes.sort((a, b) => b[key] - a[key] || tie(a, b))
}
