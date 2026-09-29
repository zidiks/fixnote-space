import { appendToDaily, type Note, type NotesRepo, type SqlDriver } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { kvStore } from './kv'
import { dailyTemplate, localDate } from './queries'

/** Settings: Telegram messages (Integrations) and dictated notes (General) go into today's note. */
export const CAPTURE_TO_DAILY = 'capture.toDaily'
export const VOICE_TO_DAILY = 'voice.toDaily'

/**
 * Whether new entries from `source` go into today's note. Dictation had no setting of its own
 * before: until it is set, it follows the old shared one (kept by Telegram).
 */
export async function captureToDaily(
  db: SqlDriver,
  source: 'telegram' | 'voice',
): Promise<boolean> {
  const kv = kvStore(db)
  const own = source === 'voice' ? await kv.get(VOICE_TO_DAILY) : null
  return (own ?? (await kv.get(CAPTURE_TO_DAILY))) === '1'
}

/** Adds text to today's note (created from the template if needed), stamped with the time. */
export async function appendToToday(repo: NotesRepo, text: string): Promise<Note> {
  const note = await repo.getOrCreateDaily(localDate(), () => dailyTemplate())
  const time = new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: 'short' }).format(
    new Date(),
  )
  return repo.updateContent(note.id, appendToDaily(note.content, text, time), {
    base: note.content,
  })
}
