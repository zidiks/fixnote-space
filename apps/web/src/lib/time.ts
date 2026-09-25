const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "5 minutes ago" style, in the interface language. */
export function formatRelative(ts: number, lang: string | undefined, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const diff = Math.round((ts - now) / 1000)
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diff) >= seconds) return rtf.format(Math.round(diff / seconds), unit)
  }
  return rtf.format(0, 'second')
}

/** Short date for cards: time today, day and month this year, full date otherwise. */
export function formatCardDate(ts: number, lang: string | undefined, now = new Date()): string {
  const d = new Date(ts)
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return new Intl.DateTimeFormat(lang, { timeStyle: 'short' }).format(d)
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  return new Intl.DateTimeFormat(lang, opts).format(d)
}

export function startOfDay(d = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Where a note falls in the list, by when it last changed (as in Apple Notes). */
export type DateGroup =
  | { kind: 'today' | 'yesterday' | 'week' | 'month' }
  | { kind: 'monthOf'; year: number; month: number }
  | { kind: 'year'; year: number }

/**
 * Today, yesterday, the previous 7 days, the previous 30 days, then each earlier month of this
 * year, then each earlier year. Calendar days in local time.
 */
export function dateGroup(ts: number, now = new Date()): DateGroup {
  const d = new Date(ts)
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days <= 0) return { kind: 'today' }
  if (days === 1) return { kind: 'yesterday' }
  if (days <= 7) return { kind: 'week' }
  if (days <= 30) return { kind: 'month' }
  if (d.getFullYear() === now.getFullYear()) {
    return { kind: 'monthOf', year: d.getFullYear(), month: d.getMonth() }
  }
  return { kind: 'year', year: d.getFullYear() }
}

export const dateGroupKey = (g: DateGroup): string =>
  g.kind === 'monthOf' ? `${g.year}-${g.month}` : g.kind === 'year' ? String(g.year) : g.kind
