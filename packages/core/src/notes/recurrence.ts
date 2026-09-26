/**
 * Repeating tasks in daily notes. The rule lives in the task line itself, so it syncs with the
 * note: `- [ ] Call mom 🔁 weekly:mon`. Rules:
 *   daily · weekdays · weekly:mon,thu · monthly:15 · every:3d@2026-09-26 (every 3 days from then)
 * A daily note created for a date gets the repeating tasks whose rule matches it; the rule is taken
 * from the latest daily note that has the task, so removing the 🔁 there ends the series.
 */

import { addTasks } from './daily'

export const RECUR_MARK = '🔁'

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type Weekday = (typeof DAYS)[number]

export type Recurrence =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekly'; days: Weekday[] }
  | { kind: 'monthly'; day: number }
  | { kind: 'interval'; every: number; from: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseRecurrence(rule: string): Recurrence | null {
  if (rule === 'daily') return { kind: 'daily' }
  if (rule === 'weekdays') return { kind: 'weekdays' }
  const weekly = rule.match(/^weekly:([a-z,]+)$/)
  if (weekly) {
    const days = (weekly[1] as string)
      .split(',')
      .filter((d): d is Weekday => (DAYS as readonly string[]).includes(d))
    return days.length ? { kind: 'weekly', days: DAYS.filter((d) => days.includes(d)) } : null
  }
  const monthly = rule.match(/^monthly:(\d{1,2})$/)
  if (monthly) {
    const day = Number(monthly[1])
    return day >= 1 && day <= 31 ? { kind: 'monthly', day } : null
  }
  const interval = rule.match(/^every:(\d{1,3})d@(\d{4}-\d{2}-\d{2})$/)
  if (interval) {
    const every = Number(interval[1])
    return every >= 1 ? { kind: 'interval', every, from: interval[2] as string } : null
  }
  return null
}

export function formatRecurrence(r: Recurrence): string {
  switch (r.kind) {
    case 'daily':
    case 'weekdays':
      return r.kind
    case 'weekly':
      return `weekly:${r.days.join(',')}`
    case 'monthly':
      return `monthly:${r.day}`
    case 'interval':
      return `every:${r.every}d@${r.from}`
  }
}

/** Days since 1970 of a `YYYY-MM-DD` date, the same everywhere (no time zones involved). */
const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

export const weekdayOf = (date: string): Weekday => DAYS[(dayNumber(date) + 4) % 7] as Weekday

/** Whether a task with this rule is due on `date` (YYYY-MM-DD). */
export function recursOn(r: Recurrence, date: string): boolean {
  if (!DATE.test(date)) return false
  const weekday = weekdayOf(date)
  switch (r.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return weekday !== 'sat' && weekday !== 'sun'
    case 'weekly':
      return r.days.includes(weekday)
    case 'monthly': {
      const [y, m, d] = date.split('-').map(Number) as [number, number, number]
      // Day 31 in a 30-day month falls on its last day.
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      return d === Math.min(r.day, last)
    }
    case 'interval': {
      const diff = dayNumber(date) - dayNumber(r.from)
      return diff >= 0 && diff % r.every === 0
    }
  }
}

const TASK = /^(\s*[-*+] \[(?: |x|X)\]\s+)(.*\S)\s*$/
const MARK = new RegExp(`\\s*${RECUR_MARK}\\s*(\\S+)$`)

/** A task's text without its rule, and the rule if it has a valid one. */
export function splitRecurrence(taskText: string): { text: string; rule: Recurrence | null } {
  const m = taskText.match(MARK)
  if (!m) return { text: taskText, rule: null }
  return { text: taskText.slice(0, m.index).trimEnd(), rule: parseRecurrence(m[1] as string) }
}

/** Every task of a note (done or not) with its rule, keyed by its text without the rule. */
export function noteTasks(markdown: string): { text: string; rule: Recurrence | null }[] {
  const out: { text: string; rule: Recurrence | null }[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(TASK)
    if (m) out.push(splitRecurrence(m[2] as string))
  }
  return out
}

/**
 * The repeating tasks due on `date`, as task texts with their rule, from earlier daily notes given
 * newest first. The newest note that has a task decides: with a rule it repeats, without, it stopped.
 */
export function dueRecurringTasks(earlierNewestFirst: readonly string[], date: string): string[] {
  const decided = new Set<string>()
  const due: string[] = []
  for (const markdown of earlierNewestFirst) {
    for (const { text, rule } of noteTasks(markdown)) {
      if (decided.has(text)) continue
      decided.add(text)
      if (rule && recursOn(rule, date)) due.push(`${text} ${RECUR_MARK} ${formatRecurrence(rule)}`)
    }
  }
  return due
}

/** The note with the rule of the task `text` set, changed or (null) removed. */
export function setTaskRecurrence(markdown: string, text: string, rule: Recurrence | null): string {
  return markdown
    .split('\n')
    .map((line) => {
      const m = line.match(TASK)
      if (!m || splitRecurrence(m[2] as string).text !== text) return line
      return `${m[1]}${text}${rule ? ` ${RECUR_MARK} ${formatRecurrence(rule)}` : ''}`
    })
    .join('\n')
}

/**
 * A later daily note (dated `date`) after the rule of task `text` changed in an earlier one: an
 * unfinished repeat gets the new rule, or goes away when the task no longer falls on that day; the
 * task is added where it now falls and is missing. Finished tasks and ones typed without a rule are
 * left as they are.
 */
export function applyTaskRule(
  markdown: string,
  date: string,
  text: string,
  rule: Recurrence | null,
): string {
  const due = rule !== null && recursOn(rule, date)
  const marked = rule ? `${text} ${RECUR_MARK} ${formatRecurrence(rule)}` : text
  let found = false
  const lines: string[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(TASK)
    const task = m ? splitRecurrence(m[2] as string) : null
    if (!m || task?.text !== text) {
      lines.push(line)
      continue
    }
    found = true
    const open = /\[ \]/.test(m[1] as string)
    if (!open || !MARK.test(m[2] as string)) lines.push(line)
    else if (due) lines.push(`${m[1]}${marked}`)
  }
  const next = lines.join('\n')
  return due && !found ? addTasks(next, [marked]) : next
}
