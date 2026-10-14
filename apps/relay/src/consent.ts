import {
  CONSENT_MAX_READS,
  CONSENT_TTL_MS,
  type ConsentResult,
  parseConsentResult,
} from '@fixnote/core/remote-mcp'

/**
 * The connect handoff (docs/remote-mcp.md, "Connecting"): the FixNote app answers Supabase's OAuth
 * consent and leaves the redirect back to the AI app here; the connect page in the browser picks it
 * up once. One tiny Durable Object per authorization id (`ConsentHandoff`) holds only that redirect
 * and whether it was allowed, for at most `CONSENT_TTL_MS`, and forgets it on the first read.
 * Nothing else is stored: no account, no client, no device.
 *
 * Why handing out the redirect to whoever knows the id is harmless: the authorization id is an
 * unguessable handle that only the browser doing the connect has, and the code in the redirect is
 * useless without the PKCE verifier, which only the AI app that started the flow holds. The
 * redirect itself goes to the AI app's registered callback anyway.
 */

interface Stored {
  result: ConsentResult
  at: number
}

/** Where a handoff keeps its one value (the Durable Object's storage; a Map in tests). */
export interface ConsentStorage {
  get(): Promise<Stored | undefined>
  put(value: Stored): Promise<void>
  clear(): Promise<void>
}

export type TakeResult = ConsentResult | null | 'limit'

/** One handoff: the first answer wins, it is read once, and it expires. */
export class ConsentBox {
  private reads = 0
  constructor(
    private readonly store: ConsentStorage,
    private readonly now: () => number,
  ) {}

  /** The app's answer; 'exists' when one is already waiting (the first answer wins). */
  async put(result: ConsentResult): Promise<'ok' | 'exists'> {
    const old = await this.store.get()
    if (old && this.now() - old.at < CONSENT_TTL_MS) return 'exists'
    await this.store.put({ result, at: this.now() })
    return 'ok'
  }

  /** The page asks: the answer once (then it is gone), null while there is none. */
  async take(): Promise<TakeResult> {
    this.reads += 1
    if (this.reads > CONSENT_MAX_READS) return 'limit'
    const v = await this.store.get()
    if (!v) return null
    await this.store.clear()
    return this.now() - v.at < CONSENT_TTL_MS ? v.result : null
  }
}

/** What the Worker calls on a handoff's Durable Object. */
export interface ConsentStub {
  put(result: ConsentResult): Promise<'ok' | 'exists'>
  take(): Promise<TakeResult>
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

/** GET /consent/<id> (no auth: the id is the handle): `waiting`, or the answer once. */
export async function consentPoll(stub: ConsentStub, cors: Record<string, string>) {
  const r = await stub.take()
  if (r === 'limit') return json({ error: 'too_many_requests' }, 429, cors)
  if (!r) return json({ status: 'waiting' }, 200, cors)
  return json({ status: 'done', approved: r.approved, redirect: r.redirect }, 200, cors)
}

/** POST /api/consent/<id> (the app's own session, checked by the caller): leaves the answer. */
export async function consentPost(
  req: Request,
  stub: ConsentStub,
  cors: Record<string, string>,
): Promise<Response> {
  const body = await req.json().catch(() => null)
  const result = parseConsentResult(body)
  if (!result) return json({ error: 'bad_request' }, 400, cors)
  if ((await stub.put(result)) === 'exists') return json({ error: 'exists' }, 409, cors)
  return new Response(null, { status: 204, headers: cors })
}
