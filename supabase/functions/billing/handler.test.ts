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
  const res = await handle(post({ plan: 'year' }), env, suby)
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

Deno.test('from the desktop app, the buyer comes back to the page that opens the app', async () => {
  const { suby, calls } = fakeSuby()
  const res = await handle(post({ plan: 'month', app: true }), env, suby)
  assertEquals(res.status, 200)
  const body = calls[0]?.body as { successUrl: string; cancelUrl: string }
  assertEquals(body.successUrl, 'https://app.fixnote.space/?billing=success&to=app')
  assertEquals(body.cancelUrl, 'https://app.fixnote.space/?billing=cancel&to=app')
})

Deno.test('needs a signed-in account, a known plan and the payment setup', async () => {
  const { suby } = fakeSuby()
  assertEquals((await handle(post({ plan: 'year' }, {}), env, suby)).status, 401)
  assertEquals((await handle(post({ plan: 'lifetime' }), env, suby)).status, 400)
  assertEquals((await handle(post({ plan: 'month' }), env, null)).status, 503)
  const noProducts = { ...env, products: { month: undefined, year: undefined } }
  assertEquals((await handle(post({ plan: 'month' }), noProducts, suby)).status, 503)
})

Deno.test('reads a subscription back, and nothing for an unknown one', async () => {
  const { suby } = fakeSuby()
  assertEquals((await suby.subscription('sub_1'))?.customer?.email, 'ann@x.io')
  assertEquals(await suby.subscription('sub_404'), null)
})
