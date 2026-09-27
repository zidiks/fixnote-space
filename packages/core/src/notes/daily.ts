import { unionLines } from '../sync/merge'

/** Task list items as the editor writes them: `- [ ] text` / `- [x] text`, any indentation. */
const TASK = /^\s*[-*+] \[( |x|X)\](?:\s+(.*\S))?\s*$/

/** Texts of unfinished tasks, in order, without duplicates. Empty checkboxes are skipped. */
export function openTasks(markdown: string): string[] {
  const out: string[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(TASK)
    if (m?.[1] === ' ' && m[2] && !out.includes(m[2])) out.push(m[2])
  }
  return out
}

/** The note without the given unfinished tasks (they moved to another day). */
export function withoutTasks(markdown: string, tasks: readonly string[]): string {
  const drop = new Set(tasks)
  return markdown
    .split('\n')
    .filter((line) => {
      const m = line.match(TASK)
      return !(m?.[1] === ' ' && m[2] && drop.has(m[2]))
    })
    .join('\n')
}

/**
 * Adds tasks to a note: in place of the template's empty checkbox, else after its first task list,
 * else at the end. Tasks the note already has are not repeated.
 */
export function addTasks(markdown: string, tasks: readonly string[]): string {
  const lines = markdown.split('\n')
  const have = new Set(lines.map((l) => l.match(TASK)?.[2]).filter((t): t is string => Boolean(t)))
  const items = tasks.filter((t) => !have.has(t)).map((t) => `- [ ] ${t}`)
  if (!items.length) return markdown
  const empty = lines.findIndex((l) => {
    const m = l.match(TASK)
    return m?.[1] === ' ' && !m[2]
  })
  if (empty >= 0) {
    lines.splice(empty, 1, ...items)
    return lines.join('\n')
  }
  const first = lines.findIndex((l) => TASK.test(l))
  if (first >= 0) {
    let last = first
    while (last + 1 < lines.length && TASK.test(lines[last + 1] as string)) last++
    lines.splice(last + 1, 0, ...items)
    return lines.join('\n')
  }
  return `${markdown.trimEnd()}\n\n${items.join('\n')}\n`
}

/** Text appended to a daily note, e.g. from Telegram or dictation: stamped with the time. */
export function appendToDaily(markdown: string, text: string, time: string): string {
  return `${markdown.trimEnd()}\n\n${time} — ${text.trim()}\n`
}

/**
 * Two daily notes for the same date (made offline on two devices) as one: both texts, shared lines
 * once, each task once (done if it was done in either), no leftover empty checkbox when there are
 * real tasks. `first` is the note that keeps the date; the result depends only on the two texts.
 */
export function mergeDailyNotes(first: string, second: string): string {
  const lines = unionLines(first, second).split('\n')
  const tasks = lines.map((l) => l.match(TASK))
  const done = new Set(tasks.filter((m) => m?.[1] !== ' ' && m?.[2]).map((m) => m?.[2]))
  const hasTasks = tasks.some((m) => m?.[2])
  const seen = new Set<string>()
  const out: string[] = []
  lines.forEach((line, i) => {
    const m = tasks[i]
    if (!m) {
      // A blank line only once in a row.
      if (!line.trim() && !out.at(-1)?.trim() && out.length) return
      out.push(line)
      return
    }
    const text = m[2]
    if (!text) {
      if (!hasTasks) out.push(line)
      return
    }
    if (seen.has(text)) return
    seen.add(text)
    out.push(done.has(text) ? line.replace(/\[ \]/, '[x]') : line)
  })
  return out.join('\n')
}
