import { create } from 'zustand'
import type { RemoteMcpApi } from './api'
import type { ConsentDetails } from './consent'

/**
 * `fixnote://connect?authorization_id=…`: the connect page in the browser asks this app to let an
 * AI app in (docs/remote-mcp.md, "Connecting"). Any page can open such a link, so it only ever
 * opens `ConnectDialog`, which shows the client and where the browser goes back to, and always
 * asks. The answer goes to Supabase with this app's own session and the redirect to the relay,
 * where the page picks it up.
 */
export const useConnectRequest = create<{ id: string | null; at: number }>(() => ({
  id: null,
  at: 0,
}))

export const askToConnect = (id: string) => useConnectRequest.setState({ id, at: Date.now() })
export const closeConnect = () => useConnectRequest.setState({ id: null })

export type ConnectDialogState =
  | { kind: 'loading' }
  /** No session here (signed out, no server, or "Only on this device"). */
  | { kind: 'signed-out'; reason: 'signed-out' | 'local-only' }
  | { kind: 'ask'; details: ConsentDetails; pro: boolean }
  /** Allowed before: Supabase already answered; continuing only hands the redirect over. */
  | { kind: 'again'; redirect: string }
  | { kind: 'invalid' }

/** What the dialog shows for a request. */
export async function loadConnect(
  api: RemoteMcpApi | null,
  id: string,
  opts: { localOnly: boolean },
): Promise<ConnectDialogState> {
  if (opts.localOnly) return { kind: 'signed-out', reason: 'local-only' }
  if (!api || !(await api.token().catch(() => null))) {
    return { kind: 'signed-out', reason: 'signed-out' }
  }
  const auth = await api.consent.authorization(id).catch(() => null)
  if (!auth) return { kind: 'invalid' }
  if (auth.kind === 'allowed') return { kind: 'again', redirect: auth.redirect }
  return { kind: 'ask', details: auth.details, pro: await api.consent.pro().catch(() => false) }
}

/**
 * Allow or deny. Supabase first (with this app's session), then the relay, so the page in the
 * browser can go back to the AI app. 'failed': Supabase refused (expired, answered elsewhere);
 * 'unsent': answered, but the page could not be told (it then times out and offers to try again).
 */
export async function answerConnect(
  api: RemoteMcpApi,
  id: string,
  state: ConnectDialogState,
  allow: boolean,
): Promise<'done' | 'failed' | 'unsent'> {
  let redirect: string | null
  if (state.kind === 'ask') {
    redirect = await api.consent.decide(id, allow).catch(() => null)
    if (!redirect) return 'failed'
  } else if (state.kind === 'again') {
    redirect = allow ? state.redirect : null
  } else {
    return 'failed'
  }
  try {
    await api.handoff(id, { approved: allow, redirect })
    return 'done'
  } catch {
    return 'unsent'
  }
}
