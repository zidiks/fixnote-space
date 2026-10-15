/**
 * ListoPays (https://docs.listopays.com): card payments for FixNote Pro, next to Suby (crypto).
 * ListoPays has no subscriptions, so a card payment buys a prepaid period (a month or a year) and
 * nothing is charged again by itself. The Website Public Key opens payment pages; the Website
 * Private Key comes back in each webhook (no signature), so it stays in the edge functions'
 * secrets and is compared in constant time. Neither key ever reaches the app or the repository.
 *
 * Not settled by the docs, so handled both ways: the public key goes in the `X-PUBLIC-KEY` header
 * and in the body; `currency` is optional there and is always sent.
 */

export const LISTOPAYS_API = 'https://api.listopays.com'

export type CardPlan = 'month' | 'year'

/** What a prepaid period costs by card: the same prices as the Suby subscription. */
export const CARD_PRICES: Record<CardPlan, { amount: number; currency: 'USD' }> = {
  month: { amount: 7, currency: 'USD' },
  year: { amount: 60, currency: 'USD' },
}

export interface ListoPays {
  /** A customer for the account; returns its uuid. */
  createCustomer(req: { name: string; email: string }): Promise<string>
  /** A hosted payment page for one order; returns its URL. */
  createPayment(req: {
    customer: string
    order: string
    amount: number
    currency: 'USD' | 'EUR' | 'GBP'
  }): Promise<string>
}

export function listoPaysApi(
  publicKey: string,
  fetcher: typeof fetch = fetch,
  base = LISTOPAYS_API,
): ListoPays {
  const call = async (path: string, body: Record<string, unknown>): Promise<Answer> => {
    const res = await fetcher(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-PUBLIC-KEY': publicKey,
      },
      body: JSON.stringify({ ...body, public_key: publicKey }),
    })
    const answer = (await res.json().catch(() => null)) as Answer | null
    if (!res.ok || !answer?.success) {
      const error = answer?.error
      const message =
        typeof error === 'string'
          ? error
          : error && typeof error === 'object' && 'message' in error
            ? String((error as { message: unknown }).message)
            : 'request failed'
      throw new Error(`ListoPays ${res.status}: ${message}`)
    }
    return answer
  }
  return {
    async createCustomer({ name, email }) {
      // ListoPays wants a name of at least 3 characters.
      const answer = await call('/customers', { name: name.length >= 3 ? name : email, email })
      const uuid = pick(answer, ['uuid', 'id', 'customer_uuid', 'customer_id', 'customer'])
      if (!uuid) throw new Error(`ListoPays: no customer uuid in ${shape(answer)}`)
      return uuid
    },
    async createPayment({ customer, order, amount, currency }) {
      const answer = await call('/payments', { customer, order, amount, currency })
      const url = pick(answer, ['url', 'payment_url', 'link', 'redirect_url', 'checkout_url'])
      if (!url) throw new Error(`ListoPays: no payment URL in ${shape(answer)}`)
      return url
    },
  }
}

/** A successful answer: the docs put the result in `data`, but the live API may not. */
type Answer = { success?: boolean; error?: unknown; data?: unknown; [key: string]: unknown }

/**
 * The first string found under one of `keys`: in `data` (an object, or `data` itself when it is a
 * string, or `data.customer`/`data.payment`), then at the top level.
 */
export function pick(answer: Answer, keys: string[]): string | null {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const from = (o: unknown): string | null => {
    if (!o || typeof o !== 'object') return null
    for (const k of keys) {
      const v = (o as Record<string, unknown>)[k]
      if (str(v)) return v as string
      if (v && typeof v === 'object') {
        const inner = from(v)
        if (inner) return inner
      }
    }
    return null
  }
  return str(answer.data) ?? from(answer.data) ?? from(answer)
}

/** The answer's structure without its values, for the log (no keys or personal data). */
export function shape(v: unknown, depth = 0): string {
  if (Array.isArray(v)) return `[${v.length ? shape(v[0], depth + 1) : ''}]`
  if (v && typeof v === 'object') {
    if (depth > 2) return '{…}'
    return `{${Object.entries(v)
      .map(([k, x]) => `${k}:${shape(x, depth + 1)}`)
      .join(',')}}`
  }
  return typeof v
}

/** Constant time: the same length and every character compared. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** A one-page PDF receipt (ListoPays has no receipts of its own); ASCII lines, Helvetica. */
export function receiptPdf(lines: string[]): Uint8Array {
  const esc = (s: string) =>
    s
      .replace(/[^\x20-\x7e]/g, '?')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
  const text = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 22} Td (${esc(line)}) Tj ET`)
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
