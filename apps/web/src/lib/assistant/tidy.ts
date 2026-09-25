import { buildTidyMessages, parseTidyReply, streamChat } from '@fixnote/ai'
import type { AuditLog } from '@fixnote/core'
import {
  type NewTidySuggestion,
  suggestionsFromProposals,
  type Tidy,
  type TidyLabels,
  type TidySuggestion,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { toast } from 'sonner'
import { create } from 'zustand'
import { chatTransport } from '../account/account'
import { MODEL, providerLabel } from './assistant'

interface TidyState {
  pending: number
  running: boolean
  error: string | null
}

export const useTidy = create<TidyState>()(() => ({ pending: 0, running: false, error: null }))

const LAST_RUN = 'tidy.lastRun'
const EVERY = 3 * 24 * 3600 * 1000

export const tidyLabels = (): TidyLabels => ({
  move: (folder, note) => i18n.t('tidy.logMove', { folder, note }),
  tag: (tags, note) => i18n.t('tidy.logTag', { tags, note }),
  title: (title) => i18n.t('tidy.logTitle', { title }),
  merge: (note, other) => i18n.t('tidy.logMerge', { note, other }),
})

/** One-line description of a suggestion, for cards and toasts. */
export function describeSuggestion(s: TidySuggestion | NewTidySuggestion): string {
  switch (s.kind) {
    case 'move':
      return i18n.t(s.newFolder ? 'tidy.moveNew' : 'tidy.move', { folder: s.folderName })
    case 'tag':
      return i18n.t('tidy.tag', { tags: s.tags.map((t) => `#${t}`).join(' ') })
    case 'title':
      return i18n.t('tidy.setTitle', { title: s.title })
    case 'merge':
      return i18n.t('tidy.merge', { other: s.otherTitle || i18n.t('common.untitled') })
  }
}

export async function refreshTidyCount(tidy: Tidy) {
  useTidy.setState({ pending: await tidy.pendingCount() })
}

/**
 * Asks the model for suggestions (all candidates, or just `noteIds`) and stores them; duplicates
 * are found locally. Returns the new suggestions, or 'signed-out' when there is no model access.
 */
export async function findSuggestions(
  tidy: Tidy,
  opts: { noteIds?: string[]; signal?: AbortSignal } = {},
): Promise<TidySuggestion[] | 'signed-out'> {
  const transport = await chatTransport()
  if (!transport) return 'signed-out'
  const candidates = await tidy.candidates(opts.noteIds ? { noteIds: opts.noteIds } : {})
  let found: NewTidySuggestion[] = []
  if (candidates.notes.length) {
    let reply = ''
    for await (const delta of streamChat({
      url: transport.url,
      headers: transport.headers,
      fetch: transport.fetch,
      model: MODEL,
      messages: buildTidyMessages(candidates),
      temperature: 0.2,
      maxTokens: 1500,
      signal: opts.signal,
    })) {
      reply += delta
    }
    found = suggestionsFromProposals(candidates, parseTidyReply(reply, candidates))
  }
  if (!opts.noteIds) found = [...found, ...(await tidy.duplicateSuggestions())]
  const saved = await tidy.save(found)
  await refreshTidyCount(tidy)
  return saved
}

/** The "Find suggestions" button. */
export async function runTidy(tidy: Tidy, kv: { set(key: string, value: string): Promise<void> }) {
  if (useTidy.getState().running) return
  useTidy.setState({ running: true, error: null })
  try {
    const result = await findSuggestions(tidy)
    if (result === 'signed-out') useTidy.setState({ error: i18n.t('tidy.signIn') })
    else await kv.set(LAST_RUN, String(Date.now()))
  } catch (err) {
    useTidy.setState({
      error: i18n.t('tidy.error', { message: err instanceof Error ? err.message : String(err) }),
    })
  } finally {
    useTidy.setState({ running: false })
  }
}

/** Every few days, in the background, when there is something to tidy. Quiet on failure. */
export async function maybeRunScheduled(
  tidy: Tidy,
  kv: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> },
) {
  await refreshTidyCount(tidy)
  const last = Number((await kv.get(LAST_RUN)) ?? 0)
  if (Date.now() - last < EVERY || useTidy.getState().running) return
  const candidates = await tidy.candidates({ limit: 40 })
  if (candidates.notes.filter((n) => n.noFolder).length < 3) return
  useTidy.setState({ running: true })
  try {
    const result = await findSuggestions(tidy)
    if (result !== 'signed-out') await kv.set(LAST_RUN, String(Date.now()))
  } catch {
    // Next launch tries again.
  } finally {
    useTidy.setState({ running: false })
  }
}

interface AcceptDeps {
  tidy: Tidy
  audit: AuditLog
  /** Refresh the UI after notes changed. */
  refresh: () => Promise<void>
}

/** Applies suggestions and offers Undo (which goes through the audit log). */
export async function acceptWithUndo(list: TidySuggestion[], deps: AcceptDeps) {
  const actions: string[] = []
  for (const s of list) {
    const id = await deps.tidy.accept(s, providerLabel(), tidyLabels())
    if (id) actions.push(id)
  }
  await deps.refresh()
  await refreshTidyCount(deps.tidy)
  if (!actions.length) return
  toast(i18n.t('tidy.applied'), {
    action: {
      label: i18n.t('tidy.undo'),
      onClick: async () => {
        let blocked = false
        for (const id of [...actions].reverse()) {
          const res = await deps.audit.undo(id)
          if (!res.ok && res.reason === 'changed') blocked = true
        }
        await deps.refresh()
        if (blocked) toast(i18n.t('audit.changed'))
      },
    },
  })
}

const suggestedThisSession = new Set<string>()

/**
 * After leaving a fresh note that has no folder: ask for a folder, tags and a title for it and
 * offer them in a toast. Silent when there is nothing to suggest or no model access.
 */
export async function suggestForNewNote(
  note: { id: string; title: string },
  deps: AcceptDeps & { review: () => void },
) {
  if (suggestedThisSession.has(note.id)) return
  suggestedThisSession.add(note.id)
  let found: TidySuggestion[] | 'signed-out'
  try {
    found = await findSuggestions(deps.tidy, { noteIds: [note.id] })
  } catch {
    return
  }
  if (found === 'signed-out' || !found.length) return
  const list = found
  const title = note.title || i18n.t('common.untitled')
  toast(
    i18n.t('tidy.noteSuggestion', {
      title: title.length > 40 ? `${title.slice(0, 39).trimEnd()}…` : title,
    }),
    {
      description: list.map(describeSuggestion).join(' · '),
      duration: 12_000,
      action: { label: i18n.t('tidy.apply'), onClick: () => void acceptWithUndo(list, deps) },
      cancel: { label: i18n.t('tidy.review'), onClick: deps.review },
    },
  )
}
