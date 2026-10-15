import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { CreditCard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { devCardPaid } from '../lib/account/dev-plan'
import { money } from '../lib/billing'
import { ART } from './pro-look'

/**
 * `?dev-backend&dev-card=<order>`: ListoPays' payment page, faked so the card flow can be tried end
 * to end. "Pay" is the webhook (`devCardPaid`) followed by ListoPays' static Success URL
 * (`?billing=success&via=card`); leaving goes to its Fail URL.
 */
export function DevCardPage({ order }: { order: string }) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    document.documentElement.classList.toggle('dark', dark.matches)
    document.title = 'ListoPays (test)'
  }, [])

  const plan = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('fixnote.dev-plan') ?? '{}') as {
        cardOrders?: { id: string; plan: 'month' | 'year' }[]
      }
      return s.cardOrders?.find((o) => o.id === order)?.plan ?? 'month'
    } catch {
      return 'month'
    }
  })()
  const price = money(plan === 'year' ? 6000 : 700, 'USD', i18n.resolvedLanguage)
  const back = (result: 'success' | 'cancel') => {
    location.href = `/?dev-backend&billing=${result}&via=card`
  }

  return (
    <div className="grid min-h-full place-items-center bg-background p-4 text-foreground">
      <main className="w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-float">
        <div className="h-16" style={ART} aria-hidden />
        <div className="space-y-3 px-6 pt-5 pb-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <CreditCard className="size-5 text-muted-foreground" />
            {t('plan.devCardTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {plan === 'year' ? t('plan.planYearly') : t('plan.planMonthly')} · {price}
          </p>
          <Button
            className="w-full"
            loading={busy}
            onClick={() => {
              setBusy(true)
              // A moment, like a real payment.
              setTimeout(() => {
                devCardPaid(order)
                back('success')
              }, 1200)
            }}
          >
            {t('plan.devCardPay', { price })}
          </Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={() => back('cancel')}>
            {t('plan.devCardLeave')}
          </Button>
        </div>
      </main>
    </div>
  )
}
