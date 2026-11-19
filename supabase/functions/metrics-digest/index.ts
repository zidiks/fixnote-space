import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  type Cohort,
  type DayStats,
  type DigestDeps,
  downloadTotals,
  handle,
  type SiteStats,
  type Totals,
} from './handler.ts'

// Service role: the counts cover every account (security definer functions in *_metrics.sql).
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const env = (name: string) => Deno.env.get(name)?.trim() || null

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

async function downloads(): Promise<Totals | null> {
  const repo = env('GITHUB_REPO') ?? 'zidiks/fixnote-space'
  const token = env('GITHUB_TOKEN')
  const assets: { name: string; download_count: number }[] = []
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'fixnote-metrics',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    )
    if (!res.ok) throw new Error(`GitHub ${res.status}`)
    const releases = (await res.json()) as { assets: { name: string; download_count: number }[] }[]
    for (const r of releases) assets.push(...r.assets)
    if (releases.length < 100) break
  }
  return downloadTotals(assets)
}

// The site's numbers from Cloudflare's GraphQL Analytics API. The token needs only
// "Account Analytics: Read" and "Zone Analytics: Read".
const cf = {
  token: env('CLOUDFLARE_API_TOKEN'),
  account: env('CLOUDFLARE_ACCOUNT_ID'),
  zone: env('CLOUDFLARE_ZONE_ID'),
  /** Web Analytics' site tag (not the beacon token). */
  site: env('CLOUDFLARE_SITE_TAG'),
  host: env('SITE_HOST') ?? 'fixnote.space',
}

async function cloudflare<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cf.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Cloudflare ${res.status}`)
  const body = (await res.json()) as { data: T | null; errors?: { message: string }[] | null }
  if (body.errors?.length || !body.data) {
    throw new Error(`Cloudflare: ${body.errors?.[0]?.message ?? 'no data'}`)
  }
  return body.data
}

const VISITS = `query ($account: string!, $site: string!, $from: Time!, $to: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    total: rumPageloadEventsAdaptiveGroups(limit: 1,
      filter: { siteTag: $site, datetime_geq: $from, datetime_lt: $to }) {
      count sum { visits }
    }
    referrers: rumPageloadEventsAdaptiveGroups(limit: 5, orderBy: [sum_visits_DESC],
      filter: { siteTag: $site, datetime_geq: $from, datetime_lt: $to }) {
      sum { visits } dimensions { refererHost }
    }
    countries: rumPageloadEventsAdaptiveGroups(limit: 5, orderBy: [sum_visits_DESC],
      filter: { siteTag: $site, datetime_geq: $from, datetime_lt: $to }) {
      sum { visits } dimensions { countryName }
    }
  } }
}`

const DOWNLOADS = `query ($zone: string!, $host: string!, $from: Time!, $to: Time!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptiveGroups(limit: 10, filter: {
      datetime_geq: $from, datetime_lt: $to, clientRequestHTTPHost: $host,
      clientRequestPath_in: ["/download/windows", "/download/mac-arm", "/download/mac-intel"]
    }) { count dimensions { clientRequestPath } }
  } }
}`

interface VisitRow {
  count?: number
  sum: { visits: number }
  dimensions?: { refererHost?: string; countryName?: string }
}

async function site(day: string): Promise<SiteStats | null> {
  if (!cf.token) return null
  // The Minsk day (UTC+3) as an instant range.
  const from = new Date(`${day}T00:00:00+03:00`)
  const range = {
    from: from.toISOString(),
    to: new Date(from.getTime() + 86_400_000).toISOString(),
  }
  const [visits, clicks] = await Promise.allSettled([
    cf.account && cf.site
      ? cloudflare<{
          viewer: {
            accounts: { total: VisitRow[]; referrers: VisitRow[]; countries: VisitRow[] }[]
          }
        }>(VISITS, { account: cf.account, site: cf.site, ...range })
      : Promise.reject(new Error('no Web Analytics site')),
    cf.zone
      ? cloudflare<{
          viewer: {
            zones: {
              httpRequestsAdaptiveGroups: {
                count: number
                dimensions: { clientRequestPath: string }
              }[]
            }[]
          }
        }>(DOWNLOADS, { zone: cf.zone, host: cf.host, ...range })
      : Promise.reject(new Error('no zone')),
  ])
  if (visits.status === 'rejected' && clicks.status === 'rejected') {
    throw new Error(`site: ${String(visits.reason)}; ${String(clicks.reason)}`)
  }
  const account = visits.status === 'fulfilled' ? visits.value.viewer.accounts[0] : undefined
  const total = account?.total[0]
  const rows = (list: VisitRow[] | undefined, key: 'refererHost' | 'countryName') =>
    (list ?? []).map((r): [string, number] => [r.dimensions?.[key] ?? '', r.sum.visits])
  let downloads: Record<string, number> | null = null
  if (clicks.status === 'fulfilled') {
    downloads = {}
    for (const g of clicks.value.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? []) {
      const platform = g.dimensions.clientRequestPath.replace('/download/', '')
      downloads[platform] = (downloads[platform] ?? 0) + g.count
    }
  }
  return {
    visits: account ? (total?.sum.visits ?? 0) : null,
    pageviews: account ? (total?.count ?? 0) : null,
    referrers: rows(account?.referrers, 'refererHost'),
    countries: rows(account?.countries, 'countryName'),
    downloads,
  }
}

const botToken = env('METRICS_BOT_TOKEN')
const chatId = env('METRICS_CHAT_ID')

async function send(text: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  if (!res.ok) throw new Error(`Telegram ${res.status}`)
}

Deno.serve((req) => {
  const deps: DigestDeps = {
    now: Date.now(),
    claim: (day) => rpc<Totals | null>('metrics_claim', { p_day: day }),
    async release(day) {
      await db.from('metrics_runs').delete().eq('day', day)
    },
    saveTotals: (day, totals) => rpc('metrics_save_totals', { p_day: day, p_totals: totals }),
    day: (day) => rpc<DayStats>('metrics_day', { p_day: day }),
    cohorts: (day) => rpc<Cohort[]>('metrics_cohorts', { p_day: day }),
    downloads,
    site,
    lastTotals: () => rpc<Totals>('metrics_last_totals', {}),
    send: botToken && chatId ? send : null,
    chatId,
    webhookSecret: env('METRICS_WEBHOOK_SECRET'),
  }
  return handle(req, deps)
})
