import { describe, expect, it } from 'vitest'
import { billingLink } from './payment'

describe('billingLink', () => {
  it('reads the way back from the payment page', () => {
    expect(billingLink('fixnote://billing/success')).toBe('success')
    expect(billingLink('fixnote://billing/success/')).toBe('success')
    expect(billingLink('FIXNOTE://billing/cancel?x=1')).toBe('cancel')
  })

  it('ignores any other link', () => {
    expect(billingLink('fixnote://billing/refund')).toBeNull()
    expect(billingLink('fixnote://notes/success')).toBeNull()
    expect(billingLink('https://billing/success')).toBeNull()
    expect(billingLink('fixnote://billing/success.evil')).toBeNull()
  })
})
