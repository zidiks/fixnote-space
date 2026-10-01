import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Spinner } from '@fixnote/ui'
import { Check, Sparkles } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { refreshPlan } from '../lib/account/account'
import { closePaymentDialog, usePayment } from '../lib/payment'
import { usePlan } from '../lib/plan'
import { ART, PRO_BENEFITS } from './pro-look'

/** After this long the dialog says the payment is still being confirmed, and that it can close. */
const LATE_MS = 2 * 60_000
/** Asked often at first (most payments land within a minute), then now and then. */
const FAST_MS = 4000
const SLOW_MS = 15_000
const STOP_MS = 30 * 60_000

/** Specks that fly out of the badge once Pro is on (hidden with reduced motion). */
const BURST = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (i % 2 ? 0.2 : 0)
  const reach = 70 + (i % 3) * 22
  return {
    '--dx': `${Math.round(Math.cos(angle) * reach)}px`,
    '--dy': `${Math.round(Math.sin(angle) * reach)}px`,
    '--r': `${(i % 4) * 90 + 45}deg`,
    animationDelay: `${(i % 3) * 60}ms`,
    background:
      i % 3 === 0
        ? 'var(--color-brand)'
        : i % 3 === 1
          ? 'color-mix(in oklch, var(--color-brand) 55%, white)'
          : 'color-mix(in oklch, var(--color-brand) 70%, black)',
    borderRadius: i % 2 ? '9999px' : '2px',
  } as CSSProperties
})

/**
 * Back from paying (lib/payment.ts): "checking the payment" until the server has the
 * subscription (a crypto payment is confirmed by its network first), then the welcome to Pro.
 */
export function PaymentDialog() {
  const { t, i18n } = useTranslation()
  const open = usePayment((s) => s.open)
  const info = usePlan((s) => s.info)
  const done = info?.status === 'active'
  const [late, setLate] = useState(false)

  useEffect(() => {
    if (!open || done) return
    setLate(false)
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout>
    const ask = () => {
      const waited = Date.now() - started
      if (waited > LATE_MS) setLate(true)
      if (waited > STOP_MS) return
      timer = setTimeout(
        () => {
          void refreshPlan(true)
          ask()
        },
        waited < 60_000 ? FAST_MS : SLOW_MS,
      )
    }
    ask()
    return () => clearTimeout(timer)
  }, [open, done])

  const until = info?.periodEnd
    ? new Date(info.periodEnd)
        .toLocaleDateString(i18n.resolvedLanguage, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
        // "31 октября 2026 г." ends with a dot already, and so does the sentence.
        .replace(/\.$/, '')
    : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closePaymentDialog()}>
      <DialogContent className="top-[10%] max-w-md overflow-hidden p-0">
        {done ? (
          <>
            <div className="relative h-32" style={ART}>
              <div className="absolute -bottom-8 left-6">
                <div
                  className="pro-burst pointer-events-none absolute top-1/2 left-1/2"
                  aria-hidden
                >
                  {BURST.map((style, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of specks
                    <span key={i} style={style} />
                  ))}
                </div>
                <div className="relative grid size-16 place-items-center rounded-full border bg-card text-brand shadow-float animate-in zoom-in-50 duration-500">
                  <Sparkles className="size-7" />
                </div>
              </div>
            </div>
            <div className="space-y-4 px-6 pt-11 pb-6">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-semibold">
                  {t('plan.welcomeTitle')}
                </DialogTitle>
                <DialogDescription className="text-sm">{t('plan.welcomeBody')}</DialogDescription>
              </div>
              <ul className="space-y-2 text-sm">
                {PRO_BENEFITS.map((key, i) => (
                  <li
                    key={key}
                    className="flex gap-2.5 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both"
                    style={{ animationDelay: `${150 + i * 60}ms` }}
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                    {t(key)}
                  </li>
                ))}
              </ul>
              {until ? (
                // Paid in crypto: Suby does not renew by itself, it emails a link (README → Suby).
                <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {t('plan.paidUntil', { date: until })} {t('plan.renewHint')}
                </p>
              ) : null}
              <Button className="w-full" onClick={closePaymentDialog}>
                {t('plan.great')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="h-20" style={ART} aria-hidden />
            <div className="space-y-3 px-6 pt-5 pb-6">
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                <Spinner className="size-4 text-muted-foreground" />
                {t('plan.checkingTitle')}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {late ? t('plan.checkingLate') : t('plan.checkingBody')}
              </DialogDescription>
              <div className="flex justify-end pt-2">
                <Button variant={late ? 'default' : 'ghost'} onClick={closePaymentDialog}>
                  {t('window.close')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
