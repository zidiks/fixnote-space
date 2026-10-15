import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Spinner } from '@fixnote/ui'
import { Check, CircleX, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAccount } from '../lib/account/account'
import {
  cardPaymentUrl,
  checkCardPayment,
  closeCardPayment,
  showCardPayment,
  startCardPayment,
  useCardPayment,
} from '../lib/card-payment'
import { usePlatform } from '../lib/platform'
import { ART, PRO_BENEFITS } from './pro-look'

/** Asked often at first (most card payments land within a minute), then now and then. */
const FAST_MS = 4000
const SLOW_MS = 15_000
const LATE_MS = 3 * 60_000
const STOP_MS = 30 * 60_000

/**
 * A card payment (lib/card-payment.ts): waits for the order while the person pays on ListoPays'
 * page in the browser, then the welcome to Pro (or "extended" when it was paid ahead). The page
 * can be opened again, and "I've paid" asks right away.
 */
export function CardPaymentDialog() {
  const { t, i18n } = useTranslation()
  const platform = usePlatform()
  const phase = useAccount((s) => s.phase)
  const { open, order, phase: state, until } = useCardPayment()
  const [late, setLate] = useState(false)
  const [busy, setBusy] = useState<'check' | 'retry' | null>(null)

  // An order left open from before (a reload, the app closed): ask once signed in.
  useEffect(() => {
    if (phase !== 'ready' || !useCardPayment.getState().order) return
    void checkCardPayment().then((p) => {
      if (p === 'paid') showCardPayment()
    })
  }, [phase])

  useEffect(() => {
    if (!open || state !== 'waiting' || !order) return
    setLate(false)
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout>
    const ask = () => {
      const waited = Date.now() - started
      if (waited > LATE_MS) setLate(true)
      if (waited > STOP_MS) return
      timer = setTimeout(
        () => {
          void checkCardPayment()
          ask()
        },
        waited < 2 * 60_000 ? FAST_MS : SLOW_MS,
      )
    }
    ask()
    return () => clearTimeout(timer)
  }, [open, state, order])

  const date = until
    ? new Date(until)
        .toLocaleDateString(i18n.resolvedLanguage, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
        .replace(/\.$/, '')
    : null

  const check = async () => {
    setBusy('check')
    try {
      if ((await checkCardPayment()) === 'waiting') toast(t('plan.cardNotYet'))
    } finally {
      setBusy(null)
    }
  }
  const retry = async () => {
    if (!order) return
    setBusy('retry')
    try {
      closeCardPayment()
      await startCardPayment(order.plan, (url) => platform.openExternal(url))
    } catch {
      toast.error(t('plan.checkoutFailed'))
    } finally {
      setBusy(null)
    }
  }
  const reopen = () => {
    const url = cardPaymentUrl()
    if (url) void platform.openExternal(url)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeCardPayment()}>
      <DialogContent className="top-[10%] max-w-md overflow-hidden p-0">
        {state === 'paid' ? (
          <>
            <div className="relative h-32" style={ART}>
              <div className="absolute -bottom-8 left-6 grid size-16 place-items-center rounded-full border bg-card text-brand shadow-float animate-in zoom-in-50 duration-500">
                <Sparkles className="size-7" />
              </div>
            </div>
            <div className="space-y-4 px-6 pt-11 pb-6">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-semibold">
                  {order?.extended ? t('plan.extendedTitle') : t('plan.welcomeTitle')}
                </DialogTitle>
                <DialogDescription className="text-sm">{t('plan.welcomeBody')}</DialogDescription>
              </div>
              {order?.extended ? null : (
                <ul className="space-y-2 text-sm">
                  {PRO_BENEFITS.map((key) => (
                    <li key={key} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                      {t(key)}
                    </li>
                  ))}
                </ul>
              )}
              {date ? (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {t('plan.cardPaidUntil', { date })}
                </p>
              ) : null}
              <Button className="w-full" onClick={closeCardPayment}>
                {t('plan.great')}
              </Button>
            </div>
          </>
        ) : state === 'expired' || state === 'failed' ? (
          <>
            <div className="h-20" style={ART} aria-hidden />
            <div className="space-y-3 px-6 pt-5 pb-6">
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                <CircleX className="size-5 text-muted-foreground" />
                {t('plan.cardExpiredTitle')}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {state === 'failed' ? t('plan.cardFailedBody') : t('plan.cardExpiredBody')}
              </DialogDescription>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={closeCardPayment}>
                  {t('window.close')}
                </Button>
                <Button loading={busy === 'retry'} onClick={() => void retry()}>
                  {t('plan.cardTryAgain')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="h-20" style={ART} aria-hidden />
            <div className="space-y-3 px-6 pt-5 pb-6">
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                <Spinner className="size-4 text-muted-foreground" />
                {t('plan.cardWaitTitle')}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {late ? t('plan.cardWaitLate') : t('plan.cardWaitBody')}
              </DialogDescription>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={closeCardPayment}>
                  {t('window.close')}
                </Button>
                <Button variant="outline" disabled={!order} onClick={reopen}>
                  {t('plan.cardOpenAgain')}
                </Button>
                <Button
                  loading={busy === 'check'}
                  disabled={busy !== null}
                  onClick={() => void check()}
                >
                  {t('plan.cardIPaid')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
