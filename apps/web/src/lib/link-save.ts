import { buildLinkPlaceMessages, parseLinkPlaceReply, streamChat } from '@fixnote/ai'
import {
  addLesson,
  type CapturedLink,
  type Folder,
  findLinkNote,
  folderPath,
  LESSONS_KEY,
  type LinkPreviews,
  linkHost,
  linkMarkdown,
  type NotesRepo,
  type PlaceRequest,
  parseLessons,
  placeableFolders,
  placeLink,
  type SqlDriver,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { toast } from 'sonner'
import { create } from 'zustand'
import { useUi } from '../app/store'
import { semanticSearch } from './assistant/assistant'
import { llm, useLlm } from './assistant/llm'
import { kvStore } from './kv'
import { linkFetcher } from './links'
import { isFree } from './plan'

/**
 * Saving a link without asking where (CONCEPT: links are notes): the same page twice is
 * recognised, the page's title and description are filled in when missing, and `placeLink`
 * picks the folder. The toast says where it went and offers "Change" (`LinkMoveDialog`), which
 * is remembered for the next link from that site.
 */

export interface LinkSaveDeps {
  db: SqlDriver
  repo: NotesRepo
  previews: LinkPreviews
  /** Notes changed: refresh what is on screen. */
  refresh: () => Promise<unknown> | undefined
}

/** The "Links" folder of this device's account: kept by id, so renaming it changes nothing. */
const ROOT_KEY = 'links.folder'

export interface SavedLink {
  noteId: string
  folderId: string | null
  path: string[]
  /** The topic folder made for this link, to take away again if the person moves it. */
  createdFolder: string | null
  duplicate: boolean
  host: string
  title: string
}

async function askModel(req: PlaceRequest) {
  // FixNote AI on Free would only answer "Pro needed".
  if (useLlm.getState().settings.kind === 'fixnote' && isFree()) return null
  const reach = await llm()
  if (!reach.ok) return null
  let reply = ''
  for await (const delta of streamChat({
    ...reach.route,
    messages: buildLinkPlaceMessages(req),
    temperature: 0.1,
    maxTokens: 120,
  })) {
    reply += delta
  }
  return parseLinkPlaceReply(reply, req)
}

async function rootFolder(deps: LinkSaveDeps, folders: Folder[]): Promise<string> {
  const kv = kvStore(deps.db)
  const own = placeableFolders(folders)
  const kept = await kv.get(ROOT_KEY)
  if (kept && own.some((f) => f.id === kept)) return kept
  const name = i18n.t('links.root')
  const found = own.find(
    (f) => f.parentId === null && f.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  )
  const id = found?.id ?? (await deps.repo.createFolder(name)).id
  await kv.set(ROOT_KEY, id)
  return id
}

/** Saves a link note (or finds the one already saved). */
export async function saveLink(
  deps: LinkSaveDeps,
  link: CapturedLink,
  opts: { createdAt?: number } = {},
): Promise<SavedLink> {
  const url = link.url.trim()
  const host = linkHost(url)
  let folders = await deps.repo.listFolders()

  const existing = await findLinkNote(deps.db, url)
  if (existing) {
    const note = await deps.repo.getNote(existing.id)
    return {
      noteId: existing.id,
      folderId: existing.folderId,
      path: folderPath(folders, existing.folderId),
      createdFolder: null,
      duplicate: true,
      host,
      title: note?.title ?? url,
    }
  }

  let { title, description, site } = link
  if (!title || !description) {
    const preview = await deps.previews.get(url, linkFetcher()).catch(() => null)
    title ||= preview?.title
    description ||= preview?.description
    site ||= preview?.site
  }
  const about = [title, description, link.selection, link.text?.slice(0, 1500)]
    .filter(Boolean)
    .join('\n')

  const search = semanticSearch()
  const placement = await placeLink(
    { title: title ?? host, host, about: about || url },
    {
      db: deps.db,
      folders,
      embed: search?.embed ?? null,
      vectors: search?.vectors ?? null,
      ask: useLlm.getState().localOnly ? null : askModel,
      lessons: parseLessons(await kvStore(deps.db).get(LESSONS_KEY)),
    },
  )

  let folderId: string
  let createdFolder: string | null = null
  if (placement.kind === 'folder') folderId = placement.folderId
  else {
    const root = await rootFolder(deps, folders)
    folders = await deps.repo.listFolders()
    const name = placement.name ?? i18n.t('links.misc')
    const topic = folders.find(
      (f) => f.parentId === root && f.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    if (topic) folderId = topic.id
    else {
      folderId = (await deps.repo.createFolder(name, root)).id
      createdFolder = folderId
    }
    folders = await deps.repo.listFolders()
  }

  const note = await deps.repo.createNote({
    content: linkMarkdown(
      { url, title, description, site, text: link.text, selection: link.selection },
      { pageText: i18n.t('links.pageText') },
    ),
    folderId,
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  })
  await deps.refresh()
  return {
    noteId: note.id,
    folderId,
    path: folderPath(folders, folderId),
    createdFolder,
    duplicate: false,
    host,
    title: note.title,
  }
}

const pathText = (path: string[]) => path.join(' ▸ ') || i18n.t('common.noFolder')

/** Saves and says where it went: "Saved to Design ▸ References · Change". */
export async function saveLinkWithToast(
  deps: LinkSaveDeps,
  link: CapturedLink,
  opts: { createdAt?: number } = {},
): Promise<SavedLink> {
  const saved = await saveLink(deps, link, opts)
  const open = () => useUi.getState().navigate({ kind: 'note', id: saved.noteId })
  if (saved.duplicate) {
    toast(i18n.t('links.already', { path: pathText(saved.path) }), {
      action: { label: i18n.t('links.open'), onClick: open },
    })
    return saved
  }
  toast(i18n.t('links.saved', { path: pathText(saved.path) }), {
    description: saved.title,
    duration: 8000,
    action: {
      label: i18n.t('links.change'),
      onClick: () =>
        useLinkMove.setState({
          target: {
            noteId: saved.noteId,
            host: saved.host,
            title: saved.title,
            from: saved.folderId,
            createdFolder: saved.createdFolder,
          },
        }),
    },
  })
  return saved
}

export interface LinkMoveTarget {
  noteId: string
  host: string
  title: string
  from: string | null
  createdFolder: string | null
}

/** The link whose folder the person is changing (`LinkMoveDialog`). */
export const useLinkMove = create<{ target: LinkMoveTarget | null }>()(() => ({ target: null }))

/**
 * Moves the link and remembers it for the site; a topic folder made just for this link and now
 * empty goes away.
 */
export async function moveLink(deps: LinkSaveDeps, target: LinkMoveTarget, folderId: string) {
  await deps.repo.moveNote(target.noteId, folderId)
  const kv = kvStore(deps.db)
  const lessons = addLesson(parseLessons(await kv.get(LESSONS_KEY)), {
    host: target.host,
    title: target.title,
    folderId,
    at: Date.now(),
  })
  await kv.set(LESSONS_KEY, JSON.stringify(lessons))
  if (target.createdFolder && target.createdFolder !== folderId) {
    const folders = await deps.repo.listFolders()
    const made = folders.find((f) => f.id === target.createdFolder)
    const empty = made && made.noteCount === 0 && !folders.some((f) => f.parentId === made.id)
    if (empty) await deps.repo.deleteFolder(made.id)
  }
  await deps.refresh()
  const folders = await deps.repo.listFolders()
  toast(i18n.t('links.moved', { path: pathText(folderPath(folders, folderId)) }))
}
