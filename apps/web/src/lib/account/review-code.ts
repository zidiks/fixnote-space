import type { Session, SupabaseClient } from '@supabase/supabase-js'

/**
 * A reviewer account's fixed code: 8–10 digits, never the 6 of an emailed code. The accounts and
 * the code are secrets of the `review-login` function (docs/mcp-directories.md, "Reviewer account").
 */
export const isReviewCode = (code: string) => /^\d{8,10}$/.test(code)

/**
 * Signs `client` in with the code from the sign-in email or, for the accounts app reviewers use
 * (OpenAI, Anthropic, store reviewers cannot read our mailbox), their fixed code. Throws when
 * neither works.
 */
export async function verifySignInCode(
  client: SupabaseClient,
  email: string,
  code: string,
): Promise<Session> {
  let result: Awaited<ReturnType<SupabaseClient['auth']['verifyOtp']>>
  if (isReviewCode(code)) {
    const { data, error } = await client.functions.invoke<{ token_hash?: string }>('review-login', {
      body: { email, code },
    })
    if (error || !data?.token_hash) throw error ?? new Error('Invalid code')
    result = await client.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' })
  } else {
    result = await client.auth.verifyOtp({ email, token: code, type: 'email' })
  }
  if (result.error || !result.data.session) throw result.error ?? new Error('No session')
  return result.data.session
}
