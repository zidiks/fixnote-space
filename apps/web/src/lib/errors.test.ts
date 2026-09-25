import { describe, expect, it } from 'vitest'
import { errorMessage, isServerOutdated, toError } from './errors'

describe('server errors', () => {
  it('turns Supabase error objects into readable Errors', () => {
    const missing = {
      code: 'PGRST205',
      message: "Could not find the table 'public.shares' in the schema cache",
      details: null,
      hint: null,
    }
    expect(errorMessage(missing)).toBe(missing.message)
    expect(toError(missing)).toBeInstanceOf(Error)
    expect(isServerOutdated(missing)).toBe(true)
    expect(isServerOutdated({ code: '23514', message: 'violates check constraint' })).toBe(false)
    expect(errorMessage(new Error('plain'))).toBe('plain')
    expect(errorMessage('text')).toBe('text')
  })
})
