import type { Embedder, SqlDriver, SqlRow } from '../platform'
import { chunkNote, contentHash } from './chunk'
import { fromBlob, normalize, toBlob } from './vectors'

const MODEL_KEY = 'index.model'

export interface IndexedChunk {
  noteId: string
  ord: number
  text: string
  vector: Float32Array
}

/**
 * Keeps passage embeddings in step with note content, a few notes at a time, and serves them from
 * memory for search. Embeddings are local to each device.
 */
export class Indexer {
  private cache: Map<string, IndexedChunk[]> | null = null

  constructor(
    private readonly db: SqlDriver,
    private readonly embedder: Embedder,
  ) {}

  /** Clears everything if the embedding model changed since the last run. */
  async prepare(): Promise<void> {
    const [row] = await this.db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
      MODEL_KEY,
    ])
    if (row?.value === this.embedder.modelId) return
    await this.db.transaction(async (tx) => {
      await tx.execute('DELETE FROM chunks')
      await tx.execute('UPDATE notes SET indexed_at = NULL, indexed_hash = NULL')
      await tx.execute(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [MODEL_KEY, this.embedder.modelId],
      )
    })
    this.cache = null
  }

  /** Notes whose content changed since they were last embedded. */
  async pendingCount(): Promise<number> {
    const [row] = await this.db.query<{ n: number }>(
      `SELECT count(*) AS n FROM notes
        WHERE deleted_at IS NULL AND (indexed_at IS NULL OR indexed_at < updated_at)`,
    )
    return Number(row?.n ?? 0)
  }

  /** Embeds up to `batch` stale notes. Returns how many are still waiting. */
  async indexSome(batch = 8): Promise<number> {
    const rows = await this.db.query<{
      id: string
      content: string
      indexed_hash: string | null
      updated_at: number
    }>(
      `SELECT id, content, indexed_hash, updated_at FROM notes
        WHERE deleted_at IS NULL AND (indexed_at IS NULL OR indexed_at < updated_at)
        ORDER BY updated_at DESC LIMIT ?`,
      [batch],
    )
    for (const row of rows) {
      const hash = contentHash(row.content)
      const stamp = Number(row.updated_at)
      if (hash === row.indexed_hash) {
        await this.db.execute('UPDATE notes SET indexed_at = ? WHERE id = ?', [stamp, row.id])
        continue
      }
      const chunks = chunkNote(row.content)
      const vectors = chunks.length
        ? (
            await this.embedder.embed(
              chunks.map((c) => c.text),
              'passage',
            )
          ).map(normalize)
        : []
      await this.db.transaction(async (tx) => {
        await tx.execute('DELETE FROM chunks WHERE note_id = ?', [row.id])
        for (const [i, c] of chunks.entries()) {
          await tx.execute(
            'INSERT INTO chunks (note_id, ord, text, model, embedding) VALUES (?, ?, ?, ?, ?)',
            [row.id, c.ord, c.text, this.embedder.modelId, toBlob(vectors[i] as Float32Array)],
          )
        }
        // Stamp with the version we read: an edit made meanwhile stays stale and is picked up again.
        await tx.execute('UPDATE notes SET indexed_at = ?, indexed_hash = ? WHERE id = ?', [
          stamp,
          hash,
          row.id,
        ])
      })
      this.cache?.set(
        row.id,
        chunks.map((c, i) => ({
          noteId: row.id,
          ord: c.ord,
          text: c.text,
          vector: vectors[i] as Float32Array,
        })),
      )
    }
    return this.pendingCount()
  }

  /** All passages with their vectors, loaded once and kept current by `indexSome`. */
  async all(): Promise<Map<string, IndexedChunk[]>> {
    if (this.cache) return this.cache
    const rows = await this.db.query<
      SqlRow & { note_id: string; ord: number; text: string; embedding: Uint8Array }
    >('SELECT note_id, ord, text, embedding FROM chunks WHERE model = ? ORDER BY note_id, ord', [
      this.embedder.modelId,
    ])
    const map = new Map<string, IndexedChunk[]>()
    for (const r of rows) {
      const list = map.get(r.note_id) ?? []
      list.push({
        noteId: r.note_id,
        ord: Number(r.ord),
        text: r.text,
        vector: fromBlob(r.embedding),
      })
      map.set(r.note_id, list)
    }
    this.cache = map
    return map
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const [v] = await this.embedder.embed([text], 'query')
    return normalize(v as Float32Array)
  }
}
