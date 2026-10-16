import { type NotesRepo, speechVocabulary } from '@fixnote/core'

/** Notes looked at for names; recent ones are what people dictate about. */
const NOTES = 200
/** Recomputed after this long, so a new folder or name gets in during the day. */
const FRESH_MS = 10 * 60_000

let cached: { repo: NotesRepo; at: number; words: Promise<string[]> } | null = null

/**
 * The person's own words for the speech model's prompt (folder names, names that come up in
 * recent notes), read on the device. Never fails: no words is a fine prompt.
 */
export function speechWords(repo: NotesRepo): Promise<string[]> {
  if (cached && cached.repo === repo && Date.now() - cached.at < FRESH_MS) return cached.words
  const words = (async () => {
    const [folders, notes] = await Promise.all([
      repo.listFolders(),
      repo.listNotes({ limit: NOTES }),
    ])
    return speechVocabulary(
      notes.items.map((n) => `${n.title}\n${n.excerpt}`),
      folders.map((f) => f.name),
    )
  })().catch(() => [])
  cached = { repo, at: Date.now(), words }
  return words
}
