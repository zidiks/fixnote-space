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
  /** When the note was pinned; pinned notes stay on top of Home and their folder. */
  pinnedAt: number | null
  /** Shared with other people (see `SharedNotes`): synced as a shared note, not a personal one. */
  sharedId: string | null
  /** Shared with this account to view only: nothing may change it (see ReadOnlyError). */
  readOnly: boolean
  createdAt: number
  updatedAt: number
}

export interface Note extends NoteSummary {
  content: string
}

export interface NoteFilter {
  /** `inbox` = notes without a folder. */
  scope?: 'all' | 'inbox'
  /** The folder and its subfolders, at any depth. */
  folderId?: string
  tag?: string
  type?: NoteType
  /** Only notes updated at or after this timestamp (ms). */
  updatedSince?: number
  /** true: only pinned notes; false: only notes that are not pinned. */
  pinned?: boolean
}

export interface NoteCursor {
  updatedAt: number
  id: string
}

export interface NotePage {
  items: NoteSummary[]
  nextCursor: NoteCursor | null
}

/** A note edited in the same place on two devices: sync kept one version, the other is a copy. */
export interface SyncConflict {
  noteId: string
  copyId: string
  createdAt: number
}

/** How a conflict is settled: which text the note keeps; the copy goes away except with `both`. */
export type ConflictChoice = 'note' | 'copy' | 'combined' | 'both'

export interface Folder {
  id: string
  parentId: string | null
  name: string
  sort: number
  noteCount: number
  /** Shared with other people: this account's role in it (the owner's too). */
  shared: 'owner' | 'edit' | 'view' | null
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
