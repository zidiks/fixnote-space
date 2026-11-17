import { describe, expect, it } from 'vitest'
import { isReviewCode } from './review-code'

describe('isReviewCode', () => {
  it('tells a reviewer code from the emailed one', () => {
    expect(isReviewCode('4815162342')).toBe(true)
    expect(isReviewCode('48151623')).toBe(true)
    expect(isReviewCode('123456')).toBe(false)
    expect(isReviewCode('1234567')).toBe(false)
    expect(isReviewCode('12345678901')).toBe(false)
    expect(isReviewCode('48151623ab')).toBe(false)
  })
})
