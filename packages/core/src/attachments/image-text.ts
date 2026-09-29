import { buildFtsQuery } from '../notes/search'
import type { SqlDriver } from '../platform'

/** Images too small to hold text worth reading (icons, stickers). */
const MIN_BYTES = 8 * 1024

/**
 * Text read from images on this device (OCR). It is found by search together with the notes the
 * images are in; each device reads its own copies, nothing of it is synced.
 */
export class ImageTexts {
  constructor(
    private readonly db: SqlDriver,
    private readonly now: () => number = Date.now,
  ) {}

  /** The text of an image: '' when it has none, null when it was not read yet. */
  async get(attachmentId: string): Promise<string | null> {
    const [row] = await this.db.query<{ text: string }>(
      'SELECT text FROM image_text WHERE attachment_id = ?',
      [attachmentId],
    )
    return row ? row.text : null
  }

  async set(attachmentId: string, text: string): Promise<void> {
    await this.db.execute(
      `INSERT INTO image_text (attachment_id, text, created_at) VALUES (?, ?, ?)
       ON CONFLICT (attachment_id) DO UPDATE SET text = excluded.text`,
      [attachmentId, text.trim(), this.now()],
    )
  }

  /** Images on this device, in notes, not read yet: newest first. */
  async pending(limit = 20): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT a.id FROM attachments a
        WHERE a.mime LIKE 'image/%' AND a.mime <> 'image/svg+xml' AND a.size >= ?
          AND NOT EXISTS (SELECT 1 FROM image_text t WHERE t.attachment_id = a.id)
          AND EXISTS (SELECT 1 FROM notes n
                       WHERE n.deleted_at IS NULL AND instr(n.content, 'attachment:' || a.id) > 0)
        ORDER BY a.created_at DESC LIMIT ?`,
      [MIN_BYTES, limit],
    )
    return rows.map((r) => r.id)
  }

  /**
   * Notes whose images say what `match` (an FTS query) looks for, best first, with the text that
   * matched (marked with `mark` around the words found).
   */
  async matchNotes(
    match: string,
    opts: { limit?: number; mark?: [string, string] } = {},
  ): Promise<{ noteId: string; attachmentId: string; snippet: string; text: string }[]> {
    const [open, close] = opts.mark ?? ['', '']
    const hits = await this.db.query<{
      attachment_id: string
      text: string
      snip: string
    }>(
      `SELECT t.attachment_id, t.text,
              snippet(image_text_fts, 0, ?, ?, '…', 12) AS snip
         FROM image_text_fts JOIN image_text t ON t.rowid = image_text_fts.rowid
        WHERE image_text_fts MATCH ?
        ORDER BY bm25(image_text_fts) LIMIT 40`,
      [open, close, match],
    )
    const out: { noteId: string; attachmentId: string; snippet: string; text: string }[] = []
    const seen = new Set<string>()
    for (const h of hits) {
      const notes = await this.db.query<{ id: string }>(
        `SELECT id FROM notes WHERE deleted_at IS NULL AND instr(content, ?) > 0
          ORDER BY edited_at DESC`,
        [`attachment:${h.attachment_id}`],
      )
      for (const n of notes) {
        if (seen.has(n.id)) continue
        seen.add(n.id)
        out.push({ noteId: n.id, attachmentId: h.attachment_id, snippet: h.snip, text: h.text })
        if (out.length >= (opts.limit ?? 20)) return out
      }
    }
    return out
  }

  /** Same as `matchNotes`, from what the user typed. */
  search(input: string, limit = 20) {
    const match = buildFtsQuery(input)
    return match ? this.matchNotes(match, { limit }) : Promise.resolve([])
  }
}
