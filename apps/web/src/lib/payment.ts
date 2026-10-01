import { create } from 'zustand'
import { usePlan } from './plan'

/**
 * After paying for Pro. The payment page opens in the browser; Suby sends the buyer back to the
 * web app (`?billing=success`) or, when bought in the desktop app, to a page that opens the app
 * with `fixnote://billing/success` (`PaidPage`), so the web app and the desktop app never both
 * claim the same payment. The device that started it shows `PaymentDialog`: "checking" until the
 * server has the subscription, then the welcome. A return this device did not start (an old link,
 * a link from some other page) only reads the plan again.
 */

const STARTED_KEY = 'fixnote.payment-started'
/** Crypto payments take a while to confirm; a payment started longer ago is forgotten. */
const PENDING_FOR = 2 * 3_600_000

let startedAt = (() => {
  try {
    return Number(localStorage.getItem(STARTED_KEY) ?? 0)
  } catch {
    return 0
  }
})()

function keep(at: number) {
  startedAt = at
  try {
    if (at) localStorage.setItem(STARTED_KEY, String(at))
    else localStorage.removeItem(STARTED_KEY)
  } catch {
    // Private window: remembered while the app is open.
  }
}

/** The payment page was opened from here. */
export const paymentStarted = () => keep(Date.now())

/** A payment from this device that may still come through. */
export const paymentPending = () => Date.now() - startedAt < PENDING_FOR

/** Paid: the subscription is on (a trial is Pro too, but not paid). */
export const paid = () => usePlan.getState().info?.status === 'active'

export const usePayment = create<{ open: boolean }>()(() => ({ open: false }))

export const showPaymentDialog = () => usePayment.setState({ open: true })

export function closePaymentDialog() {
  usePayment.setState({ open: false })
  // Closed while still checking: the welcome comes by itself once Pro is on.
  if (paid()) keep(0)
}

// Pro came on while a payment from here was pending (the app came back to the front, or the link
// back to the app was never followed): the welcome shows by itself.
usePlan.subscribe((s, prev) => {
  if (s.info?.status === 'active' && prev.info?.status !== 'active' && paymentPending()) {
    showPaymentDialog()
  }
})

/** `fixnote://billing/success` (or `/cancel`), the way back from the payment page to the app. */
export function billingLink(url: string): 'success' | 'cancel' | null {
  const m = /^fixnote:\/\/billing\/(success|cancel)\/?(?:[?#].*)?$/i.exec(url.trim())
  return m ? (m[1]?.toLowerCase() as 'success' | 'cancel') : null
}
