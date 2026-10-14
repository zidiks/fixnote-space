import { MCP_REMOTE_KEY, remoteLog } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, Input, Spinner } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, RadioTower } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../../app/store'
import { useAccount } from '../../lib/account/account'
import { useLlm } from '../../lib/assistant/llm'
import { useDb } from '../../lib/db'
import { kvStore } from '../../lib/kv'
import { withPro } from '../../lib/plan'
import {
  REMOTE_CLIENTS,
  REMOTE_KEY,
  REMOTE_LOG,
  remoteMcpApi,
  useRemoteEnabled,
  useRemoteMcp,
} from '../../lib/remote-mcp/bridge'
import { formatRelative } from '../../lib/time'

/**
 * Remote access for ChatGPT, claude.ai and other remote MCP apps (docs/remote-mcp.md): on/off for
 * this device, the address to paste, the apps let in (with Revoke) and what passes the server.
 */
export function RemoteMcpCard({
  card,
}: {
  card: (props: {
    icon: ReactNode
    name: string
    body: string
    children: ReactNode
    settings?: ReactNode
  }) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const { driver } = useDb()
  const qc = useQueryClient()
  const phase = useAccount((s) => s.phase)
  const localOnly = useLlm((s) => s.localOnly)
  const status = useRemoteMcp((s) => s.status)
  const enabled = useRemoteEnabled()
  const api = phase === 'ready' ? remoteMcpApi() : null
  const [revoking, setRevoking] = useState<string | null>(null)
  const clients = useQuery({
    queryKey: REMOTE_CLIENTS,
    queryFn: () => api?.clients() ?? [],
    enabled: Boolean(api),
  })
  const log =
    useQuery({ queryKey: REMOTE_LOG, queryFn: () => remoteLog(driver), enabled: enabled }).data ??
    []
  if (phase === 'disabled') return null

  const setEnabled = async (on: boolean) => {
    qc.setQueryData(REMOTE_KEY, on)
    await kvStore(driver).set(MCP_REMOTE_KEY, on ? '1' : '0')
    await qc.invalidateQueries({ queryKey: REMOTE_KEY })
  }
  const copy = async () => {
    if (!api) return
    await navigator.clipboard.writeText(api.serverUrl)
    toast(t('remoteMcp.copied'))
  }
  const revoke = async (id: string, name: string) => {
    if (!api) return
    setRevoking(id)
    try {
      await api.revoke(id)
      toast(t('remoteMcp.revoked', { name }))
      await qc.invalidateQueries({ queryKey: REMOTE_CLIENTS })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setRevoking(null)
    }
  }

  const action = localOnly ? (
    <span className="text-sm text-muted-foreground">{t('capture.localOnly')}</span>
  ) : !api ? (
    <Button variant="outline" size="sm" onClick={() => useUi.getState().openSettings('account')}>
      {t('capture.signIn')}
    </Button>
  ) : enabled ? (
    <Button variant="ghost" size="sm" onClick={() => void setEnabled(false)}>
      {t('remoteMcp.turnOff')}
    </Button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      onClick={() => withPro('integrations', () => void setEnabled(true))}
    >
      {t('remoteMcp.turnOn')}
    </Button>
  )

  const list = clients.data ?? []
  const settings =
    api && !localOnly ? (
      <div className="space-y-4">
        {enabled ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              {status === 'connecting' ? <Spinner /> : null}
              <span className={status === 'online' ? '' : 'text-muted-foreground'}>
                {t(`remoteMcp.status_${status}`)}
              </span>
            </p>
            <p className="max-w-md text-sm text-muted-foreground">{t('remoteMcp.toggleBody')}</p>
            <div className="space-y-1.5">
              <span className="block text-sm">{t('remoteMcp.url')}</span>
              <div className="flex max-w-md gap-2">
                <Input readOnly value={api.serverUrl} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="sm" onClick={() => void copy()}>
                  <Copy />
                  {t('remoteMcp.copy')}
                </Button>
              </div>
              <p className="max-w-md text-xs text-muted-foreground">{t('remoteMcp.urlHint')}</p>
            </div>
          </div>
        ) : null}
        {enabled || list.length ? (
          <div className="space-y-1.5">
            <span className="block text-sm">{t('remoteMcp.clients')}</span>
            {clients.isLoading ? (
              <Spinner />
            ) : list.length ? (
              <ul className="max-w-md divide-y rounded-lg border">
                {list.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {c.name}
                        {c.site ? <span className="text-muted-foreground"> · {c.site}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.lastUsed
                          ? t('remoteMcp.lastUsed', {
                              time: formatRelative(c.lastUsed, i18n.resolvedLanguage),
                            })
                          : t('remoteMcp.neverUsed')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoking !== null && revoking !== c.id}
                      loading={revoking === c.id}
                      onClick={() => void revoke(c.id, c.name)}
                    >
                      {t('remoteMcp.revoke')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('remoteMcp.noClients')}</p>
            )}
          </div>
        ) : null}
        {enabled && log.length ? (
          <div className="space-y-1.5">
            <span className="block text-sm">{t('remoteMcp.recent')}</span>
            <ul className="max-w-md space-y-0.5 text-xs text-muted-foreground">
              {log.slice(0, 5).map((e) => (
                <li key={`${e.at}-${e.tool}`}>
                  {formatRelative(e.at, i18n.resolvedLanguage)} · {e.client} · {e.tool}
                  {e.ok ? '' : ` · ${t('remoteMcp.refused')}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="max-w-md text-xs text-muted-foreground">{t('remoteMcp.privacy')}</p>
      </div>
    ) : undefined

  const Card = card
  return (
    <Card
      icon={<RadioTower className="size-4" />}
      name={t('remoteMcp.title')}
      body={t('remoteMcp.body')}
      settings={settings}
    >
      {action}
    </Card>
  )
}
