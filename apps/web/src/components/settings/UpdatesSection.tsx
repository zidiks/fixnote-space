import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { useDb } from '../../lib/db'
import { kvStore } from '../../lib/kv'
import { usePlatform } from '../../lib/platform'
import { AUTO_UPDATE, checkForUpdate, installUpdate, useUpdates } from '../../lib/updates'

/** Version, automatic checks and "check now" (desktop app only). */
export function UpdatesSection() {
  const { t } = useTranslation()
  const updater = usePlatform().updater
  const { driver } = useDb()
  const qc = useQueryClient()
  const phase = useUpdates((s) => s.phase)
  const info = useQuery({
    queryKey: ['updates', 'info'],
    queryFn: () => updater?.info() ?? null,
    enabled: Boolean(updater),
  }).data
  const auto = useQuery({
    queryKey: ['kv', AUTO_UPDATE],
    queryFn: async () => (await kvStore(driver).get(AUTO_UPDATE)) !== '0',
  }).data
  if (!updater || !info) return null

  return (
    <div className="space-y-2 border-t pt-5">
      <h3 className="font-medium">{t('updates.title')}</h3>
      <p className="text-sm text-muted-foreground">
        {t('updates.version', { version: info.version })}
        {info.store
          ? ` · ${t('updates.store')}`
          : info.enabled
            ? ''
            : ` · ${t('updates.devBuild')}`}
      </p>
      {info.enabled ? (
        <>
          <label className="flex max-w-lg items-center gap-3 pt-1">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={auto ?? true}
              onChange={(e) => {
                const on = e.target.checked
                qc.setQueryData(['kv', AUTO_UPDATE], on)
                void kvStore(driver).set(AUTO_UPDATE, on ? '1' : '0')
              }}
            />
            <span className="text-sm">{t('updates.auto')}</span>
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {phase.kind === 'available' ? (
              <Button size="sm" onClick={() => void installUpdate(phase.update)}>
                <Download />
                {t('updates.installVersion', { version: phase.update.version })}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={phase.kind === 'installing'}
                loading={phase.kind === 'checking'}
                onClick={() => void checkForUpdate(updater, false)}
              >
                <RefreshCw />
                {t('updates.check')}
              </Button>
            )}
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {phase.kind === 'checking'
                ? t('updates.checking')
                : phase.kind === 'latest'
                  ? t('updates.latest')
                  : phase.kind === 'installing'
                    ? phase.progress === null
                      ? t('updates.downloading', { version: phase.version })
                      : t('updates.downloadingPct', {
                          version: phase.version,
                          pct: Math.round(phase.progress * 100),
                        })
                    : phase.kind === 'failed'
                      ? t('updates.failed', { message: phase.message })
                      : ''}
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}
