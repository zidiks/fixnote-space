import { assertEquals } from 'jsr:@std/assert@1'
import { handle, type ReviewDeps } from './handler.ts'

const post = (body: unknown) =>
  new Request('http://fn/review-login', { method: 'POST', body: JSON.stringify(body) })

const deps = (over: Partial<ReviewDeps> = {}): ReviewDeps => ({
  accounts: ['review@fixnote.space'],
  code: '4815162342',
  tokenHash: async (email) => `hash-for-${email}`,
  perMinute: 10,
  now: () => 1_000,
  ...over,
})

Deno.test('the right code for a review account gives a token hash', async () => {
  const res = await handle(post({ email: ' Review@Fixnote.space ', code: '4815162342' }), deps())
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { token_hash: 'hash-for-review@fixnote.space' })
})

Deno.test('a wrong code or another account is refused the same way', async () => {
  const wrong = await handle(post({ email: 'review@fixnote.space', code: '4815162343' }), deps())
  assertEquals(wrong.status, 401)
  const other = await handle(post({ email: 'someone@example.com', code: '4815162342' }), deps())
  assertEquals(other.status, 401)
})

Deno.test('without both secrets nothing signs in', async () => {
  const noCode = await handle(post({ email: 'review@fixnote.space', code: '' }), deps({ code: '' }))
  assertEquals(noCode.status, 404)
  const short = await handle(
    post({ email: 'review@fixnote.space', code: '123456' }),
    deps({ code: '123456' }),
  )
  assertEquals(short.status, 404)
  const noAccounts = await handle(
    post({ email: 'x@y.z', code: '4815162342' }),
    deps({ accounts: [] }),
  )
  assertEquals(noAccounts.status, 404)
})

Deno.test('guessing is slowed down', async () => {
  const d = deps({ now: () => 99_000_000 })
  let last = 0
  for (let i = 0; i < 12; i++) {
    last = (await handle(post({ email: 'slow@fixnote.space', code: `1000000${i}0` }), d)).status
  }
  assertEquals(last, 429)
})
