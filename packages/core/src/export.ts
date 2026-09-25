import { extractTags } from './notes/markdown'
import type { SqlDriver, SqlRow } from './platform'

export interface ExportFile {
  path: string
  content: string
}

interface Row extends SqlRow {
  id: string
  folder_id: string | null
  type: string
  daily_date: string | null
  title: string
  content: string
  created_at: number
  updated_at: number
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** A file or folder name that is valid on Windows, macOS and Linux. */
export function safeName(input: string, fallback: string): string {
  const cleaned = input
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
    .trim()
  if (!cleaned || RESERVED.test(cleaned)) return fallback
  return cleaned
}

/**
 * Every live note as a Markdown file in its folder path (Inbox and Daily at the top level), plus a
 * JSON file with the full data. Names are made unique within each folder.
 */
export async function buildExport(
  db: SqlDriver,
  labels: { inbox: string; daily: string; untitled: string },
  exportedAt = Date.now(),
): Promise<ExportFile[]> {
  const folders = await db.query<{ id: string; parent_id: string | null; name: string }>(
    'SELECT id, parent_id, name FROM folders WHERE deleted_at IS NULL',
  )
  const notes = await db.query<Row>(
    `SELECT id, folder_id, type, daily_date, title, content, created_at, updated_at
       FROM notes WHERE deleted_at IS NULL ORDER BY created_at, id`,
  )

  const byId = new Map(folders.map((f) => [f.id, f]))
  const pathCache = new Map<string, string>()
  const folderPath = (id: string, depth = 0): string => {
    const cached = pathCache.get(id)
    if (cached !== undefined) return cached
    const f = byId.get(id)
    if (!f || depth > 32) return safeName(labels.inbox, 'Inbox')
    const name = safeName(f.name, 'Folder')
    const path = f.parent_id ? `${folderPath(f.parent_id, depth + 1)}/${name}` : name
    pathCache.set(id, path)
    return path
  }

  const used = new Set<string>()
  const files: ExportFile[] = []
  for (const n of notes) {
    const dir = n.folder_id
      ? folderPath(n.folder_id)
      : n.type === 'daily'
        ? safeName(labels.daily, 'Daily')
        : safeName(labels.inbox, 'Inbox')
    const base = safeName(
      n.daily_date && n.type === 'daily' ? n.daily_date : n.title,
      labels.untitled,
    )
    let path = `${dir}/${base}.md`
    for (let i = 2; used.has(path.toLowerCase()); i++) path = `${dir}/${base} (${i}).md`
    used.add(path.toLowerCase())
    files.push({ path, content: n.content })
  }

  const json = {
    format: 'fixnote-export',
    version: 1,
    exportedAt: new Date(exportedAt).toISOString(),
    folders: folders.map((f) => ({ id: f.id, parentId: f.parent_id, name: f.name })),
    notes: notes.map((n) => ({
      id: n.id,
      folderId: n.folder_id,
      type: n.type,
      dailyDate: n.daily_date,
      title: n.title,
      tags: extractTags(n.content),
      content: n.content,
      createdAt: new Date(Number(n.created_at)).toISOString(),
      updatedAt: new Date(Number(n.updated_at)).toISOString(),
    })),
  }
  files.push({ path: 'fixnote.json', content: `${JSON.stringify(json, null, 2)}\n` })
  return files
}
