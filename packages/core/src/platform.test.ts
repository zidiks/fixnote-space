import { describe, expect, it } from 'vitest'
import { NotImplementedError } from './platform'

describe('NotImplementedError', () => {
  it('names the feature and milestone', () => {
    const err = new NotImplementedError('SqlDriver', 'M1')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('NotImplementedError')
    expect(err.message).toBe('SqlDriver is not implemented yet (planned for M1)')
  })
})
