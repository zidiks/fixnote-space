import { useTranslation } from '@fixnote/i18n'
import { Button, Spinner } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2Off, Send } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../../app/store'
import { captureBackend, useAccount } from '../../lib/account/account'
import { useLlm } from '../../lib/assistant/llm'
import { CAPTURE_TO_DAILY, captureToDaily } from '../../lib/daily'
import { useDb } from '../../lib/db'
import { env } from '../../lib/env'
import { kvStore } from '../../lib/kv'
import { withPro } from '../../lib/plan'
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
  settings,
}: {
  icon: ReactNode
  name: string
  body: string
  children: ReactNode
  /** Options of the connected service, under the card's row. */
  settings?: ReactNode
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
      {settings ? <div className="basis-full border-t pt-3">{settings}</div> : null}
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
  const [busy, setBusy] = useState(false)
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
  const { driver } = useDb()
  const toDaily = useQuery({
    queryKey: ['kv', CAPTURE_TO_DAILY],
    queryFn: () => captureToDaily(driver, 'telegram'),
  }).data
  if (!bot || phase === 'disabled') return null
  const list = links.data ?? []

  const connect = async () => {
    if (!backend) return
    setBusy(true)
    try {
      const code = await backend.createCaptureCode()
      setWaiting(true)
      await platform.openExternal(`https://t.me/${bot}?start=${encodeURIComponent(code)}`)
      setTimeout(() => setWaiting(false), 5 * 60_000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
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
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          for (const link of list) await backend.unlinkCapture(link)
          await qc.invalidateQueries({ queryKey: LINKS })
        } finally {
          setBusy(false)
        }
      }}
    >
      <Link2Off />
      {t('capture.unlink')}
    </Button>
  ) : waiting ? (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      {t('capture.waiting')}
    </span>
  ) : (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={() => withPro('integrations', () => void connect())}
    >
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
      settings={
        list.length ? (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-brand"
              checked={toDaily ?? false}
              onChange={(e) => {
                const on = e.target.checked
                qc.setQueryData(['kv', CAPTURE_TO_DAILY], on)
                void kvStore(driver).set(CAPTURE_TO_DAILY, on ? '1' : '0')
              }}
            />
            <span className="space-y-0.5">
              <span className="block text-sm">{t('capture.toDaily')}</span>
              <span className="block text-sm text-muted-foreground">
                {t('capture.toDailyBody')}
              </span>
            </span>
          </label>
        ) : undefined
      }
    >
      {action}
    </IntegrationCard>
  )
}
