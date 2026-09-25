import { useTranslation } from '@fixnote/i18n'
import { Button, cn } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plug } from 'lucide-react'
import { toast } from 'sonner'
import { useDb } from '../../lib/db'
import { kvStore } from '../../lib/kv'
import { usePlatform } from '../../lib/platform'

type Access = 'off' | 'read' | 'write'
const ACCESS = ['off', 'read', 'write'] as const
const KEY = ['mcp', 'access'] as const

/** Connect Claude Desktop, Cursor and other MCP apps to the notes (desktop only). */
export function McpSection() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const { driver } = useDb()
  const qc = useQueryClient()
  const kv = kvStore(driver)
  const mcp = platform.mcp
  const info = useQuery({
    queryKey: ['mcp', 'info'],
    queryFn: () => mcp?.info() ?? null,
    enabled: Boolean(mcp),
  }).data
  const access = (useQuery({
    queryKey: KEY,
    queryFn: async () => ((await kv.get('mcp.access')) as Access | null) ?? 'read',
  }).data ?? 'read') as Access

  const setAccess = async (value: Access) => {
    await kv.set('mcp.access', value)
    await qc.invalidateQueries({ queryKey: KEY })
  }
  const connect = async (client: 'claude' | 'cursor') => {
    try {
      const path = (await mcp?.connect(client)) ?? ''
      toast(t('mcp.connected', { path }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const copy = async () => {
    const snippet = JSON.stringify(
      { mcpServers: { fixnote: { command: info?.command ?? 'fixnote-mcp', args: [] } } },
      null,
      2,
    )
    await navigator.clipboard.writeText(snippet)
    toast(t('mcp.copied'))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('mcp.title')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('mcp.body')}</p>
      </div>
      {!mcp ? (
        <p className="text-sm text-muted-foreground">{t('mcp.webOnly')}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm">{t('mcp.access')}</span>
            <div
              role="radiogroup"
              aria-label={t('mcp.access')}
              className="flex rounded-lg border p-0.5"
            >
              {ACCESS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={access === a}
                  onClick={() => void setAccess(a)}
                  className={cn(
                    'rounded-md px-3 py-1 text-[13px] text-muted-foreground',
                    access === a && 'bg-accent font-medium text-foreground',
                  )}
                >
                  {t(`mcp.${a}`)}
                </button>
              ))}
            </div>
          </div>
          {access === 'write' ? (
            <p className="max-w-md text-xs text-muted-foreground">{t('mcp.writeNote')}</p>
          ) : null}
          {info && !info.built ? (
            <p className="text-sm text-muted-foreground">{t('mcp.notBuilt')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={access === 'off'}
                onClick={() => void connect('claude')}
              >
                <Plug />
                {t('mcp.claude')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={access === 'off'}
                onClick={() => void connect('cursor')}
              >
                <Plug />
                {t('mcp.cursor')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void copy()}>
                <Copy />
                {t('mcp.copy')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
