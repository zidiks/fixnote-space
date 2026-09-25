import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2Off, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { captureBackend } from '../../lib/account/account'
import { useLlm } from '../../lib/assistant/llm'
import { env } from '../../lib/env'
import { usePlatform } from '../../lib/platform'

const LINKS = ['capture-links'] as const

/** Connect the Telegram capture bot: a one-time code in a t.me deep link, then wait for Start. */
export function TelegramSection() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const qc = useQueryClient()
  const [waiting, setWaiting] = useState(false)
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
  if (!backend || !bot || localOnly) return null
  const list = links.data ?? []

  const connect = async () => {
    try {
      const code = await backend.createCaptureCode()
      setWaiting(true)
      await platform.openExternal(`https://t.me/${bot}?start=${encodeURIComponent(code)}`)
      setTimeout(() => setWaiting(false), 5 * 60_000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('capture.title')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('capture.body')}</p>
      </div>
      {list.map((link) => (
        <div key={link.externalId} className="flex max-w-md items-center gap-2 text-sm">
          <Send className="size-4 text-muted-foreground" />
          <span className="flex-1">{t('capture.linked', { label: link.label || 'Telegram' })}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await backend.unlinkCapture(link)
              await qc.invalidateQueries({ queryKey: LINKS })
            }}
          >
            <Link2Off />
            {t('capture.unlink')}
          </Button>
        </div>
      ))}
      {list.length ? null : (
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => void connect()}>
            <Send />
            {t('capture.connect')}
          </Button>
          {waiting ? (
            <span className="text-sm text-muted-foreground">{t('capture.waiting')}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}
