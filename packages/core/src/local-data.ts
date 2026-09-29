import { CHAT_SUMMARY_KEY, voiceKeys } from './ai/chat'
import type { BlobStore, SqlDriver } from './platform'

/**
 * Changes on this device the server does not have yet: notes, folders and files not pushed, and
 * shared notes not saved. Removing the notes from the device loses them.
 */
export async function unsyncedChanges(db: SqlDriver): Promise<number> {
  const [row] = await db.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM notes WHERE dirty = 1 AND shared_id IS NULL)
          + (SELECT count(*) FROM folders WHERE dirty = 1 AND shared_id IS NULL)
          + (SELECT count(*) FROM attachments WHERE uploaded = 0)
          + (SELECT count(*) FROM shared_docs WHERE dirty = 1) AS n`,
  )
  return Number(row?.n ?? 0)
}

/**
 * Removes an account's notes from this device: notes, folders, files and everything made from
 * them (the search index, the assistant's chat, the AI log, tidy suggestions, conflicts, shared
 * notes and the sync position), so another account can start here or nothing stays on a computer
 * that is not yours. Device settings (AI, MCP access) stay. The account's copy on the server is
 * untouched.
 */
export async function forgetLocalNotes(db: SqlDriver, blobs: BlobStore): Promise<void> {
  const files = await db.query<{ id: string }>('SELECT id FROM attachments')
  const recordings = await voiceKeys(db)
  await db.transaction(async (tx) => {
    for (const table of [
      'notes',
      'folders',
      'chunks',
      'chat_messages',
      'link_previews',
      'attachments',
      'ai_actions',
      'tidy_suggestions',
      'sync_conflicts',
      'shared_docs',
      'shared_folders',
      'shared_files',
    ])
      await tx.execute(`DELETE FROM ${table}`)
    await tx.execute(
      `DELETE FROM kv WHERE key LIKE 'sync.%' OR key LIKE 'capture.%' OR key IN ('mcp.scope', '${CHAT_SUMMARY_KEY}')`,
    )
  })
  for (const { id } of files) await blobs.delete(`att/${id}`).catch(() => undefined)
  for (const key of recordings) await blobs.delete(key).catch(() => undefined)
}
