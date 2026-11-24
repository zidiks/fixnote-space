/**
 * metrics-digest: the daily report in Telegram. pg_cron calls it at 09:00 Minsk; it sends the
 * numbers of the day before once (`metrics_claim` in *_metrics.sql), so it needs no key: a second
 * call that day does nothing. Mondays add the signup weeks (funnel, activation, retention).
 *
 * Counts only. The server never had note content, and the report names no account or email:
 * the chat it goes to could leak too. Each outside source (the site's numbers from Cloudflare,
 * GitHub downloads) is optional: without its secrets, or when it fails, its lines are left out.
 */

import { timingSafeEqual } from '../_shared/auth.ts'

export interface DayStats {
  accounts: number
  signups: number
  active_day: number
  active_7: number
  active_7_before: number
  pro: number
  trialing: number
  trials: number
  first_paid: number
  renewed: number
  canceled: number
  card_payments: { currency: string; count: number; sum: number }[]
  suby_payments: number
  notes_new: number
  notes_changed: number
  notes_accounts: number
  ai_requests: number
  ai_hard: number
  ai_accounts: number
  shared_new: number
  shared_total: number
  links_new: number
  capture_new: Record<string, number>
  capture_total: Record<string, number>
}

export interface Cohort {
  week: string
  signups: number
  trial: number
  paid: number
  renewed: number
  canceled: number
  notes5: number
  devices2: number
  ai: number
  capture: number
  /** Accounts active in week 1, 2, ... after the signup week. */
  retention: number[]
}

/**
 * The site, from Cloudflare: visits from Web Analytics (no cookies, so every visitor), and clicks
 * on Download from the requests to /download/<platform>. A part that could not be read is null.
 */
export interface SiteStats {
  visits: number | null
  pageviews: number | null
  /** Referring sites and countries, most visits first; '' is a visit without a referrer. */
  referrers: [string, number][]
  countries: [string, number][]
  /** Requests to /download/<platform> by platform (windows, mac-arm, mac-intel). */
  downloads: Record<string, number> | null
}

/** Download counters on GitHub: totals since the first release. */
export type Totals = Record<string, number>

export interface DigestDeps {
  now: number
  /** Null when the report of that day was already sent; else the totals of the last report. */
  claim(day: string): Promise<Totals | null>
  /** Lets a later call send the day again (the message did not go out). */
  release(day: string): Promise<void>
  saveTotals(day: string, totals: Totals): Promise<void>
  day(day: string): Promise<DayStats>
  cohorts(day: string): Promise<Cohort[]>
  downloads(): Promise<Totals | null>
  site(day: string): Promise<SiteStats | null>
  /** The GitHub totals of the last daily report, read without claiming anything. */
  lastTotals(): Promise<Totals | null>
  /** Null when the bot is not set up. */
  send: ((text: string) => Promise<void>) | null
  /** The chat the report goes to: the only one whose commands are answered. */
  chatId: string | null
  /** Telegram sends it with every update (setWebhook's `secret_token`); null: no commands. */
  webhookSecret: string | null
}

const MINSK = 3 * 3600_000
const DAY = 86_400_000

/** The day the report is about (yesterday in Minsk) and whether today is a Monday there. */
export function reportDay(now: number): { day: string; monday: boolean } {
  const today = new Date(now + MINSK)
  return {
    day: new Date(now + MINSK - DAY).toISOString().slice(0, 10),
    monday: today.getUTCDay() === 1,
  }
}

const minskDate = (now: number) => new Date(now + MINSK).toISOString().slice(0, 10)
const minskTime = (now: number) => new Date(now + MINSK).toISOString().slice(11, 16)

/**
 * pg_cron's daily call sends yesterday once. A message to the bot (a Telegram webhook, told
 * apart by its secret header) asks for a report any time: it never claims a day or saves totals,
 * so the daily reports go on as planned.
 */
export async function handle(req: Request, deps: DigestDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!deps.send) return new Response('Not configured', { status: 503 })
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== null) return command(req, secret, deps)

  const { day, monday } = reportDay(deps.now)
  const previous = await deps.claim(day)
  if (!previous) return Response.json({ skipped: true })
  try {
    const { text, totals } = await report(deps, day, previous, monday, {})
    await deps.send(text)
    if (totals) await deps.saveTotals(day, totals)
    return Response.json({ sent: day })
  } catch (e) {
    await deps.release(day).catch(() => undefined)
    console.error('metrics-digest failed', e instanceof Error ? e.message : String(e))
    return new Response('Failed', { status: 500 })
  }
}

async function report(
  deps: DigestDeps,
  day: string,
  previous: Totals,
  withCohorts: boolean,
  options: FormatOptions,
): Promise<{ text: string; totals: Totals | null }> {
  const [stats, cohorts, totals, site] = await Promise.all([
    deps.day(day),
    withCohorts ? deps.cohorts(day) : Promise.resolve(null),
    deps.downloads().catch(() => null),
    deps.site(day).catch(() => null),
  ])
  const grown = totals && growth(totals, previous)
  return { text: formatDigest(day, stats, site, grown, cohorts, options), totals }
}

export const HELP = [
  'Отчёт по запросу (плановые в 9:00 не сбиваются):',
  '/today — сегодня до этой минуты',
  '/yesterday — вчера целиком',
  '/week — вчера и недели регистрации',
].join('\n')

async function command(req: Request, secret: string, deps: DigestDeps): Promise<Response> {
  if (!deps.webhookSecret || !timingSafeEqual(secret, deps.webhookSecret)) {
    return new Response('Forbidden', { status: 403 })
  }
  let update: { message?: { chat?: { id?: number | string }; text?: string } }
  try {
    update = await req.json()
  } catch {
    return new Response('ok')
  }
  const message = update.message
  // Anyone can find the bot: only the report's own chat gets an answer.
  if (!message?.chat?.id || String(message.chat.id) !== deps.chatId) return new Response('ok')
  const name = (message.text ?? '').trim().split(/\s+/)[0]?.replace(/@.*$/, '').toLowerCase()
  const send = deps.send as (text: string) => Promise<void>
  const yesterday = reportDay(deps.now).day
  const asked: Record<string, [string, boolean, FormatOptions] | undefined> = {
    '/today': [minskDate(deps.now), false, { until: minskTime(deps.now) }],
    '/yesterday': [yesterday, false, {}],
    '/week': [yesterday, true, {}],
  }
  const what = name ? asked[name] : undefined
  try {
    if (!what) {
      await send(HELP)
      return new Response('ok')
    }
    const previous = (await deps.lastTotals().catch(() => null)) ?? {}
    const [day, withCohorts, options] = what
    const { text } = await report(deps, day, previous, withCohorts, {
      ...options,
      sinceLastReport: true,
    })
    await send(text)
  } catch (e) {
    console.error('metrics-digest command failed', e instanceof Error ? e.message : String(e))
    await send('Не получилось собрать отчёт, подробности в логах функции.').catch(() => undefined)
  }
  // Always 200: Telegram would send the same update again otherwise.
  return new Response('ok')
}

/** How much each counter grew since the last report; null without an earlier one to compare. */
export function growth(totals: Totals, previous: Totals): Totals | null {
  if (!Object.keys(previous).length) return null
  const out: Totals = {}
  for (const [key, value] of Object.entries(totals)) out[key] = value - (previous[key] ?? value)
  return out
}

/** Sums GitHub release assets by what they are for. */
export function downloadTotals(assets: { name: string; download_count: number }[]): Totals {
  const totals: Totals = { windows: 0, mac: 0, macUpdates: 0, updateChecks: 0 }
  for (const { name, download_count: n } of assets) {
    // Windows updates download the same installer, so its count holds both.
    if (/setup\.exe$|\.msi$/i.test(name)) totals.windows += n
    else if (/\.dmg$/i.test(name)) totals.mac += n
    else if (/\.app\.tar\.gz$/i.test(name)) totals.macUpdates += n
    else if (name === 'latest.json') totals.updateChecks += n
  }
  return totals
}

const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const pct = (part: number, whole: number) => (whole ? `${Math.round((part * 100) / whole)}%` : '—')
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n))

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]
const CHANNELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  extension: 'расширение',
}

function dayTitle(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

const shortDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`

export interface FormatOptions {
  /** The day is not over: the time (Minsk) the numbers go up to. */
  until?: string
  /** Downloads grew since the last daily report, not over the day (a report asked for). */
  sinceLastReport?: boolean
}

export function formatDigest(
  day: string,
  s: DayStats,
  site: SiteStats | null,
  downloads: Totals | null,
  cohorts: Cohort[] | null,
  options: FormatOptions = {},
): string {
  const out: string[] = [
    `📊 Fixnote · ${dayTitle(day)}${options.until ? ` (до ${options.until})` : ''}`,
  ]
  const block = (title: string, lines: (string | null)[]) => {
    const kept = lines.filter((l): l is string => !!l)
    if (kept.length) out.push('', title, ...kept)
  }

  if (site) {
    const list = (rows: [string, number][]) =>
      rows.map(([name, n]) => `${name || 'напрямую'} ${num(n)}`).join(', ')
    const clicks = site.downloads
    block('🌐 Сайт (Cloudflare)', [
      site.visits !== null
        ? `визиты ${num(site.visits)} · просмотры ${num(site.pageviews ?? 0)}`
        : null,
      site.referrers.length ? `откуда: ${list(site.referrers)}` : null,
      site.countries.length ? `страны: ${list(site.countries)}` : null,
      clicks
        ? `«Скачать»: Windows ${num(clicks.windows ?? 0)} · Mac ${num(
            (clicks['mac-arm'] ?? 0) + (clicks['mac-intel'] ?? 0),
          )} (Apple ${num(clicks['mac-arm'] ?? 0)}, Intel ${num(clicks['mac-intel'] ?? 0)})`
        : null,
    ])
  }

  if (downloads) {
    block(`⬇️ Скачивания (GitHub${options.sinceLastReport ? ', с утреннего отчёта' : ''})`, [
      `Windows ${num(downloads.windows ?? 0)} (с обновлениями) · Mac ${num(downloads.mac ?? 0)}` +
        ` · обновления Mac ${num(downloads.macUpdates ?? 0)}`,
      `проверок обновлений ${num(downloads.updateChecks ?? 0)}`,
    ])
  }

  const weekChange = s.active_7_before
    ? ` (${signed(Math.round(((s.active_7 - s.active_7_before) * 100) / s.active_7_before))}% к прошлым 7)`
    : ''
  block('👤 Аккаунты', [
    `новых ${num(s.signups)} · всего ${num(s.accounts)}`,
    `активны за день ${num(s.active_day)} · за 7 дней ${num(s.active_7)}${weekChange}`,
  ])

  const card = s.card_payments.length
    ? s.card_payments.map((p) => `картой ${num(p.count)} (${p.sum} ${p.currency})`).join(', ')
    : 'картой 0'
  block('⭐ Pro', [
    `триалов ${signed(s.trials)} · сейчас в триале ${num(s.trialing)} · Pro сейчас ${num(s.pro)}`,
    `первых оплат ${num(s.first_paid)} · продлений ${num(s.renewed)} · отмен ${num(s.canceled)}`,
    `платежи: ${card} · Suby ${num(s.suby_payments)}`,
  ])

  block('📝 Заметки (у аккаунтов с синхронизацией)', [
    `новых ${num(s.notes_new)} · изменено ${num(s.notes_changed)} · у ${num(s.notes_accounts)} аккаунтов`,
  ])

  block('🤖 AI', [
    `запросов ${num(s.ai_requests)} (hard ${num(s.ai_hard)}) · у ${num(s.ai_accounts)} аккаунтов`,
  ])

  const channels = Object.keys({ ...CHANNELS, ...s.capture_total })
  block('🔗 Общее и захват', [
    `общих заметок ${signed(s.shared_new)} (всего ${num(s.shared_total)}) · ссылок «Поделиться» ${signed(s.links_new)}`,
    `подключили: ${channels
      .map(
        (c) =>
          `${CHANNELS[c] ?? c} ${signed(s.capture_new[c] ?? 0)} (${num(s.capture_total[c] ?? 0)})`,
      )
      .join(', ')}`,
  ])

  const weeks = cohorts?.filter((c) => c.signups > 0) ?? []
  if (weeks.length) {
    out.push('', '🗓 Недели регистрации')
    for (const c of weeks) {
      out.push(
        '',
        `${shortDate(c.week)}: ${num(c.signups)} → триал ${num(c.trial)} (${pct(c.trial, c.signups)})` +
          ` → оплата ${num(c.paid)} (${pct(c.paid, c.signups)}) · продлили ${num(c.renewed)}` +
          ` · отменили ${num(c.canceled)}`,
        `  1-я неделя: 5+ заметок ${pct(c.notes5, c.signups)} · 2 устройства ${pct(c.devices2, c.signups)}` +
          ` · AI ${pct(c.ai, c.signups)} · захват ${pct(c.capture, c.signups)}`,
      )
      if (c.retention.length) {
        out.push(
          `  активны: ${c.retention.map((n, i) => `${i + 1}-я ${pct(n, c.signups)}`).join(' · ')}`,
        )
      }
    }
  }
  return out.join('\n')
}
