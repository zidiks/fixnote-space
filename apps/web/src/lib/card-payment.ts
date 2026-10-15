import { create } from 'zustand'
import { billingApi, refreshPlan, runSync, useAccount } from './account/account'
import type { BillingPlan } from './billing'
import { type SavedCardOrder, saveCardOrder, savedCardOrder } from './card-order'
import { usePlan } from './plan'

/**
 * Paying by card (ListoPays, supabase/functions/billing `card-checkout`). ListoPays' return pages
 * are the same for everyone, so they cannot tell whose payment it was: the device that opened the
 * payment page asks our server about its order (`order-status`) until it is paid, and
 * `CardPaymentDialog` shows the wait, then the welcome. The order is kept on the device, so a
 * reload or coming back to the app later still finishes it.
 */

export type CardPhase = 'waiting' | 'paid' | 'expired' | 'failed'

interface CardPaymentState {
  open: boolean
  order: SavedCardOrder | null
  phase: CardPhase
  /** Paid: Pro until then. */
  until: number | null
}

export const useCardPayment = create<CardPaymentState>()(() => ({
  open: false,
  order: savedCardOrder(),
  phase: 'waiting',
  until: null,
}))

/** Opens an order and its payment page (in the browser); the dialog waits for it. */
export async function startCardPayment(plan: BillingPlan, open: (url: string) => Promise<void>) {
  const api = billingApi()
  if (!api) throw new Error('Sign in first')
  const extended = usePlan.getState().info?.status === 'prepaid'
  const { url, order } = await api.cardCheckout(plan)
  const saved: SavedCardOrder = { order, plan, url, startedAt: Date.now(), extended }
  saveCardOrder(saved)
  useCardPayment.setState({ open: true, order: saved, phase: 'waiting', until: null })
  // A blocked pop-up is fine: the dialog has the button to open the page.
  await open(url).catch(() => undefined)
}

let checking: Promise<CardPhase> | null = null

/** Asks the server about the order once; paid turns Pro on here. */
export function checkCardPayment(): Promise<CardPhase> {
  const { order, phase } = useCardPayment.getState()
  const api = billingApi()
  if (!order || !api || phase !== 'waiting') return Promise.resolve(phase)
  checking ??= api
    .orderStatus(order.order)
    .then(async (s) => {
      if (s.status === 'pending') return 'waiting' as const
      saveCardOrder(null)
      const until = s.periodEnd ? Date.parse(s.periodEnd) : null
      useCardPayment.setState({ phase: s.status, until })
      if (s.status === 'paid') {
        await refreshPlan(true)
        void runSync()
      }
      return s.status
    })
    .catch(() => 'waiting' as const)
    .finally(() => {
      checking = null
    })
  return checking
}

export function showCardPayment() {
  useCardPayment.setState({ open: true })
}

export function closeCardPayment() {
  const { phase } = useCardPayment.getState()
  // Still waiting: the order stays, and coming back to the app asks again.
  if (phase === 'waiting') useCardPayment.setState({ open: false })
  else useCardPayment.setState({ open: false, order: null, phase: 'waiting', until: null })
}

/** The payment page again (closed by mistake, or the pop-up was blocked). */
export const cardPaymentUrl = () => useCardPayment.getState().order?.url ?? null

// The order belongs to the account that opened it: signing out forgets it.
useAccount.subscribe((s, prev) => {
  if (s.phase !== 'signed-out' || prev.phase === 'signed-out') return
  saveCardOrder(null)
  useCardPayment.setState({ open: false, order: null, phase: 'waiting', until: null })
})

// Back to the app with an order still open (paid in the browser meanwhile): ask, and once it is
// paid the welcome shows by itself.
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    const s = useCardPayment.getState()
    if (!s.order || s.phase !== 'waiting') return
    void checkCardPayment().then((phase) => {
      if (phase === 'paid') showCardPayment()
    })
  })
}
