import type { NoteType } from '../notes/types'

/** A note as the server stores it: metadata in the clear, content sealed. */
export interface RemoteNote {
  id: string
  folderId: string | null
  type: NoteType
  dailyDate: string | null
  wrappedKey: string
  ciphertext: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  /** Bumped by the server on every accepted write. */
  version: number
  /** Server-wide monotonic counter; pulls ask for everything after the last one seen. */
  seq: number
}

export interface RemoteFolder {
  id: string
  parentId: string | null
  nameSealed: string
  sort: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  version: number
  seq: number
}

export type RemoteNoteWrite = Omit<RemoteNote, 'version' | 'seq'>
export type RemoteFolderWrite = Omit<RemoteFolder, 'version' | 'seq'>

export type PushResult<T> = { ok: true; version: number; seq: number } | { ok: false; current: T }

/**
 * The server side of sync. Writes use optimistic concurrency: a push names the version it was based
 * on (0 for a new row) and is rejected with the current row if someone else wrote in between.
 */
export interface SyncRemote {
  pullFolders(afterSeq: number, limit: number): Promise<RemoteFolder[]>
  pullNotes(afterSeq: number, limit: number): Promise<RemoteNote[]>
  pushFolder(row: RemoteFolderWrite, baseVersion: number): Promise<PushResult<RemoteFolder>>
  pushNote(row: RemoteNoteWrite, baseVersion: number): Promise<PushResult<RemoteNote>>
}

export interface SyncReport {
  pulled: number
  pushed: number
  merged: number
  conflictCopies: number
}
