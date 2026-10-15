/**
 * The card payment this browser or app is waiting for (lib/card-payment.ts), kept on the device so
 * a reload, or the page ListoPays sends the buyer back to (`PaidPage`), knows about it. No imports:
 * `PaidPage` reads it without the app.
 */

export interface SavedCardOrder {
  order: string
  plan: 'month' | 'year'
  url: string
  startedAt: number
  /** Paid ahead while Pro was already paid by card. */
  extended: boolean
}

const KEY = 'fixnote.card-order'
/** ListoPays' page is not kept open for long; an order older than this is forgotten. */
export const CARD_ORDER_FOR = 3 * 3_600_000

export function savedCardOrder(): SavedCardOrder | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedCardOrder | null
    return o && Date.now() - o.startedAt < CARD_ORDER_FOR ? o : null
  } catch {
    return null
  }
}

export function saveCardOrder(o: SavedCardOrder | null) {
  try {
    if (o) localStorage.setItem(KEY, JSON.stringify(o))
    else localStorage.removeItem(KEY)
  } catch {
    // Private window: remembered while the app is open.
  }
}
