import { useTranslation } from '@fixnote/i18n'
import { Button, cn, Spinner } from '@fixnote/ui'
import { ArrowUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useUi } from '../../app/store'
import { refreshPlan, startCheckout, useAccount } from '../../lib/account/account'
import {
  type DevPlanMode,
  devPlanMode,
  endDevTrialSoon,
  forgetDevPayments,
  setDevPlanMode,
  spendDevAi,
} from '../../lib/account/dev-plan'
import { usesDevBackend } from '../../lib/account/pick'
import { SUBY_PORTAL, usePlan } from '../../lib/plan'
import { usePlatform } from '../../lib/platform'

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

/** Settings → Plan: which plan, until when, and how much of it is used (like Claude's usage). */
export function PlanSection() {
  const { t, i18n } = useTranslation()
  const phase = useAccount((s) => s.phase)
  const info = usePlan((s) => s.info)
  const openSettings = useUi((s) => s.openSettings)
  const platform = usePlatform()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (phase !== 'ready') return
    setLoading(true)
    void refreshPlan(true).finally(() => setLoading(false))
  }, [phase])

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
    info.status === 'beta'
      ? t('plan.statusBeta', { date: date(info.betaUntil) })
      : info.status === 'trialing'
        ? t('plan.statusTrial', { date: date(info.trialEndsAt) })
        : info.status === 'canceled'
          ? t('plan.statusCanceled', { date: date(info.periodEnd) })
          : info.status === 'past_due'
            ? t('plan.statusPastDue')
            : info.status === 'active'
              ? t('plan.statusActive', { date: date(info.periodEnd) })
              : t('plan.statusFree')
  const pro = info.plan === 'pro'
  const paying =
    info.status === 'active' || info.status === 'past_due' || info.status === 'canceled'

  return (
    <div className="space-y-6">
      <PlanHeading name={pro ? t('plan.pro') : t('plan.free')} body={status} />
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
      {info.status === 'beta' ? (
        // The beta gives everyone Pro, and paying is open already: someone who subscribed sees
        // their subscription and manages it; anyone else can subscribe.
        info.subscribed ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {info.canceled
                ? t('plan.statusCanceled', { date: date(info.periodEnd) })
                : t('plan.subscribedUntil', { date: date(info.periodEnd) })}
            </p>
            <Button variant="outline" onClick={() => void platform.openExternal(SUBY_PORTAL)}>
              {t('plan.manage')}
              <ArrowUpRight />
            </Button>
          </div>
        ) : (
          <Upgrade />
        )
      ) : paying ? (
        <Button variant="outline" onClick={() => void platform.openExternal(SUBY_PORTAL)}>
          {t('plan.manage')}
          <ArrowUpRight />
        </Button>
      ) : (
        <Upgrade />
      )}
      {usesDevBackend() ? <DevPlanSwitch /> : null}
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
      await startCheckout(plan, (url) => platform.openExternal(url))
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
      {note ? (
        <p className={cn('text-xs', note.error ? 'text-destructive' : 'text-muted-foreground')}>
          {note.text}
        </p>
      ) : null}
    </div>
  )
}

function PlanHeading({ name, body }: { name: string; body: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-sm font-semibold text-brand">
          {name}
        </span>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
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
        {(['beta', 'trial', 'pro', 'free'] as const).map((m) => (
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
        <Button size="sm" variant="ghost" onClick={() => void apply(forgetDevPayments)}>
          {t('plan.devNeverPaid')}
        </Button>
      </div>
    </div>
  )
}
