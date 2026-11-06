import type { Pairing } from './api'
import { APP_URL, FUNCTIONS_URL } from './config'

/**
 * Connecting like an AI app does (`*_extension_requests.sql`): ask, open FixNote with the
 * request's id, and wait until the person confirms there. The secret stays here; the token comes
 * back only to it.
 */

export interface ConnectRequest {
  id: string
  secret: string
  code: string
  label: string
  at: number
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'gone' }
  | { status: 'approved'; pairing: Pairing }

async function call(path: string, body: object) {
  const res = await fetch(`${FUNCTIONS_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { res, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

export async function startConnect(label: string): Promise<ConnectRequest> {
  const { res, data } = await call('request', { label })
  if (
    !res.ok ||
    typeof data.id !== 'string' ||
    typeof data.secret !== 'string' ||
    typeof data.code !== 'string'
  ) {
    throw new Error(typeof data.error === 'string' ? data.error : 'failed')
  }
  return { id: data.id, secret: data.secret, code: data.code, label, at: Date.now() }
}

export async function pollConnect(r: ConnectRequest): Promise<PollResult> {
  const { res, data } = await call('poll', { id: r.id, secret: r.secret })
  if (res.status === 404) return { status: 'gone' }
  if (!res.ok) throw new Error('failed')
  if (data.status === 'denied') return { status: 'denied' }
  if (
    data.status === 'approved' &&
    typeof data.token === 'string' &&
    typeof data.publicKey === 'string'
  ) {
    return {
      status: 'approved',
      pairing: {
        token: data.token,
        publicKey: data.publicKey,
        pro: data.pro === true,
        label: typeof data.label === 'string' && data.label ? data.label : r.label,
      },
    }
  }
  return { status: 'pending' }
}

/** Where the request is confirmed: the web app, or the desktop app through its link. */
export const webConnectUrl = (id: string) => `${APP_URL}/?extension=${encodeURIComponent(id)}`
export const desktopConnectUrl = (id: string) => `fixnote://extension?id=${encodeURIComponent(id)}`
