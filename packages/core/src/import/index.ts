import { unzipSync } from 'fflate'
import { addTags } from '../ai/tidy'
import { attachmentUrl } from '../attachments'
import { toPlainText } from '../notes/markdown'
import type { NotesRepo } from '../notes/repo'

/** A file picked by the user (or found inside an archive). */
export interface ImportFile {
  path: string
  data: Uint8Array
  /** Last-modified time, when known. */
  modified?: number
}

export type ImportSource = 'fixnote' | 'notion' | 'bear' | 'markdown'

interface PlannedImage {
  /** Exact Markdown to replace, e.g. `![alt](img/a.png)`. */
  match: string
  alt: string
  file: string
  /** Attachment id in a FixNote export, so every note sharing it points to one copy. */
  key?: string
}

export interface PlannedNote {
  file: string
  folder: string[]
  content: string
  created?: number
  updated?: number
  daily?: string
  images: PlannedImage[]
}

export interface ImportPlan {
  source: ImportSource
  notes: PlannedNote[]
  folders: number
  images: number
  /** Files that are not notes or images of a note (CSV databases, PDFs…). */
  skipped: string[]
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i
const NOTE = /\.(md|markdown|txt)$/i
const NOTION_ID = /\s+[0-9a-f]{32}(?=$|\.)/i
const decoder = new TextDecoder()
const text = (data: Uint8Array) => decoder.decode(data).replace(/^﻿/, '').replace(/\r\n?/g, '\n')

const mimeOf = (path: string) => {
  const ext = path.toLowerCase().match(/\.(\w+)$/)?.[1] ?? ''
  return (
    (
      {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        avif: 'image/avif',
        bmp: 'image/bmp',
      } as Record<string, string>
    )[ext] ?? 'application/octet-stream'
  )
}
export const importMime = mimeOf

/** Unpacks .zip / .bear2bk (and archives inside them, like Notion's parts), drops OS clutter. */
export function expandArchives(files: ImportFile[], depth = 0): ImportFile[] {
  const out: ImportFile[] = []
  for (const f of files) {
    const path = f.path.replace(/\\/g, '/').replace(/^\/+/, '')
    if (/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/.test(path)) continue
    if (/\.(zip|bear2bk)$/i.test(path) && depth < 2) {
      let entries: Record<string, Uint8Array>
      try {
        entries = unzipSync(f.data)
      } catch {
        out.push({ ...f, path })
        continue
      }
      const inner = Object.entries(entries)
        .filter(([name]) => !name.endsWith('/'))
        .map(([name, data]) => ({ path: name, data }))
      out.push(...expandArchives(inner, depth + 1))
      continue
    }
    out.push({ ...f, path })
  }
  return out
}

/** Drops a directory that wraps everything (a zipped folder), so it does not become a folder. */
function stripCommonRoot(files: ImportFile[]): ImportFile[] {
  const first = files[0]?.path.split('/')[0]
  if (!first || files.some((f) => !f.path.includes('/') || f.path.split('/')[0] !== first))
    return files
  if (files.some((f) => f.path.split('/')[0]?.endsWith('.textbundle'))) return files
  return stripCommonRoot(files.map((f) => ({ ...f, path: f.path.slice(first.length + 1) })))
}

export function detectSource(files: ImportFile[]): ImportSource {
  if (files.some((f) => /(^|\/)fixnote\.json$/.test(f.path))) return 'fixnote'
  if (files.some((f) => /\.textbundle\//i.test(f.path))) return 'bear'
  if (files.some((f) => NOTE.test(f.path) && NOTION_ID.test(f.path.split('/').pop() ?? '')))
    return 'notion'
  return 'markdown'
}

const cleanName = (name: string, source: ImportSource) =>
  (source === 'notion' ? name.replace(NOTION_ID, '') : name)
    .replace(/\.(md|markdown|txt|textbundle)$/i, '')
    .trim()

/** YAML front matter: title, tags and dates; the rest is dropped from the note. */
export function parseFrontMatter(content: string): {
  body: string
  title?: string
  tags: string[]
  created?: number
  updated?: number
} {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { body: content, tags: [] }
  const fields = new Map<string, string>()
  const tags: string[] = []
  let listKey: string | null = null
  for (const line of (m[1] ?? '').split('\n')) {
    const item = line.match(/^\s*-\s+(.+)$/)
    if (item && listKey === 'tags') {
      tags.push(item[1] as string)
      continue
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (!kv) continue
    const key = (kv[1] as string).toLowerCase()
    const value = (kv[2] as string).trim()
    listKey = value ? null : key
    fields.set(key, value.replace(/^["']|["']$/g, ''))
    if (key === 'tags' || key === 'tag') {
      // `[a, "b c"]` and `a, b` are lists; `a b` is two tags (Obsidian style).
      const list = value.replace(/^\[|\]$/g, '')
      tags.push(...list.split(/[,[]/.test(value) ? /\s*,\s*/ : /\s+/).filter(Boolean))
      listKey = value ? null : 'tags'
    }
  }
  const date = (v?: string) => {
    const t = v ? Date.parse(v) : Number.NaN
    return Number.isFinite(t) ? t : undefined
  }
  return {
    body: content.slice(m[0].length),
    ...(fields.get('title') ? { title: fields.get('title') } : {}),
    tags: tags
      .map((t) => t.replace(/["']/g, '').trim().replace(/^#/, '').replace(/\s+/g, '-'))
      .filter(Boolean),
    ...(date(fields.get('created') ?? fields.get('date')) !== undefined
      ? { created: date(fields.get('created') ?? fields.get('date')) }
      : {}),
    ...(date(fields.get('updated') ?? fields.get('modified')) !== undefined
      ? { updated: date(fields.get('updated') ?? fields.get('modified')) }
      : {}),
  }
}

/** Bear's `#tag with spaces#` → `#tag-with-spaces`, which the rest of FixNote understands. */
export function bearTags(content: string): string {
  return content.replace(
    /(^|\s)#([^\s#][^#\n]*?[^\s#])#(?=\s|$)/g,
    (m, pre: string, tag: string) =>
      tag.includes(' ') ? `${pre}#${tag.trim().replace(/\s+/g, '-')}` : m,
  )
}

/** A title line when the note's first line is not already its name or a heading. */
function withTitle(body: string, name: string): string {
  const trimmed = body.trim()
  if (!name) return trimmed
  if (!trimmed) return `# ${name}`
  const first = trimmed.split('\n')[0] ?? ''
  if (/^#{1,6}\s/.test(first)) return trimmed
  if (toPlainText(first).trim().toLowerCase() === name.toLowerCase()) return trimmed
  return `# ${name}\n\n${trimmed}`
}

function resolvePath(base: string[], ref: string): string {
  const parts = [...base]
  for (const seg of ref.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Finds images and internal links in a note; images are planned, links become their text. */
function linkImages(
  body: string,
  dir: string[],
  files: Map<string, ImportFile>,
  byName: Map<string, string>,
): { content: string; images: PlannedImage[] } {
  const images: PlannedImage[] = []
  const find = (ref: string) => {
    const path = resolvePath(dir, safeDecode(ref))
    if (files.has(path)) return path
    const lower = path.toLowerCase()
    for (const key of files.keys()) if (key.toLowerCase() === lower) return key
    return byName.get((ref.split('/').pop() ?? '').toLowerCase())
  }
  let content = body.replace(
    /!\[([^\]]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g,
    (m, alt: string, ref: string) => {
      if (/^[a-z][\w+.-]*:/i.test(ref)) return m
      const file = find(ref)
      if (file && IMAGE.test(file)) images.push({ match: m, alt, file })
      return m
    },
  )
  // Obsidian-style embeds.
  content = content.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (m, name: string) => {
    const file = byName.get((name.split('/').pop() ?? '').toLowerCase())
    if (file && IMAGE.test(file)) images.push({ match: m, alt: '', file })
    return m
  })
  // Links to other notes of the export have no target here; keep their words.
  content = content.replace(
    /(?<!!)\[([^\]]+)\]\(<?([^)\s>]+\.md)>?\)/gi,
    (m, label: string, ref: string) => (/^[a-z][\w+.-]*:/i.test(ref) ? m : label),
  )
  return { content, images }
}

/** Reads what the files hold, without changing anything yet. */
export function planImport(input: ImportFile[]): ImportPlan {
  const files = stripCommonRoot(expandArchives(input))
  const source = detectSource(files)
  if (source === 'fixnote') return planFixnote(files)
  const map = new Map(files.map((f) => [f.path, f]))
  const byName = new Map<string, string>()
  for (const f of files) byName.set((f.path.split('/').pop() ?? '').toLowerCase(), f.path)

  const notes: PlannedNote[] = []
  const used = new Set<string>()
  for (const f of files) {
    let dirParts = f.path.split('/').slice(0, -1)
    let name = cleanName(f.path.split('/').pop() ?? '', source)
    let created: number | undefined
    let updated = f.modified
    const bundle = f.path.match(/^(.*?)([^/]+\.textbundle)\/text\.(md|markdown|txt)$/i)
    if (bundle) {
      dirParts = (bundle[1] ?? '').split('/').filter(Boolean)
      name = cleanName(bundle[2] ?? '', source)
      const info = map.get(`${bundle[1]}${bundle[2]}/info.json`)
      if (info) {
        try {
          const meta = (JSON.parse(text(info.data)) as Record<string, Record<string, string>>)[
            'net.shinyfrog.bear'
          ]
          created = meta?.creationDate ? Date.parse(meta.creationDate) : undefined
          updated = meta?.modificationDate ? Date.parse(meta.modificationDate) : updated
        } catch {
          // no dates then
        }
      }
    } else if (!NOTE.test(f.path) || /\.textbundle\//i.test(f.path)) continue
    used.add(f.path)
    const fm = parseFrontMatter(text(f.data))
    let body = source === 'bear' ? bearTags(fm.body) : fm.body
    body = withTitle(body, fm.title ?? name)
    if (fm.tags.length) body = addTags(body, fm.tags)
    const baseDir = bundle ? [...dirParts, bundle[2] as string] : f.path.split('/').slice(0, -1)
    const linked = linkImages(body, baseDir, map, byName)
    for (const img of linked.images) used.add(img.file)
    notes.push({
      file: f.path,
      folder: dirParts.map((d) => cleanName(d, source)).filter(Boolean),
      content: linked.content,
      ...((fm.created ?? created) ? { created: fm.created ?? created } : {}),
      ...((fm.updated ?? updated) ? { updated: fm.updated ?? updated } : {}),
      images: linked.images,
    })
  }
  return summarize(source, notes, files, used)
}

function summarize(
  source: ImportSource,
  notes: PlannedNote[],
  files: ImportFile[],
  used: Set<string>,
): ImportPlan {
  const folders = new Set(
    notes.flatMap((n) => n.folder.map((_, i) => n.folder.slice(0, i + 1).join('/'))),
  )
  const images = new Set(notes.flatMap((n) => n.images.map((i) => i.key ?? i.file)))
  return {
    source,
    notes,
    folders: folders.size,
    images: images.size,
    skipped: files
      .map((f) => f.path)
      .filter(
        (p) =>
          !used.has(p) &&
          !/(^|\/)(info\.json|fixnote\.json)$/.test(p) &&
          !/\.textbundle\/assets\//i.test(p),
      ),
  }
}

interface FixnoteExport {
  folders: { id: string; parentId: string | null; name: string }[]
  notes: {
    id: string
    folderId: string | null
    type: string
    dailyDate: string | null
    content: string
    createdAt: string
    updatedAt: string
  }[]
  attachments?: Record<string, string>
}

/** FixNote's own export: the JSON copy has everything, including folders and daily notes. */
function planFixnote(files: ImportFile[]): ImportPlan {
  const json = files.find((f) => /(^|\/)fixnote\.json$/.test(f.path))
  const data = JSON.parse(text(json?.data ?? new Uint8Array())) as FixnoteExport
  const root = json?.path.replace(/fixnote\.json$/, '') ?? ''
  const byId = new Map(data.folders.map((f) => [f.id, f]))
  const pathOf = (id: string | null, depth = 0): string[] => {
    const f = id ? byId.get(id) : undefined
    return f && depth < 32 ? [...pathOf(f.parentId, depth + 1), f.name] : []
  }
  const attachmentFiles = data.attachments ?? {}
  const used = new Set<string>()
  const notes: PlannedNote[] = data.notes.map((n) => {
    const images: PlannedImage[] = []
    for (const m of n.content.matchAll(/!\[([^\]]*)\]\(attachment:([\w-]+)\)/g)) {
      const file = attachmentFiles[m[2] as string]
      if (file) {
        images.push({ match: m[0], alt: m[1] ?? '', file: root + file, key: m[2] as string })
        used.add(root + file)
      }
    }
    return {
      file: n.id,
      folder: pathOf(n.folderId),
      content: n.content,
      created: Date.parse(n.createdAt),
      updated: Date.parse(n.updatedAt),
      ...(n.type === 'daily' && n.dailyDate ? { daily: n.dailyDate } : {}),
      images,
    }
  })
  for (const n of notes) used.add(n.file)
  return summarize(
    'fixnote',
    notes,
    files.filter((f) => !/\.md$/i.test(f.path)),
    used,
  )
}

export interface ImportResult {
  noteIds: string[]
  folderIds: string[]
  images: number
  duplicates: number
}

/** Image targets differ between the source (`img/a.png`) and FixNote (`attachment:…`). */
const masked = (content: string) =>
  content
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '![$1]()')
    .replace(/!\[\[[^\]]*\]\]/g, '![]()')
    .trim()

/**
 * Creates the planned folders, images and notes. Notes identical to an existing one are skipped,
 * so importing the same export twice adds nothing.
 */
export async function runImport(
  plan: ImportPlan,
  input: ImportFile[],
  deps: {
    repo: NotesRepo
    /** Stores an image; returns its attachment id. */
    addImage: (file: ImportFile, mime: string) => Promise<string>
    onProgress?: (done: number, total: number) => void
  },
): Promise<ImportResult> {
  const files = new Map(stripCommonRoot(expandArchives(input)).map((f) => [f.path, f]))
  const { repo } = deps
  const existing = new Set((await repo.allContents()).map(masked))
  const folderIds = new Map<string, string>()
  const createdFolders: string[] = []
  const folders = await repo.listFolders()
  const folderFor = async (path: string[]): Promise<string | null> => {
    let parent: string | null = null
    for (let i = 0; i < path.length; i++) {
      const key = path.slice(0, i + 1).join('/')
      const known = folderIds.get(key)
      if (known) {
        parent = known
        continue
      }
      const name = path[i] as string
      const found = folders.find(
        (f) => f.parentId === parent && f.name.toLowerCase() === name.toLowerCase(),
      )
      const id: string = found?.id ?? (await repo.createFolder(name, parent)).id
      if (!found) {
        createdFolders.push(id)
        folders.push({ id, parentId: parent, name, sort: 0, noteCount: 0 })
      }
      folderIds.set(key, id)
      parent = id
    }
    return parent
  }

  const imageIds = new Map<string, string>()
  const result: ImportResult = { noteIds: [], folderIds: createdFolders, images: 0, duplicates: 0 }
  let done = 0
  for (const n of plan.notes) {
    if (existing.has(masked(n.content))) {
      result.duplicates++
      deps.onProgress?.(++done, plan.notes.length)
      continue
    }
    let content = n.content
    for (const img of n.images) {
      const key = img.key ?? img.file
      let id = imageIds.get(key)
      const file = files.get(img.file)
      if (id === undefined && file) {
        // An image that cannot be stored (too large, unreadable) keeps its original reference.
        id = await deps.addImage(file, mimeOf(img.file)).catch(() => '')
        imageIds.set(key, id)
        if (id) result.images++
      }
      if (id) content = content.split(img.match).join(`![${img.alt}](${attachmentUrl(id)})`)
    }
    const folderId = await folderFor(n.folder)
    const dates = {
      ...(n.created ? { createdAt: n.created } : {}),
      ...(n.updated ? { updatedAt: n.updated } : {}),
    }
    const daily = n.daily && !(await repo.hasDaily(n.daily)) ? n.daily : null
    const note = await repo.createNote(
      daily
        ? { content, type: 'daily', dailyDate: daily, ...dates }
        : { content, folderId, ...dates },
    )
    existing.add(masked(content))
    result.noteIds.push(note.id)
    deps.onProgress?.(++done, plan.notes.length)
  }
  return result
}
