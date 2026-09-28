import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2Off, Send } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../../app/store'
import { captureBackend, useAccount } from '../../lib/account/account'
import { useLlm } from '../../lib/assistant/llm'
import { env } from '../../lib/env'
import { usePlatform } from '../../lib/platform'

/**
 * Services that send things into FixNote. One card each; more messengers and social networks go
 * here the same way.
 */
export function IntegrationsSection() {
  return (
    <div className="space-y-3">
      <TelegramCard />
    </div>
  )
}

/** A service: its icon, name and one line, and on the right what can be done now. */
function IntegrationCard({
  icon,
  name,
  body,
  children,
}: {
  icon: ReactNode
  name: string
  body: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

const LINKS = ['capture-links'] as const

/** The Telegram capture bot: a one-time code in a t.me deep link, then wait for Start. */
function TelegramCard() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const qc = useQueryClient()
  const [waiting, setWaiting] = useState(false)
  const phase = useAccount((s) => s.phase)
  const backend = captureBackend()
  const links = useQuery({
    queryKey: LINKS,
    queryFn: () => backend?.captureLinks() ?? [],
    enabled: Boolean(backend),
    // While the user is in Telegram, look for the new link every few seconds.
    refetchInterval: (q) => (waiting && !q.state.data?.length ? 3000 : false),
  })
  const bot = env.telegramBot ?? (import.meta.env.DEV ? 'fixnote_dev_bot' : undefined)
  const localOnly = useLlm((s) => s.localOnly)
  if (!bot || phase === 'disabled') return null
  const list = links.data ?? []

  const connect = async () => {
    if (!backend) return
    try {
      const code = await backend.createCaptureCode()
      setWaiting(true)
      await platform.openExternal(`https://t.me/${bot}?start=${encodeURIComponent(code)}`)
      setTimeout(() => setWaiting(false), 5 * 60_000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const action = localOnly ? (
    <span className="text-sm text-muted-foreground">{t('capture.localOnly')}</span>
  ) : !backend ? (
    <Button variant="outline" size="sm" onClick={() => useUi.getState().openSettings('account')}>
      {t('capture.signIn')}
    </Button>
  ) : list.length ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        for (const link of list) await backend.unlinkCapture(link)
        await qc.invalidateQueries({ queryKey: LINKS })
      }}
    >
      <Link2Off />
      {t('capture.unlink')}
    </Button>
  ) : waiting ? (
    <span className="text-sm text-muted-foreground">{t('capture.waiting')}</span>
  ) : (
    <Button variant="outline" size="sm" onClick={() => void connect()}>
      {t('capture.connect')}
    </Button>
  )

  return (
    <IntegrationCard
      icon={<Send className="size-4" />}
      name={t('capture.title')}
      body={
        list.length
          ? t('capture.linked', { label: list.map((l) => l.label || 'Telegram').join(', ') })
          : t('capture.body')
      }
    >
      {action}
    </IntegrationCard>
  )
}
