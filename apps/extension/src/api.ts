import sodium from 'libsodium-wrappers'
import { FUNCTIONS_URL } from './config'

/**
 * The extension's side of functions/capture-extension. Pages are sealed here, in the browser, to
 * the account's public key (crypto_box_seal), exactly as CapturePayload in
 * packages/core/src/capture expects; the server stores what it cannot read.
 */

export interface Pairing {
  token: string
  publicKey: string
  pro: boolean
  label: string
}

export interface LinkPayload {
  url: string
  title?: string
  description?: string
  site?: string
  text?: string
  selection?: string
  /** Saved with a social network's own Save button: `x`, `reddit`… */
  source?: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

async function post(path: string, body: object, token?: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${FUNCTIONS_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-fixnote-token': token } : {}) },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok)
    throw new ApiError(res.status, typeof data.error === 'string' ? data.error : 'failed')
  return data
}

export async function refreshKey(p: Pairing): Promise<Pairing> {
  const data = await post('key', {}, p.token)
  return {
    ...p,
    publicKey: typeof data.publicKey === 'string' ? data.publicKey : p.publicKey,
    pro: data.pro === true,
  }
}

export async function unpair(p: Pairing): Promise<void> {
  await post('unpair', {}, p.token).catch(() => undefined)
}

/** The JSON a device opens: CapturePayload of kind `link`. */
export function linkPayload(link: LinkPayload, receivedAt: number): string {
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(link)) if (typeof v === 'string' && v.trim()) clean[k] = v
  return JSON.stringify({ v: 1, kind: 'link', receivedAt, ...clean })
}

export async function seal(publicKey: string, message: string): Promise<string> {
  await sodium.ready
  const v = sodium.base64_variants.URLSAFE_NO_PADDING
  return sodium.to_base64(
    sodium.crypto_box_seal(sodium.from_string(message), sodium.from_base64(publicKey, v)),
    v,
  )
}

export async function saveLink(p: Pairing, link: LinkPayload): Promise<void> {
  const sealed = await seal(p.publicKey, linkPayload(link, Date.now()))
  await post('save', { sealed }, p.token)
}
