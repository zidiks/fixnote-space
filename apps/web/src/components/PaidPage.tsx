import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { CircleCheck, CircleX } from 'lucide-react'
import { useEffect } from 'react'
import { savedCardOrder } from '../lib/card-order'
import { ART } from './pro-look'

let opened = false

/**
 * Where the browser lands after paying: from the desktop app (`?billing=…&to=app`, see
 * supabase/functions/billing) it opens the app again through fixnote:// and says so. ListoPays
 * (card) sends everyone to the same pages (`?billing=…&via=card`), so this page cannot know who
 * paid: when the web app in this browser is waiting for a card order it only says to go back to
 * it (the waiting tab finishes by itself); otherwise it tries the desktop app and offers both.
 * Like the shared-link page it needs no local database and no account, so the web app in this
 * browser, maybe signed in to another account, is left alone; fixnote:// only makes the app check.
 */
export function PaidPage({
  result,
  card = false,
}: {
  result: 'success' | 'cancel'
  card?: boolean
}) {
  const { t } = useTranslation()
  const link = `fixnote://billing/${result}`
  const success = result === 'success'
  // A card payment started by the web app in this browser: that tab is waiting for it.
  const webWaiting = card && savedCardOrder() !== null
  const web = new URLSearchParams(location.search).has('dev-backend') ? '/?dev-backend' : '/'

  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', dark.matches)
    apply()
    dark.addEventListener('change', apply)
    document.title = 'FixNote'
    // Once, also under StrictMode: the browser asks whether to open FixNote.
    if (!opened && !webWaiting) {
      opened = true
      location.href = link
    }
    return () => dark.removeEventListener('change', apply)
  }, [link, webWaiting])

  const Icon = success ? CircleCheck : CircleX
  const body = !success
    ? t('plan.canceledBody')
    : webWaiting
      ? t('plan.paidCardWeb')
      : card
        ? t('plan.paidCardAnywhere')
        : t('plan.paidBackToApp')
  return (
    <div className="grid min-h-full place-items-center bg-background p-4 text-foreground">
      <main className="w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-float">
        <div className="h-24" style={ART} aria-hidden />
        <div className="space-y-3 px-6 pt-5 pb-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Icon className={success ? 'size-5 text-brand' : 'size-5 text-muted-foreground'} />
            {success ? t('plan.paidTitle') : t('plan.canceledTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{body}</p>
          {webWaiting ? (
            <Button asChild className="w-full">
              <a href={web}>{t('plan.continueInBrowser')}</a>
            </Button>
          ) : (
            <Button asChild className="w-full">
              <a href={link}>{t('plan.openApp')}</a>
            </Button>
          )}
          {card && !webWaiting ? (
            <Button asChild variant="outline" className="w-full">
              <a href={web}>{t('plan.continueInBrowser')}</a>
            </Button>
          ) : null}
          <p className="text-center text-xs text-muted-foreground">{t('plan.paidCloseTab')}</p>
        </div>
      </main>
    </div>
  )
}
