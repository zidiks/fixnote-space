import { appendToDaily, type Note, type NotesRepo, type SqlDriver } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { kvStore } from './kv'
import { dailyTemplate, localDate } from './queries'

/** Setting: dictated notes and Telegram messages go into today's note instead of new notes. */
export const CAPTURE_TO_DAILY = 'capture.toDaily'

export async function captureToDaily(db: SqlDriver): Promise<boolean> {
  return (await kvStore(db).get(CAPTURE_TO_DAILY)) === '1'
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
