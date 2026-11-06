import { useTranslation } from '@fixnote/i18n'
import { Button, Spinner } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Link2Off, MessageCircle, Send } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
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
import { RemoteMcpCard } from './RemoteMcpCard'

/**
 * Services that send things into FixNote. One card each; more messengers and social networks go
 * here the same way.
 */
export function IntegrationsSection() {
  return (
    <div className="space-y-3">
      <ExtensionCard />
      <TelegramCard />
      <DiscordCard />
      <RemoteMcpCard card={IntegrationCard} />
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

type Channel = 'telegram' | 'discord' | 'extension'

/**
 * A capture channel's card: Connect makes a one-time code and opens where the channel takes it
 * (`open(code)`), then waits until the server lists the new link; Disconnect removes this
 * channel's links. Without `open` the channel connects from its own side (the extension asks,
 * `ExtensionConnectDialog` confirms) and the card only lists and disconnects.
 */
function CaptureCard({
  channel,
  icon,
  name,
  body,
  waitingText,
  open,
  settings,
  extra,
}: {
  channel: Channel
  icon: ReactNode
  name: string
  body: string
  waitingText?: string
  open?: (code: string) => Promise<void>
  settings?: ReactNode
  /** More buttons beside Connect (Install). */
  extra?: ReactNode
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const backend = captureBackend()
  const all = useQuery({
    queryKey: LINKS,
    queryFn: () => backend?.captureLinks() ?? [],
    enabled: Boolean(backend),
    // While the person finishes in the other app, look for the new link every few seconds.
    refetchInterval: code ? 3000 : false,
  }).data
  const list = (all ?? []).filter((l) => l.channel === channel)
  const localOnly = useLlm((s) => s.localOnly)
  const known = useRef<number | null>(null)
  // A new link arrived while waiting: done.
  useEffect(() => {
    if (!code) {
      known.current = list.length
      return
    }
    if (known.current !== null && list.length > known.current) setCode(null)
  }, [code, list.length])

  const connect = async () => {
    if (!backend || !open) return
    setBusy(true)
    try {
      const next = await backend.createCaptureCode()
      known.current = list.length
      setCode(next)
      await open(next)
      setTimeout(() => setCode((c) => (c === next ? null : c)), 15 * 60_000)
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
  ) : code ? (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      {waitingText}
    </span>
  ) : !open ? (
    extra
  ) : (
    <>
      {extra}
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        onClick={() => withPro('integrations', () => void connect())}
      >
        {t('capture.connect')}
      </Button>
    </>
  )

  return (
    <IntegrationCard
      icon={icon}
      name={name}
      body={
        list.length
          ? t('capture.linked', { label: list.map((l) => l.label || name).join(', ') })
          : body
      }
      settings={list.length ? settings : undefined}
    >
      {action}
    </IntegrationCard>
  )
}

/** The Discord app: Discord's own authorize page (install + who you are), `state` = the code. */
function DiscordCard() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const phase = useAccount((s) => s.phase)
  if (!env.discordAppId || !env.supabaseUrl || phase === 'disabled') return null
  const appId = env.discordAppId
  const redirect = `${env.supabaseUrl}/functions/v1/discord-bot/oauth`
  return (
    <CaptureCard
      channel="discord"
      icon={<MessageCircle className="size-4" />}
      name={t('discord.title')}
      body={t('discord.body')}
      waitingText={t('discord.waiting')}
      open={(code) =>
        platform.openExternal(
          `https://discord.com/oauth2/authorize?${new URLSearchParams({
            client_id: appId,
            response_type: 'code',
            redirect_uri: redirect,
            scope: 'identify applications.commands',
            integration_type: '1',
            state: code,
          })}`,
        )
      }
    />
  )
}

/**
 * The browser extension: it asks to connect itself (its "Connect" opens this app, which confirms
 * in `ExtensionConnectDialog`), so the card only says how, offers Install and disconnects.
 */
function ExtensionCard() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const phase = useAccount((s) => s.phase)
  if (phase === 'disabled') return null
  return (
    <CaptureCard
      channel="extension"
      icon={<Globe className="size-4" />}
      name={t('extension.title')}
      body={`${t('extension.body')} ${t('extension.howTo')}`}
      extra={
        env.extensionUrl ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void platform.openExternal(env.extensionUrl as string)}
          >
            {t('extension.install')}
          </Button>
        ) : null
      }
    />
  )
}

/** The Telegram capture bot: a one-time code in a t.me deep link, then wait for Start. */
function TelegramCard() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const qc = useQueryClient()
  const phase = useAccount((s) => s.phase)
  const backend = captureBackend()
  const links = useQuery({
    queryKey: LINKS,
    queryFn: () => backend?.captureLinks() ?? [],
    enabled: Boolean(backend),
  })
  const bot = env.telegramBot ?? (import.meta.env.DEV ? 'fixnote_dev_bot' : undefined)
  const { driver } = useDb()
  const toDaily = useQuery({
    queryKey: ['kv', CAPTURE_TO_DAILY],
    queryFn: () => captureToDaily(driver, 'telegram'),
  }).data
  if (!bot || phase === 'disabled') return null
  const list = (links.data ?? []).filter((l) => l.channel === 'telegram')

  return (
    <CaptureCard
      channel="telegram"
      icon={<Send className="size-4" />}
      name={t('capture.title')}
      body={t('capture.body')}
      waitingText={t('capture.waiting')}
      open={(code) =>
        platform.openExternal(`https://t.me/${bot}?start=${encodeURIComponent(code)}`)
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
    />
  )
}
