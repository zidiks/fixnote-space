import { assertEquals } from 'jsr:@std/assert@1'
import { subyApi } from '../_shared/suby.ts'
import { type BillingEnv, handle } from './handler.ts'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const token = (claims: object) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`
const signedIn = {
  Authorization: `Bearer ${token({ sub: 'user-1', email: 'ann@x.io', role: 'authenticated' })}`,
}
const env: BillingEnv = {
  products: { month: 'pro_month', year: 'pro_year' },
  noTrial: { month: 'pro_month_nt', year: 'pro_year_nt' },
  returnUrl: 'https://app.fixnote.space/',
}
const post = (body: unknown, headers: Record<string, string> = signedIn) =>
  new Request('http://fn/billing', { method: 'POST', headers, body: JSON.stringify(body) })

/** Suby's API as it answers, recording what it was asked. */
function fakeSuby() {
  const calls: { url: string; key: string | null; body: unknown }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    calls.push({
      url,
      key: new Headers(init?.headers).get('x-suby-api-key'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })
    if (url.endsWith('/v3/checkout/sessions')) {
      return Response.json(
        { success: true, data: { url: 'https://pay.suby.fi/cs_1' } },
        { status: 201 },
      )
    }
    if (url.includes('/v3/subscriptions/sub_1')) {
      return Response.json({
        success: true,
        data: {
          subscription: { id: 'sub_1', status: 'ACTIVE', customer: { email: 'ann@x.io' } },
          scheduledChange: null,
        },
      })
    }
    return Response.json({ success: false, error: { message: 'not found' } }, { status: 404 })
  }
  return { suby: subyApi('sk_sandbox_x', fetcher, 'https://api.test'), calls }
}

Deno.test('opens a Suby checkout for the plan, with the account email and id', async () => {
  const { suby, calls } = fakeSuby()
  const res = await handle(post({ plan: 'year' }), env, suby, async () => false)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { url: 'https://pay.suby.fi/cs_1' })
  assertEquals(calls[0]?.key, 'sk_sandbox_x')
  assertEquals(calls[0]?.body, {
    mode: 'subscription',
    productId: 'pro_year',
    customer: { email: 'ann@x.io' },
    metadata: { user_id: 'user-1' },
    successUrl: 'https://app.fixnote.space/?billing=success',
    cancelUrl: 'https://app.fixnote.space/?billing=cancel',
  })
})

const never = async () => false

Deno.test('a second subscription gets the product without the trial', async () => {
  const { suby, calls } = fakeSuby()
  await handle(post({ plan: 'month' }), env, suby, async () => true)
  assertEquals((calls[0]?.body as { productId?: string } | undefined)?.productId, 'pro_month_nt')
  // Without trial-free products configured, the trial ones are used (Suby has the last word).
  await handle(
    post({ plan: 'month' }),
    { ...env, noTrial: { month: undefined, year: undefined } },
    suby,
    async () => true,
  )
  assertEquals((calls[1]?.body as { productId?: string } | undefined)?.productId, 'pro_month')
})

Deno.test('needs a signed-in account, a known plan and the payment setup', async () => {
  const { suby } = fakeSuby()
  assertEquals((await handle(post({ plan: 'year' }, {}), env, suby, never)).status, 401)
  assertEquals((await handle(post({ plan: 'lifetime' }), env, suby, never)).status, 400)
  assertEquals((await handle(post({ plan: 'month' }), env, null, never)).status, 503)
  const noProducts = {
    ...env,
    products: { month: undefined, year: undefined },
    noTrial: { month: undefined, year: undefined },
  }
  assertEquals((await handle(post({ plan: 'month' }), noProducts, suby, never)).status, 503)
})

Deno.test('reads a subscription back, and nothing for an unknown one', async () => {
  const { suby } = fakeSuby()
  assertEquals((await suby.subscription('sub_1'))?.customer?.email, 'ann@x.io')
  assertEquals(await suby.subscription('sub_404'), null)
})
