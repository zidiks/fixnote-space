import { useTranslation } from '@fixnote/i18n'
import { Button, ConfirmDialog, cn, Spinner } from '@fixnote/ui'
import { Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../../app/store'
import { billingApi, refreshPlan, startCheckout, useAccount } from '../../lib/account/account'
import {
  type DevPlanMode,
  devPlanMode,
  endDevTrialSoon,
  resetDevAccount,
  setDevPlanMode,
  spendDevAi,
} from '../../lib/account/dev-plan'
import { usesDevBackend } from '../../lib/account/pick'
import { type BillingOverview, type BillingPayment, money } from '../../lib/billing'
import { usePlan } from '../../lib/plan'
import { usePlatform } from '../../lib/platform'
import { TrialButton } from '../ProCard'

/** "3.2 MB", "20 GB" in the UI language. */
function size(bytes: number, lang: string | undefined): string {
  const units = [
    ['gigabyte', 1024 ** 3],
    ['megabyte', 1024 ** 2],
    ['kilobyte', 1024],
  ] as const
  const [unit, per] = units.find(([, n]) => bytes >= n) ?? ['byte', 1]
  const value = bytes / per
  return new Intl.NumberFormat(lang, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 && unit !== 'byte' ? 1 : 0,
  }).format(value)
}

function Bar({ label, value, detail }: { label: string; value: number; detail: string }) {
  const pct = Math.min(Math.max(value, 0), 1)
  return (
    <div className="max-w-md space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{detail}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full bg-brand transition-[width]',
            pct >= 1 && 'bg-destructive',
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Settings → Billing: which plan, until when and how much of it is used (like Claude's usage);
 * the subscription as Suby has it (switch to yearly, cancel) and its payments with receipts.
 */
export function PlanSection() {
  const { t, i18n } = useTranslation()
  const phase = useAccount((s) => s.phase)
  const info = usePlan((s) => s.info)
  const openSettings = useUi((s) => s.openSettings)
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [billing, setBilling] = useState<'loading' | 'ready' | 'failed'>('loading')

  const loadBilling = useCallback(() => {
    const api = billingApi()
    if (!api) return
    setBilling('loading')
    api.overview().then(
      (o) => {
        setOverview(o)
        setBilling('ready')
      },
      () => setBilling('failed'),
    )
  }, [])

  useEffect(() => {
    if (phase !== 'ready') return
    setLoading(true)
    void refreshPlan(true).finally(() => setLoading(false))
    loadBilling()
  }, [phase, loadBilling])

  /** After a change: Suby's answer, and the plan as the server now has it. */
  const changed = (o: BillingOverview) => {
    setOverview(o)
    void refreshPlan(true)
  }

  const date = (ms: number | null) =>
    ms
      ? new Date(ms).toLocaleDateString(i18n.resolvedLanguage, { day: 'numeric', month: 'long' })
      : ''

  if (phase !== 'ready') {
    return (
      <div className="space-y-4">
        <PlanHeading name={t('plan.free')} body={t('plan.statusFree')} />
        <p className="max-w-md text-sm text-muted-foreground">{t('plan.signedOut')}</p>
        <Button onClick={() => openSettings('account')}>{t('plan.signIn')}</Button>
      </div>
    )
  }
  if (!info) {
    return loading ? (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {t('common.loading')}
      </p>
    ) : null
  }

  const status =
    info.status === 'trialing'
      ? t('plan.statusTrial', { date: date(info.trialEndsAt) })
      : info.status === 'canceled'
        ? t('plan.statusCanceled', { date: date(info.periodEnd) })
        : info.status === 'past_due'
          ? t('plan.statusPastDue')
          : info.status === 'active'
            ? t('plan.statusActive', { date: date(info.periodEnd) })
            : t('plan.statusFree')
  const pro = info.plan === 'pro'
  const sub = overview?.subscription ?? null
  // A subscription that still runs (also one cancelled, until its period ends): no new checkout.
  const live =
    sub && (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'trialing')
  // Our server says Pro is paid for: active, waiting for its renewal, or cancelled with time left.
  // No checkout then, even when Suby does not know the subscription (test data, a manual grant):
  // the buttons show only when both sides agree there is none, so nobody pays twice.
  const paid =
    info.status === 'active' ||
    info.status === 'past_due' ||
    (info.status === 'canceled' && (info.periodEnd ?? 0) > Date.now())

  return (
    <div className="space-y-6">
      {/* With a running subscription, its card below says the same in more detail. */}
      <PlanHeading
        name={pro ? t('plan.pro') : t('plan.free')}
        body={sub && live ? null : status}
        beta={info.beta}
      />
      {pro ? (
        <div className="space-y-5">
          <Bar
            label={t('plan.ai')}
            value={info.ai.limit ? info.ai.used / info.ai.limit : 0}
            detail={`${t('plan.aiUsed', {
              pct: info.ai.limit
                ? Math.min(100, Math.round((info.ai.used / info.ai.limit) * 100))
                : 0,
            })} · ${t('plan.renews', { date: date(info.ai.resetsAt) })}`}
          />
          <Bar
            label={t('plan.storage')}
            value={info.storage.limit ? info.storage.used / info.storage.limit : 0}
            detail={t('plan.storageUsed', {
              used: size(info.storage.used, i18n.resolvedLanguage),
              limit: size(info.storage.limit, i18n.resolvedLanguage),
            })}
          />
        </div>
      ) : (
        <ul className="max-w-md list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t('plan.promptSync')}</li>
          <li>{t('plan.promptAi')}</li>
          <li>{t('plan.promptShare')}</li>
          <li>{t('plan.promptIntegrations')}</li>
          <li>{t('plan.promptFiles')}</li>
        </ul>
      )}
      {info.filesDeleteAt ? (
        <p className="max-w-md rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t('plan.filesDeleteAt', {
            size: size(info.storage.used, i18n.resolvedLanguage),
            date: date(info.filesDeleteAt),
          })}
        </p>
      ) : null}
      {info.plan === 'free' && info.trialAvailable ? (
        <div className="max-w-md space-y-2 rounded-lg border p-4">
          <p className="text-sm font-medium">{t('plan.paywallTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('plan.paywallBody')}</p>
          <TrialButton label={t('plan.tryFreeDays')} />
        </div>
      ) : null}
      {sub && live ? <Subscription sub={sub} onChange={changed} /> : null}
      {!live && !paid ? <Upgrade /> : null}
      <History overview={overview} state={billing} onRetry={loadBilling} />
      {sub && live && !sub.cancelAtPeriodEnd ? (
        <CancelSubscription periodEnd={sub.periodEnd} onChange={changed} />
      ) : null}
      {usesDevBackend() ? <DevPlanSwitch /> : null}
    </div>
  )
}

const day = (iso: string | null, lang?: string, year = false) =>
  iso
    ? new Date(iso).toLocaleDateString(lang, {
        day: 'numeric',
        month: 'long',
        ...(year ? { year: 'numeric' } : {}),
      })
    : ''

/** The running subscription: plan and price, the next payment, and switching to yearly. */
function Subscription({
  sub,
  onChange,
}: {
  sub: NonNullable<BillingOverview['subscription']>
  onChange: (o: BillingOverview) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const [busy, setBusy] = useState<'switch' | 'keep' | null>(null)
  const run = async (key: 'switch' | 'keep', fn: () => Promise<BillingOverview>) => {
    setBusy(key)
    try {
      onChange(await fn())
    } catch {
      toast.error(t('plan.actionFailed'))
    } finally {
      setBusy(null)
    }
  }
  const api = billingApi()
  const price = money(sub.priceCents, sub.currency, lang)
  const end = day(sub.periodEnd, lang)
  return (
    <div className="max-w-md space-y-3 rounded-lg border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">
          {sub.plan === 'year' ? t('plan.planYearly') : t('plan.planMonthly')}
        </p>
        {price ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {sub.plan === 'year' ? t('plan.perYear', { price }) : t('plan.perMonth', { price })}
          </p>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {sub.cancelAtPeriodEnd
          ? t('plan.endsOn', { date: end })
          : sub.status === 'past_due'
            ? t('plan.statusPastDue')
            : t('plan.nextPayment', { date: end })}
      </p>
      {sub.next ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm">
            {sub.next.plan === 'year'
              ? t('plan.yearlyFrom', { date: day(sub.next.at, lang) })
              : t('plan.monthlyFrom', { date: day(sub.next.at, lang) })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === 'keep'}
            disabled={busy !== null || !api}
            onClick={() => api && void run('keep', () => api.keepPlan())}
          >
            {t('plan.keepPlan')}
          </Button>
        </div>
      ) : sub.plan === 'month' && !sub.cancelAtPeriodEnd && sub.status === 'active' ? (
        <div className="space-y-1.5">
          <Button
            variant="outline"
            loading={busy === 'switch'}
            disabled={busy !== null || !api}
            onClick={() => api && void run('switch', () => api.switchPlan('year'))}
          >
            {t('plan.switchToYear')}
            <span className="rounded-full bg-brand/10 px-1.5 text-xs text-brand">
              {t('plan.yearlySave')}
            </span>
          </Button>
          <p className="text-xs text-muted-foreground">{t('plan.switchHint', { date: end })}</p>
        </div>
      ) : null}
    </div>
  )
}

/** The account's payments, newest first, each with its receipt. */
function History({
  overview,
  state,
  onRetry,
}: {
  overview: BillingOverview | null
  state: 'loading' | 'ready' | 'failed'
  onRetry: () => void
}) {
  const { t } = useTranslation()
  // Nothing to show to someone who never paid.
  if (state === 'ready' && !overview?.payments.length && !overview?.subscription) return null
  return (
    <div className="max-w-md space-y-2">
      <p className="text-sm font-medium">{t('plan.history')}</p>
      {state === 'loading' && !overview ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> {t('common.loading')}
        </p>
      ) : state === 'failed' ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {t('plan.historyFailed')}
          <Button size="sm" variant="ghost" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : overview?.payments.length ? (
        <ul className="divide-y rounded-lg border">
          {overview.payments.map((p) => (
            <PaymentRow key={p.id} payment={p} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('plan.historyEmpty')}</p>
      )}
    </div>
  )
}

function PaymentRow({ payment: p }: { payment: BillingPayment }) {
  const { t, i18n } = useTranslation()
  const platform = usePlatform()
  const [busy, setBusy] = useState(false)
  const date = day(p.at, i18n.resolvedLanguage, true)
  const download = async () => {
    const api = billingApi()
    if (!api) return
    setBusy(true)
    try {
      const pdf = await api.receipt(p.id)
      await platform.saveFile(`FixNote-${p.at.slice(0, 10)}.pdf`, pdf, 'application/pdf')
    } catch {
      toast.error(t('plan.receiptFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate">
          {p.plan === 'year'
            ? t('plan.planYearly')
            : p.plan === 'month'
              ? t('plan.planMonthly')
              : 'Pro'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {date} · {p.method === 'card' ? t('plan.card') : t('plan.crypto')}
        </p>
      </div>
      <div className="text-right">
        <p className="tabular-nums">{money(p.amountCents, p.currency, i18n.resolvedLanguage)}</p>
        <p className={cn('text-xs', p.status === 'paid' ? 'text-muted-foreground' : 'text-brand')}>
          {p.status === 'paid'
            ? t('plan.paidStatus')
            : p.status === 'refunded'
              ? t('plan.refunded')
              : t('plan.processing')}
        </p>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t('plan.receipt')}
        title={t('plan.receipt')}
        loading={busy}
        disabled={p.status === 'processing'}
        onClick={() => void download()}
      >
        <Download />
      </Button>
    </li>
  )
}

/** At the very bottom, quietly: no renewal, Pro until the period ends. Asks first. */
function CancelSubscription({
  periodEnd,
  onChange,
}: {
  periodEnd: string | null
  onChange: (o: BillingOverview) => void
}) {
  const { t, i18n } = useTranslation()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const date = day(periodEnd, i18n.resolvedLanguage)
  const cancel = async () => {
    const api = billingApi()
    if (!api) return
    setBusy(true)
    try {
      onChange(await api.cancel())
      toast(t('plan.canceledToast', { date }))
    } catch {
      toast.error(t('plan.actionFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="pt-4">
      <Button
        variant="link"
        size="sm"
        className="h-auto px-0 text-xs text-muted-foreground"
        loading={busy}
        onClick={() => setAsking(true)}
      >
        {t('plan.cancel')}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t('plan.cancelTitle')}
        description={t('plan.cancelBody', { date })}
        confirmLabel={t('plan.cancel')}
        cancelLabel={t('plan.cancelKeep')}
        destructive
        onConfirm={() => void cancel()}
      />
    </div>
  )
}

/** Monthly or yearly: opens Suby's payment page in the browser; Pro turns on when it is paid. */
function Upgrade() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const [busy, setBusy] = useState<'month' | 'year' | null>(null)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const buy = async (plan: 'month' | 'year') => {
    setBusy(plan)
    setNote(null)
    try {
      await startCheckout(plan, (url) => platform.openExternal(url), platform.kind === 'desktop')
      setNote({ text: t('plan.paymentOpened'), error: false })
    } catch (err) {
      const unset = /not set up|503/i.test(err instanceof Error ? err.message : String(err))
      setNote({ text: unset ? t('plan.soon') : t('plan.checkoutFailed'), error: true })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('plan.upgrade')}</p>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy === 'year'} disabled={busy !== null} onClick={() => void buy('year')}>
          {t('plan.yearly')}
          <span className="rounded-full bg-brand-foreground/20 px-1.5 text-xs">
            {t('plan.yearlySave')}
          </span>
        </Button>
        <Button
          variant="outline"
          loading={busy === 'month'}
          disabled={busy !== null}
          onClick={() => void buy('month')}
        >
          {t('plan.monthly')}
        </Button>
      </div>
      {/* Suby takes stablecoins for now (cards need a company): no automatic renewal. */}
      <p className="max-w-md text-xs text-muted-foreground">{t('plan.payCrypto')}</p>
      {note ? (
        <p className={cn('text-xs', note.error ? 'text-destructive' : 'text-muted-foreground')}>
          {note.text}
        </p>
      ) : null}
    </div>
  )
}

function PlanHeading({ name, body, beta }: { name: string; body: string | null; beta?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-sm font-semibold text-brand">
          {name}
        </span>
        {beta ? (
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t('plan.beta')}
          </span>
        ) : null}
      </div>
      {body ? <p className="max-w-md text-sm text-muted-foreground">{body}</p> : null}
    </div>
  )
}

/** `?dev-backend` only: try every plan state on the fake server. */
function DevPlanSwitch() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<DevPlanMode>(devPlanMode)
  const apply = async (fn: () => void) => {
    fn()
    setMode(devPlanMode())
    await refreshPlan(true)
  }
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">{t('plan.devTitle')}</p>
      <div className="flex flex-wrap gap-2">
        {(['trial', 'pro', 'free'] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            variant={mode === m ? 'default' : 'outline'}
            onClick={() => void apply(() => setDevPlanMode(m))}
          >
            {m}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => void apply(spendDevAi)}>
          {t('plan.devSpend')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void apply(endDevTrialSoon)}>
          {t('plan.devTrialEnding')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void apply(resetDevAccount)}>
          {t('plan.devNewAccount')}
        </Button>
      </div>
    </div>
  )
}
