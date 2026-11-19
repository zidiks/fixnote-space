import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type Cohort,
  type DayStats,
  type DigestDeps,
  downloadTotals,
  formatDigest,
  growth,
  HELP,
  handle,
  reportDay,
} from './handler.ts'

const post = () => new Request('http://fn/metrics-digest', { method: 'POST' })

const stats: DayStats = {
  accounts: 1204,
  signups: 9,
  active_day: 88,
  active_7: 146,
  active_7_before: 138,
  pro: 37,
  trialing: 12,
  trials: 4,
  first_paid: 2,
  renewed: 1,
  canceled: 0,
  card_payments: [{ currency: 'USD', count: 2, sum: 15.98 }],
  suby_payments: 1,
  notes_new: 312,
  notes_changed: 1020,
  notes_accounts: 61,
  ai_requests: 1240,
  ai_hard: 138,
  ai_accounts: 54,
  shared_new: 3,
  shared_total: 41,
  links_new: 5,
  capture_new: { telegram: 2 },
  capture_total: { telegram: 30, extension: 4 },
}

const cohort: Cohort = {
  week: '2026-11-09',
  signups: 40,
  trial: 18,
  paid: 5,
  renewed: 1,
  canceled: 2,
  notes5: 15,
  devices2: 8,
  ai: 20,
  capture: 5,
  retention: [24],
}

// Tuesday 2026-11-17, 06:00 UTC = 09:00 in Minsk.
const TUESDAY = Date.UTC(2026, 10, 17, 6)
const MONDAY = Date.UTC(2026, 10, 16, 6)

function deps(over: Partial<DigestDeps> = {}) {
  const sent: string[] = []
  const claimed = new Set<string>()
  const saved: [string, Record<string, number>][] = []
  const d: DigestDeps = {
    now: TUESDAY,
    claim: async (day) => {
      if (claimed.has(day)) return null
      claimed.add(day)
      return { windows: 100, mac: 10, macUpdates: 0, updateChecks: 500 }
    },
    release: async (day) => void claimed.delete(day),
    saveTotals: async (day, totals) => void saved.push([day, totals]),
    day: async () => stats,
    cohorts: async () => [cohort],
    downloads: async () => ({ windows: 119, mac: 14, macUpdates: 2, updateChecks: 557 }),
    site: async () => ({
      visits: 412,
      pageviews: 980,
      referrers: [
        ['', 200],
        ['x.com', 40],
      ],
      countries: [['United States', 120]],
      downloads: { windows: 19, 'mac-arm': 3, 'mac-intel': 1 },
    }),
    lastTotals: async () => ({ windows: 110, mac: 12, macUpdates: 1, updateChecks: 540 }),
    send: async (text) => void sent.push(text),
    chatId: '493608410',
    webhookSecret: 'hook-secret',
    ...over,
  }
  return { d, sent, claimed, saved }
}

const message = (text: string, chat: number | string = 493608410, secret = 'hook-secret') =>
  new Request('http://fn/metrics-digest', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ update_id: 1, message: { chat: { id: chat }, text } }),
  })

Deno.test('a command sends a report and leaves the daily one alone', async () => {
  const { d, sent, claimed, saved } = deps()
  assertEquals((await handle(message('/today'), d)).status, 200)
  // 06:00 UTC on Tuesday is 09:00 in Minsk: today so far.
  assertStringIncludes(sent[0] ?? '', '📊 Fixnote · вт, 17 ноября (до 09:00)')
  assertStringIncludes(sent[0] ?? '', 'Скачивания (GitHub, с утреннего отчёта)')
  assertStringIncludes(sent[0] ?? '', 'Windows 9 (с обновлениями) · Mac 2')
  assertEquals(claimed.size, 0)
  assertEquals(saved, [])

  // The daily report still goes out afterwards.
  await handle(post(), d)
  assertEquals(sent.length, 2)
  assertStringIncludes(sent[1] ?? '', 'пн, 16 ноября')
})

Deno.test('/yesterday, /week with cohorts, help for anything else', async () => {
  const { d, sent } = deps()
  await handle(message('/yesterday@fixnote_metrics_bot'), d)
  assertStringIncludes(sent[0] ?? '', '📊 Fixnote · пн, 16 ноября')
  assertEquals(sent[0]?.includes('Недели регистрации'), false)
  await handle(message('/week'), d)
  assertStringIncludes(sent[1] ?? '', 'Недели регистрации')
  await handle(message('hello'), d)
  assertEquals(sent[2], HELP)
})

Deno.test('commands only from the report chat, only with the webhook secret', async () => {
  const { d, sent } = deps()
  assertEquals((await handle(message('/today', 111), d)).status, 200)
  assertEquals((await handle(message('/today', 493608410, 'wrong'), d)).status, 403)
  const off = deps({ webhookSecret: null })
  assertEquals((await handle(message('/today'), off.d)).status, 403)
  assertEquals(sent.length + off.sent.length, 0)
})

Deno.test('a command that fails says so and still answers Telegram with 200', async () => {
  const { d, sent } = deps({
    day: async () => {
      throw new Error('db down')
    },
  })
  assertEquals((await handle(message('/today'), d)).status, 200)
  assertStringIncludes(sent[0] ?? '', 'Не получилось собрать отчёт')
})

Deno.test('the report is about yesterday in Minsk', () => {
  // 23:30 UTC on the 16th is already the 17th in Minsk.
  assertEquals(reportDay(Date.UTC(2026, 10, 16, 23, 30)), { day: '2026-11-16', monday: false })
  assertEquals(reportDay(MONDAY), { day: '2026-11-15', monday: true })
})

Deno.test('sends the day once, with how much the downloads grew', async () => {
  const { d, sent, saved } = deps()
  assertEquals((await handle(post(), d)).status, 200)
  assertEquals(sent.length, 1)
  assertStringIncludes(sent[0] ?? '', '📊 Fixnote · пн, 16 ноября')
  assertStringIncludes(sent[0] ?? '', 'Windows 19 (с обновлениями) · Mac 4 · обновления Mac 2')
  assertStringIncludes(sent[0] ?? '', 'проверок обновлений 57')
  assertStringIncludes(sent[0] ?? '', 'визиты 412 · просмотры 980')
  assertStringIncludes(sent[0] ?? '', 'откуда: напрямую 200, x.com 40')
  assertStringIncludes(sent[0] ?? '', 'страны: United States 120')
  assertStringIncludes(sent[0] ?? '', '«Скачать»: Windows 19 · Mac 4 (Apple 3, Intel 1)')
  assertEquals(saved, [['2026-11-16', { windows: 119, mac: 14, macUpdates: 2, updateChecks: 557 }]])

  assertEquals(await (await handle(post(), d)).json(), { skipped: true })
  assertEquals(sent.length, 1)
})

Deno.test('cohorts only on Mondays', async () => {
  const tuesday = deps()
  await handle(post(), tuesday.d)
  assertEquals(tuesday.sent[0]?.includes('Недели регистрации'), false)

  const empty = { ...cohort, week: '2026-11-02', signups: 0, trial: 0, paid: 0, retention: [] }
  const monday = deps({ now: MONDAY, cohorts: async () => [cohort, empty] })
  await handle(post(), monday.d)
  // A week nobody signed up in is left out.
  assertEquals(monday.sent[0]?.includes('02.11'), false)
  assertStringIncludes(monday.sent[0] ?? '', '09.11: 40 → триал 18 (45%) → оплата 5 (13%)')
  assertStringIncludes(monday.sent[0] ?? '', 'активны: 1-я 60%')
})

Deno.test('leaves out a source that failed or is not set up', async () => {
  const { d, sent } = deps({
    downloads: async () => {
      throw new Error('GitHub 403')
    },
    site: async () => {
      throw new Error('Cloudflare 401')
    },
  })
  assertEquals((await handle(post(), d)).status, 200)
  assertEquals(sent[0]?.includes('Скачивания'), false)
  assertEquals(sent[0]?.includes('Сайт'), false)
  assertStringIncludes(sent[0] ?? '', 'новых 9 · всего 1 204')
})

Deno.test('a message that did not go out can be sent again', async () => {
  let fail = true
  const { d, sent } = deps({
    send: async (text) => {
      if (fail) throw new Error('Telegram 502')
      sent.push(text)
    },
  })
  assertEquals((await handle(post(), d)).status, 500)
  fail = false
  assertEquals((await handle(post(), d)).status, 200)
  assertEquals(sent.length, 1)
})

Deno.test('does nothing without the bot, and only on POST', async () => {
  const { d } = deps({ send: null })
  assertEquals((await handle(post(), d)).status, 503)
  const get = new Request('http://fn/metrics-digest')
  assertEquals((await handle(get, deps().d)).status, 405)
})

Deno.test('formats the day without names, only counts', () => {
  const text = formatDigest('2026-11-16', stats, null, null, null)
  assertStringIncludes(text, 'активны за день 88 · за 7 дней 146 (+6% к прошлым 7)')
  assertStringIncludes(text, 'триалов +4 · сейчас в триале 12 · Pro сейчас 37')
  assertStringIncludes(text, 'платежи: картой 2 (15.98 USD) · Suby 1')
  assertStringIncludes(text, 'запросов 1 240 (hard 138) · у 54 аккаунтов')
  assertStringIncludes(text, 'подключили: Telegram +2 (30), Discord 0 (0), расширение 0 (4)')
})

Deno.test('sorts GitHub assets by platform; growth needs an earlier report', () => {
  const totals = downloadTotals([
    { name: 'FixNote-Windows-x64-setup.exe', download_count: 40 },
    { name: 'FixNote-Windows-x64-en-US.msi', download_count: 1 },
    { name: 'FixNote-macOS-arm64.dmg', download_count: 3 },
    { name: 'FixNote-macOS-arm64.app.tar.gz', download_count: 2 },
    { name: 'latest.json', download_count: 19 },
  ])
  assertEquals(totals, { windows: 41, mac: 3, macUpdates: 2, updateChecks: 19 })
  assertEquals(growth(totals, {}), null)
  assertEquals(growth(totals, { windows: 40 }), {
    windows: 1,
    mac: 0,
    macUpdates: 0,
    updateChecks: 0,
  })
})
