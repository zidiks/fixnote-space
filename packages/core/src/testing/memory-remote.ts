import type {
  PushResult,
  RemoteFolder,
  RemoteFolderWrite,
  RemoteNote,
  RemoteNoteWrite,
  SyncRemote,
} from '../sync/types'

/** In-memory server with the same rules as the Supabase RPCs, for tests. */
export class MemoryRemote implements SyncRemote {
  seq = 0
  readonly notes = new Map<string, RemoteNote>()
  readonly folders = new Map<string, RemoteFolder>()
  /** Called before a push is applied; lets tests simulate edits racing the network. */
  beforePush?: () => Promise<void>

  private async write<T extends { version: number; seq: number }, W extends { id: string }>(
    table: Map<string, T>,
    row: W,
    baseVersion: number,
  ): Promise<PushResult<T>> {
    await this.beforePush?.()
    const current = table.get(row.id)
    if ((current?.version ?? 0) !== baseVersion) {
      if (!current) throw new Error(`push of unknown ${row.id} with base ${baseVersion}`)
      return { ok: false, current: structuredClone(current) }
    }
    const next = { ...row, version: baseVersion + 1, seq: ++this.seq } as unknown as T
    table.set(row.id, next)
    return { ok: true, version: next.version, seq: next.seq }
  }

  private async read<T extends { seq: number }>(
    table: Map<string, T>,
    after: number,
    limit: number,
  ) {
    return [...table.values()]
      .filter((r) => r.seq > after)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map((r) => structuredClone(r))
  }

  pullNotes = (after: number, limit: number) => this.read(this.notes, after, limit)
  pullFolders = (after: number, limit: number) => this.read(this.folders, after, limit)
  pushNote = (row: RemoteNoteWrite, base: number) => this.write(this.notes, row, base)
  pushFolder = (row: RemoteFolderWrite, base: number) => this.write(this.folders, row, base)
}
