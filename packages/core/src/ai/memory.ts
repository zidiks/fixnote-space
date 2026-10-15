import type { SqlDriver } from '../platform'

/**
 * What the assistant knows about the user across chats (like CLAUDE.md): preferences and lasting
 * facts, one per line, which the user reads and edits in Settings → AI and the assistant adds to
 * with its `remember` tool. Kept on this device (kv), removed with the account's notes.
 */
export const ASSISTANT_MEMORY_KEY = 'assistant.memory'
/** The whole memory: it goes with every message, so it stays short. */
export const MEMORY_MAX = 4000
/** One remembered fact: a preference or a fact, never a copy of a note. */
export const FACT_MAX = 300

export async function readMemory(db: Pick<SqlDriver, 'query'>): Promise<string> {
  const [row] = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
    ASSISTANT_MEMORY_KEY,
  ])
  return row?.value ?? ''
}

export async function writeMemory(db: Pick<SqlDriver, 'execute'>, text: string): Promise<void> {
  const value = text.trim()
  if (!value) {
    await db.execute('DELETE FROM kv WHERE key = ?', [ASSISTANT_MEMORY_KEY])
    return
  }
  await db.execute(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [ASSISTANT_MEMORY_KEY, value],
  )
}

const bare = (line: string) =>
  line
    .trim()
    .replace(/^[-*•]\s*/, '')
    .trim()
const same = (a: string, b: string) => bare(a).toLocaleLowerCase() === bare(b).toLocaleLowerCase()

/**
 * The memory with `fact` added as a line ("- fact"). With `replaces`, the line saying that (an
 * outdated preference) goes away first. Throws when the fact is empty, too long, or the memory
 * would grow past MEMORY_MAX.
 */
export function withFact(memory: string, fact: string, replaces?: string): string {
  const text = bare(fact.replace(/\s*\n+\s*/g, ' '))
  if (!text) throw new Error('Nothing to remember.')
  if (text.length > FACT_MAX) {
    throw new Error(
      `Too long to remember (${text.length} characters, at most ${FACT_MAX}). Keep one short preference or fact; notes belong in notes.`,
    )
  }
  let lines = memory.split('\n').filter((l) => l.trim())
  if (replaces?.trim()) {
    const before = lines.length
    lines = lines.filter((l) => !same(l, replaces))
    if (lines.length === before) {
      throw new Error(`Nothing in the memory says "${replaces}". Copy the line exactly.`)
    }
  }
  if (!lines.some((l) => same(l, text))) lines.push(`- ${text}`)
  const next = lines.join('\n')
  if (next.length > MEMORY_MAX) {
    throw new Error(
      'The memory is full. Replace an outdated line (`replaces`) or ask the user to tidy it in Settings → AI.',
    )
  }
  return next
}
