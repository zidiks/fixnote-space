import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@fixnote/ui'
import { ArrowUpRight, Check, X } from 'lucide-react'
import { type CSSProperties, useEffect, useState } from 'react'
import { useUi } from '../app/store'
import { startTrial, useAccount } from '../lib/account/account'
import { useLlm } from '../lib/assistant/llm'
import { type ProFeature, showPaywall, usePlan } from '../lib/plan'

/** Arcs of the brand colour, like the waves on the Pro card of the site. */
const ART: CSSProperties = {
  background: [
    'radial-gradient(70% 120% at 104% -8%, color-mix(in oklch, var(--color-brand) 80%, black) 0 30%, transparent 31%)',
    'radial-gradient(85% 140% at 104% -8%, var(--color-brand) 0 43%, transparent 44%)',
    'radial-gradient(100% 160% at 104% -8%, color-mix(in oklch, var(--color-brand) 75%, white) 0 56%, transparent 57%)',
    'radial-gradient(118% 185% at 104% -8%, color-mix(in oklch, var(--color-brand) 45%, white) 0 69%, transparent 70%)',
    'color-mix(in oklch, var(--color-brand) 14%, var(--color-card))',
  ].join(', '),
}

const HIDDEN_KEY = 'fixnote.pro-card-hidden'
const HIDE_FOR = 14 * 86_400_000
const DAY = 86_400_000

/** What the card is about: each can be hidden on its own. */
type CardKind = 'offer' | 'ending' | 'files'

const hiddenKey = (kind: CardKind) => (kind === 'offer' ? HIDDEN_KEY : `${HIDDEN_KEY}.${kind}`)

const hiddenRecently = (kind: CardKind) => {
  try {
    return Date.now() - Number(localStorage.getItem(hiddenKey(kind)) ?? 0) < HIDE_FOR
  } catch {
    return false
  }
}

/**
 * Bottom of the sidebar: Pro for someone not signed in or signed in on Free; on the trial's last
 * two days, a reminder that it ends; on Free, a month before the server copy of the files goes, a
 * note about that. Not shown in "only on this device" mode, which chose to keep away from the
 * server. Hiding it keeps it away for two weeks.
 */
export function ProCard() {
  const { t, i18n } = useTranslation()
  const phase = useAccount((s) => s.phase)
  const info = usePlan((s) => s.info)
  const localOnly = useLlm((s) => s.localOnly)
  const openSettings = useUi((s) => s.openSettings)
  const [, setHidden] = useState(0)

  const signedOut = phase !== 'ready' && phase !== 'disabled'
  const now = Date.now()
  const date = (ms: number) =>
    new Date(ms).toLocaleDateString(i18n.resolvedLanguage, { day: 'numeric', month: 'long' })
  const card: { kind: CardKind; title: string; body: string } | null = signedOut
    ? { kind: 'offer', title: t('plan.cardTitle'), body: t('plan.cardBody') }
    : info?.status === 'trialing' && info.trialEndsAt && info.trialEndsAt - now < 2 * DAY
      ? {
          kind: 'ending',
          title: t('plan.cardTrialEnds', { date: date(info.trialEndsAt) }),
          body: t('plan.cardKeepPro'),
        }
      : info?.plan === 'free' && info.filesDeleteAt && info.filesDeleteAt - now < 30 * DAY
        ? {
            kind: 'files',
            title: t('plan.cardTitle'),
            body: t('plan.cardFiles', { date: date(info.filesDeleteAt) }),
          }
        : info?.plan === 'free'
          ? {
              kind: 'offer',
              title: t('plan.cardTitle'),
              body: info.trialAvailable ? t('plan.cardBody') : t('plan.cardBodyFree'),
            }
          : null
  if (!card || localOnly || phase === 'disabled' || hiddenRecently(card.kind)) return null

  return (
    <div className="relative mx-2 mb-2 overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="h-14" style={ART} aria-hidden />
      <button
        type="button"
        onClick={() =>
          signedOut
            ? openSettings('account')
            : info?.trialAvailable
              ? showPaywall()
              : openSettings('plan')
        }
        className="block w-full px-3 pt-2 pb-3 text-left hover:bg-accent/40"
      >
        <span className="flex items-center gap-1 text-sm font-semibold">
          {card.title}
          <ArrowUpRight className="size-3.5 text-muted-foreground" />
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {card.body}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t('plan.hideCard')}
        className="absolute top-1.5 right-1.5 bg-card/70 backdrop-blur-sm"
        onClick={() => {
          try {
            localStorage.setItem(hiddenKey(card.kind), String(Date.now()))
          } catch {
            // private window: hidden for this session only
          }
          setHidden((n) => n + 1)
        }}
      >
        <X />
      </Button>
    </div>
  )
}

const FEATURE_TEXT: Record<ProFeature, string> = {
  sync: 'plan.promptSync',
  ai: 'plan.promptAi',
  share: 'plan.promptShare',
  link: 'plan.promptLink',
  integrations: 'plan.promptIntegrations',
  files: 'plan.promptFiles',
}

/** "This is part of Pro", when a Free account reaches for something that goes through the server. */
export function ProDialog() {
  const { t } = useTranslation()
  const prompt = usePlan((s) => s.prompt)
  const trial = usePlan((s) => s.info?.trialAvailable ?? false)
  const openSettings = useUi((s) => s.openSettings)
  const close = () => usePlan.setState({ prompt: null })
  return (
    <Dialog open={prompt !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm overflow-hidden p-0">
        <div className="h-20" style={ART} aria-hidden />
        <div className="space-y-2 px-6 pt-4 pb-6">
          <DialogTitle className="text-lg font-semibold">{t('plan.promptTitle')}</DialogTitle>
          <DialogDescription className="text-sm">
            {prompt ? t(FEATURE_TEXT[prompt] as 'plan.promptSync') : ''}
          </DialogDescription>
          <p className="text-sm text-muted-foreground">{t('plan.promptAlso')}</p>
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            <Button variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            {trial ? (
              <TrialButton onStarted={close} />
            ) : (
              <Button
                onClick={() => {
                  close()
                  openSettings('plan')
                }}
              >
                {t('plan.seePlan')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Starts the free trial; on success Pro is on and `onStarted` runs. */
export function TrialButton({
  onStarted,
  className,
  label,
}: {
  onStarted?: () => void
  className?: string
  label?: string
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="space-y-1.5">
      <Button
        className={className}
        loading={busy}
        onClick={() => {
          setBusy(true)
          setFailed(false)
          startTrial()
            .then(() => onStarted?.())
            .catch(() => setFailed(true))
            .finally(() => setBusy(false))
        }}
      >
        {label ?? t('plan.tryFree')}
      </Button>
      {failed ? <p className="text-xs text-destructive">{t('plan.trialFailed')}</p> : null}
    </div>
  )
}

const PAYWALL_SEEN = 'fixnote.paywall-seen.'
const BENEFITS = [
  'plan.promptSync',
  'plan.promptAi',
  'plan.promptShare',
  'plan.promptIntegrations',
  'plan.promptFiles',
  'plan.promptLink',
] as const

/**
 * The offer of the free trial: once by itself after signing in on Free with the trial still to
 * take, and whenever the Pro card is clicked. Starting the trial is the person's choice.
 */
export function Paywall() {
  const { t } = useTranslation()
  const open = usePlan((s) => s.paywall)
  const info = usePlan((s) => s.info)
  const email = useAccount((s) => s.email)
  const phase = useAccount((s) => s.phase)
  // Not on top of Settings, where the sign-in happens: once they are closed.
  const settingsOpen = useUi((s) => s.settings !== null)
  const close = () => usePlan.setState({ paywall: false })

  useEffect(() => {
    if (phase !== 'ready' || settingsOpen || !email) return
    if (info?.plan !== 'free' || !info.trialAvailable) return
    try {
      if (localStorage.getItem(PAYWALL_SEEN + email)) return
      localStorage.setItem(PAYWALL_SEEN + email, String(Date.now()))
    } catch {
      return
    }
    showPaywall()
  }, [phase, settingsOpen, email, info])

  return (
    <Dialog open={open && info?.trialAvailable === true} onOpenChange={(o) => !o && close()}>
      <DialogContent className="top-[10%] max-w-md overflow-hidden p-0">
        <div className="h-28" style={ART} aria-hidden />
        <div className="space-y-4 px-6 pt-5 pb-6">
          <div className="space-y-1">
            <DialogTitle className="text-xl font-semibold">{t('plan.paywallTitle')}</DialogTitle>
            <DialogDescription className="text-sm">{t('plan.paywallBody')}</DialogDescription>
          </div>
          <ul className="space-y-2 text-sm">
            {BENEFITS.map((key) => (
              <li key={key} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="space-y-2 pt-1">
            <TrialButton className="w-full" onStarted={close} label={t('plan.tryFreeDays')} />
            <Button variant="ghost" className="w-full" onClick={close}>
              {t('plan.notNow')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const SEEN_KEY = 'fixnote.trial-ended-seen'

/**
 * Once, when the trial is over and the account stayed on Free: what Pro did for it, that nothing
 * is lost, and the way to keep Pro.
 */
export function TrialEndedDialog() {
  const { t, i18n } = useTranslation()
  const info = usePlan((s) => s.info)
  const openSettings = useUi((s) => s.openSettings)
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY)
    } catch {
      return null
    }
  })
  const ended =
    info?.plan === 'free' &&
    !info.paidBefore &&
    info.trialEndsAt !== null &&
    info.trialEndsAt < Date.now() &&
    Date.now() - info.trialEndsAt < 30 * DAY
  const key = info?.trialEndsAt ? String(info.trialEndsAt) : ''
  if (!ended || seen === key) return null

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, key)
    } catch {
      // private window: shown again next time
    }
    setSeen(key)
  }
  const { notes, aiAnswers, files } = info.usage
  const lines = [
    notes ? String(t('plan.endedNotes', { count: notes })) : null,
    aiAnswers ? String(t('plan.endedAi', { count: aiAnswers })) : null,
    files
      ? String(
          t('plan.endedFiles', {
            size: new Intl.NumberFormat(i18n.resolvedLanguage, {
              style: 'unit',
              unit: files >= 1024 ** 3 ? 'gigabyte' : 'megabyte',
              unitDisplay: 'short',
              maximumFractionDigits: 1,
            }).format(files / (files >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2)),
          }),
        )
      : null,
  ].filter((line): line is string => line !== null)

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm overflow-hidden p-0">
        <div className="h-20" style={ART} aria-hidden />
        <div className="space-y-3 px-6 pt-4 pb-6">
          <DialogTitle className="text-lg font-semibold">{t('plan.endedTitle')}</DialogTitle>
          {lines.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <DialogDescription className="text-sm">{t('plan.endedKept')}</DialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={close}>
              {t('plan.endedStayFree')}
            </Button>
            <Button
              onClick={() => {
                close()
                openSettings('plan')
              }}
            >
              {t('plan.endedKeepPro')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
