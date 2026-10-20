import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import { Check, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import type { ConsentDetails } from '../../lib/remote-mcp/consent'

/** The AI app's logo, or its first letter (or a spark when it is not known yet). */
function ClientMark({ client }: { client: ConsentDetails['client'] | null }) {
  const [broken, setBroken] = useState(false)
  const base =
    'grid size-14 place-items-center overflow-hidden rounded-2xl border bg-card shadow-float'
  if (client?.logo && !broken) {
    return (
      <span className={base}>
        <img
          src={client.logo}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      </span>
    )
  }
  return (
    <span className={cn(base, 'text-xl font-semibold text-foreground')} aria-hidden>
      {client ? (
        (client.name.trim()[0]?.toUpperCase() ?? '?')
      ) : (
        <Sparkles className="size-6 text-brand" />
      )}
    </span>
  )
}

/** FixNote ⇄ the AI app, with a quiet pulse between them while `live`. */
export function ConnectMarks({
  client,
  live = false,
}: {
  client: ConsentDetails['client'] | null
  live?: boolean
}) {
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden>
      <span className="grid size-14 place-items-center overflow-hidden rounded-2xl shadow-float">
        <img src="/icon.svg" alt="" className="size-full" />
      </span>
      <span className="relative flex w-14 items-center justify-between">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              'size-1.5 rounded-full bg-muted-foreground/40',
              live && 'animate-pulse bg-brand',
            )}
            style={live ? { animationDelay: `${i * 160}ms` } : undefined}
          />
        ))}
      </span>
      <ClientMark client={client} />
    </div>
  )
}

/** What the AI app can and cannot do: the same words on the page and in the app. */
export function ConnectScope() {
  const { t } = useTranslation()
  const can = [t('connect.canRead'), t('connect.canWrite'), t('connect.canScope')]
  const cannot = [t('connect.cannotDelete'), t('connect.cannotClosed')]
  return (
    <div className="grid gap-3 rounded-2xl bg-muted/60 p-4 text-sm">
      <section>
        <h2 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('connect.can')}
        </h2>
        <ul className="grid gap-1.5">
          {can.map((text) => (
            <li key={text} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('connect.cannot')}
        </h2>
        <ul className="grid gap-1.5">
          {cannot.map((text) => (
            <li key={text} className="flex gap-2">
              <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
