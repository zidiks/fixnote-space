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
  const call = async <T>(path: string, body: Record<string, unknown>): Promise<T | null> => {
    const res = await fetcher(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-PUBLIC-KEY': publicKey,
      },
      body: JSON.stringify({ ...body, public_key: publicKey }),
    })
    const answer = (await res.json().catch(() => null)) as {
      success?: boolean
      data?: T
      error?: unknown
    } | null
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
    return answer.data ?? null
  }
  return {
    async createCustomer({ name, email }) {
      const data = await call<{ uuid?: string }>('/customers', { name, email })
      if (!data?.uuid) throw new Error('ListoPays: no customer uuid')
      return data.uuid
    },
    async createPayment({ customer, order, amount, currency }) {
      const data = await call<{ url?: string }>('/payments', { customer, order, amount, currency })
      if (!data?.url) throw new Error('ListoPays: no payment URL')
      return data.url
    },
  }
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
