import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { CircleCheck, CircleX } from 'lucide-react'
import { useEffect } from 'react'
import { ART } from './pro-look'

let opened = false

/**
 * Where the browser lands after paying in the desktop app (`?billing=…&to=app`, see
 * supabase/functions/billing): it opens the app again through fixnote:// and says so. Like the
 * shared-link page it needs no local database and no account, so the web app in this browser,
 * maybe signed in to another account, is left alone.
 */
export function PaidPage({ result }: { result: 'success' | 'cancel' }) {
  const { t } = useTranslation()
  const link = `fixnote://billing/${result}`
  const success = result === 'success'

  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', dark.matches)
    apply()
    dark.addEventListener('change', apply)
    document.title = 'FixNote'
    // Once, also under StrictMode: the browser asks whether to open FixNote.
    if (!opened) {
      opened = true
      location.href = link
    }
    return () => dark.removeEventListener('change', apply)
  }, [link])

  const Icon = success ? CircleCheck : CircleX
  return (
    <div className="grid min-h-full place-items-center bg-background p-4 text-foreground">
      <main className="w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-float">
        <div className="h-24" style={ART} aria-hidden />
        <div className="space-y-3 px-6 pt-5 pb-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Icon className={success ? 'size-5 text-brand' : 'size-5 text-muted-foreground'} />
            {success ? t('plan.paidTitle') : t('plan.canceledTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {success ? t('plan.paidBackToApp') : t('plan.canceledBody')}
          </p>
          <Button asChild className="w-full">
            <a href={link}>{t('plan.openApp')}</a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t('plan.paidCloseTab')}</p>
        </div>
      </main>
    </div>
  )
}
