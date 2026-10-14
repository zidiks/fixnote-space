import { type ConsentResult, parseConsentResult, redirectHost } from '@fixnote/core'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase Auth's OAuth consent, as one signed-in session sees it (docs/remote-mcp.md,
 * "Connecting"). Used by the connect page (a session that lives only in that tab, or the web app's)
 * and by the FixNote app when `fixnote://connect` asks it.
 */

/** What the person sees before allowing an AI app in. */
export interface ConsentDetails {
  client: {
    id: string
    name: string
    /** Host of the app's own site, when it registered one. */
    site: string
    /** The app's logo (https only), or ''. */
    logo: string
  }
  /** Where the browser goes back to: a look-alike name is not enough to trust. */
  redirectHost: string
  /** The FixNote account that would be connected. */
  email: string
}

export type Authorization =
  | { kind: 'ask'; details: ConsentDetails }
  /** Allowed before: Supabase already made the redirect with a code. */
  | { kind: 'allowed'; redirect: string }

export interface ConsentAuth {
  /** The pending request; null when it expired, was answered, or is not this account's. */
  authorization(id: string): Promise<Authorization | null>
  /** Allow or deny; the redirect back to the AI app, or null when Supabase refused. */
  decide(id: string, allow: boolean): Promise<string | null>
  /** Whether the account may use remote access now (Pro). */
  pro(): Promise<boolean>
}

const httpsOnly = (uri: string | undefined) => (uri && /^https:\/\//i.test(uri) ? uri : '')

export function supabaseConsent(client: SupabaseClient): ConsentAuth {
  return {
    async authorization(id) {
      const { data, error } = await client.auth.oauth.getAuthorizationDetails(id)
      if (error || !data) return null
      if (!('authorization_id' in data)) return { kind: 'allowed', redirect: data.redirect_url }
      return {
        kind: 'ask',
        details: {
          client: {
            id: data.client.id,
            name: data.client.name || data.client.id,
            site: data.client.uri ? redirectHost(data.client.uri) : '',
            logo: httpsOnly(data.client.logo_uri),
          },
          redirectHost: redirectHost(data.redirect_uri),
          email: data.user.email,
        },
      }
    },
    async decide(id, allow) {
      const opts = { skipBrowserRedirect: true }
      const res = allow
        ? await client.auth.oauth.approveAuthorization(id, opts)
        : await client.auth.oauth.denyAuthorization(id, opts)
      return res.error || !res.data ? null : res.data.redirect_url
    },
    async pro() {
      const { data } = await client.rpc('remote_mcp_allowed')
      return data === true
    },
  }
}

/** The page's side of the relay handoff: `GET /consent/<id>`. */
export type PollAnswer = 'waiting' | ConsentResult

export async function pollRelay(relayUrl: string, id: string): Promise<PollAnswer> {
  const res = await fetch(`${relayUrl.replace(/\/+$/, '')}/consent/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`relay ${res.status}`)
  const body = (await res.json()) as { status?: unknown }
  if (body.status !== 'done') return 'waiting'
  const result = parseConsentResult(body)
  if (!result) throw new Error('relay answer')
  return result
}

/** The app's side: `POST /api/consent/<id>` with its own session. */
export async function postToRelay(
  relayUrl: string,
  token: string,
  id: string,
  result: ConsentResult,
): Promise<void> {
  const res = await fetch(`${relayUrl.replace(/\/+$/, '')}/api/consent/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  })
  // 409: an answer is already waiting (a second click), which is the same outcome.
  if (!res.ok && res.status !== 409) throw new Error(`relay ${res.status}`)
}
