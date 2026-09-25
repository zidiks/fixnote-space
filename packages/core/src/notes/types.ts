export type NoteType = 'text' | 'daily'

export interface NoteSummary {
  id: string
  folderId: string | null
  type: NoteType
  /** Local date `YYYY-MM-DD` for daily notes. */
  dailyDate: string | null
  /** Derived from the first line; empty for a blank note. */
  title: string
  excerpt: string
  tags: string[]
  tasks: { done: number; total: number } | null
  /** First image of the note (attachment:<id> or a web URL), shown on its card. */
  cover: string | null
  createdAt: number
  updatedAt: number
}

export interface Note extends NoteSummary {
  content: string
}

export interface NoteFilter {
  /** `inbox` = notes without a folder. */
  scope?: 'all' | 'inbox'
  folderId?: string
  tag?: string
  type?: NoteType
  /** Only notes updated at or after this timestamp (ms). */
  updatedSince?: number
}

export interface NoteCursor {
  updatedAt: number
  id: string
}

export interface NotePage {
  items: NoteSummary[]
  nextCursor: NoteCursor | null
}

export interface Folder {
  id: string
  parentId: string | null
  name: string
  sort: number
  noteCount: number
}

export interface TagCount {
  name: string
  count: number
}

export interface Counts {
  all: number
  inbox: number
  daily: number
}

/** Snippet highlight markers: private-use characters, safe to split on without HTML parsing. */
export const MARK_START = '\uE000'
export const MARK_END = '\uE001'

export interface SearchHit {
  note: NoteSummary
  /** Content excerpt around the match, matches wrapped in MARK_START / MARK_END. */
  snippet: string
}
