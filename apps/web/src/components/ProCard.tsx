import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@fixnote/ui'
import { ArrowUpRight, X } from 'lucide-react'
import { type CSSProperties, useState } from 'react'
import { useUi } from '../app/store'
import { useAccount } from '../lib/account/account'
import { useLlm } from '../lib/assistant/llm'
import { type ProFeature, usePlan } from '../lib/plan'

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

const hiddenRecently = () => {
  try {
    return Date.now() - Number(localStorage.getItem(HIDDEN_KEY) ?? 0) < HIDE_FOR
  } catch {
    return false
  }
}

/**
 * Bottom of the sidebar: Pro for someone not signed in (7 days free after signing up) or signed in
 * on Free. Not shown in "only on this device" mode, which chose to keep away from the server.
 * Hiding it keeps it away for two weeks.
 */
export function ProCard() {
  const { t } = useTranslation()
  const phase = useAccount((s) => s.phase)
  const plan = usePlan((s) => s.info?.plan)
  const localOnly = useLlm((s) => s.localOnly)
  const openSettings = useUi((s) => s.openSettings)
  const [hidden, setHidden] = useState(hiddenRecently)

  const signedOut = phase !== 'ready' && phase !== 'disabled'
  if (hidden || localOnly || phase === 'disabled' || !(signedOut || plan === 'free')) return null

  return (
    <div className="relative mx-2 mb-2 overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="h-14" style={ART} aria-hidden />
      <button
        type="button"
        onClick={() => openSettings(signedOut ? 'account' : 'plan')}
        className="block w-full px-3 pt-2 pb-3 text-left hover:bg-accent/40"
      >
        <span className="flex items-center gap-1 text-sm font-semibold">
          {t('plan.cardTitle')}
          <ArrowUpRight className="size-3.5 text-muted-foreground" />
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {signedOut ? t('plan.cardBody') : t('plan.cardBodyFree')}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t('plan.hideCard')}
        className="absolute top-1.5 right-1.5 bg-card/70 backdrop-blur-sm"
        onClick={() => {
          try {
            localStorage.setItem(HIDDEN_KEY, String(Date.now()))
          } catch {
            // private window: hidden for this session only
          }
          setHidden(true)
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
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                close()
                openSettings('plan')
              }}
            >
              {t('plan.seePlan')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
