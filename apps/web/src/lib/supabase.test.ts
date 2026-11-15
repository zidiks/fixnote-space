import { afterEach, describe, expect, it, vi } from 'vitest'
import { guardFetch, requireSession } from './supabase'

const ANON = 'anon-key'
const URL_BASE = 'https://x.supabase.co'

const call = (fetch: typeof globalThis.fetch, path: string, bearer: string | null) =>
  fetch(`${URL_BASE}${path}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}`, apikey: ANON } : { apikey: ANON },
  })

describe('guardFetch', () => {
  afterEach(() => requireSession(false))

  it('lets everything through while nobody is signed in', async () => {
    const base = vi.fn(async () => new Response('[]'))
    const fetch = guardFetch(base, ANON)
    await call(fetch, '/rest/v1/shared_note_members', ANON)
    expect(base).toHaveBeenCalledTimes(1)
  })

  it('refuses data requests without the account token while signed in, as offline', async () => {
    requireSession(true)
    const base = vi.fn(async () => new Response('[]'))
    const fetch = guardFetch(base, ANON)
    for (const path of [
      '/rest/v1/shared_note_members',
      '/storage/v1/object/x',
      '/functions/v1/llm-proxy',
    ])
      await expect(call(fetch, path, ANON)).rejects.toBeInstanceOf(TypeError)
    await expect(call(fetch, '/functions/v1/billing', null)).rejects.toThrow(/failed to fetch/i)
    expect(base).not.toHaveBeenCalled()
  })

  it('sends requests with the account token, and auth requests as they are', async () => {
    requireSession(true)
    const base = vi.fn(async () => new Response('[]'))
    const fetch = guardFetch(base, ANON)
    await call(fetch, '/rest/v1/notes', 'user-jwt')
    // Refreshing the token goes with the anon key, of course.
    await call(fetch, '/auth/v1/token?grant_type=refresh_token', ANON)
    expect(base).toHaveBeenCalledTimes(2)
  })
})
