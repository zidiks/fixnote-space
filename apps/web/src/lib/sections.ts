import type { NoteSort, NoteSummary } from '@fixnote/core'
import { type DateGroup, dateGroup, dateGroupKey } from './time'

export interface Section {
  key: string
  group: DateGroup | null
  notes: NoteSummary[]
}

/**
 * Sorted by a date, notes come newest first, so each date group is one run of the list. By title
 * there are no groups.
 */
export function sections(notes: NoteSummary[], sort: NoteSort, now: Date): Section[] {
  if (sort === 'title') return notes.length ? [{ key: 'all', group: null, notes }] : []
  const out: Section[] = []
  for (const n of notes) {
    const group = dateGroup(sort === 'created' ? n.createdAt : n.updatedAt, now)
    const key = dateGroupKey(group)
    const last = out.at(-1)
    if (last?.key === key) last.notes.push(n)
    else out.push({ key, group, notes: [n] })
  }
  return out
}
