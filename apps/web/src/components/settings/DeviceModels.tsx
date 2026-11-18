import {
  type DeviceFit,
  type DeviceHardware,
  fitVerdict,
  LOCAL_LLM_MODELS,
  type LocalLlmKey,
} from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn } from '@fixnote/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  installDeviceModel,
  removeDeviceModel,
  saveProvider,
  useLlm,
} from '../../lib/assistant/llm'
import { usePlatform } from '../../lib/platform'

const KEYS = Object.keys(LOCAL_LLM_MODELS) as LocalLlmKey[]

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(bytes < 1e9 ? 1 : 1)} GB`

const FIT_STYLE: Record<DeviceFit, string> = {
  good: 'bg-success/15 text-success',
  ok: 'bg-brand/15 text-brand',
  slow: 'bg-destructive/15 text-destructive',
}

/** The badge: how well a model runs here, measured after its download or guessed before. */
export function FitBadge({
  fit,
  measured,
  speed,
}: {
  fit: DeviceFit
  measured: boolean
  speed?: number | undefined
}) {
  const { t } = useTranslation()
  return (
    <span
      className={cn('rounded-full px-2 py-0.5 text-xs font-medium', FIT_STYLE[fit])}
      title={measured ? t('deviceModels.measured') : t('deviceModels.guessed')}
    >
      {t(`deviceModels.fit.${fit}`)}
      {measured && speed ? ` · ${Math.round(speed)} ${t('deviceModels.perSecond')}` : ''}
    </span>
  )
}

/** This device's hardware, read once (WebGPU adapter, memory, cores). */
export function useHardware(): DeviceHardware | undefined {
  const platform = usePlatform()
  return useQuery({
    queryKey: ['device-hardware'],
    queryFn: () => platform.localLlm?.().hardware() ?? null,
    staleTime: Number.POSITIVE_INFINITY,
    enabled: Boolean(platform.localLlm),
  }).data as DeviceHardware | undefined
}

/**
 * Settings → AI → On this device: the models that run in the app itself, each with its size, how
 * well it fits this device, and Install / Use / Remove. Installing downloads it once and measures
 * its speed here.
 */
export function DeviceModels() {
  const { t } = useTranslation()
  const settings = useLlm((s) => s.settings)
  const installed = useLlm((s) => s.deviceModels)
  const speed = useLlm((s) => s.deviceSpeed)
  const hw = useHardware()
  const [busy, setBusy] = useState<{ key: LocalLlmKey; progress: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = settings.kind === 'device' ? (settings.deviceModel ?? installed.at(-1)) : null

  const install = async (key: LocalLlmKey) => {
    setError(null)
    setBusy({ key, progress: 0 })
    try {
      await installDeviceModel(key, (progress) => setBusy({ key, progress }))
      setBusy({ key, progress: null })
      await saveProvider({ kind: 'device', deviceModel: key })
    } catch (err) {
      setError(
        t('deviceModels.failed', { message: err instanceof Error ? err.message : String(err) }),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-xl space-y-2 pt-1">
      <p className="text-xs text-muted-foreground">{t('deviceModels.intro')}</p>
      {KEYS.map((key) => {
        const model = LOCAL_LLM_MODELS[key]
        const has = installed.includes(key)
        const verdict = hw ? fitVerdict(key, hw, speed[key]) : null
        const mine = busy?.key === key
        return (
          <div
            key={key}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3.5 py-2.5',
              current === key && 'border-brand/60 bg-brand/5',
            )}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t(`deviceModels.models.${key}.name`)}</span>
                {verdict && (
                  <FitBadge
                    fit={verdict.fit}
                    measured={verdict.measured}
                    speed={verdict.tokensPerSecond}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(`deviceModels.models.${key}.body`)} · {gb(model.approxBytes)}
              </p>
              {mine && (
                <p className="text-xs text-muted-foreground">
                  {busy.progress === null || busy.progress >= 1
                    ? t('deviceModels.measuring')
                    : t('deviceModels.downloading', { percent: Math.round(busy.progress * 100) })}
                </p>
              )}
            </div>
            {has ? (
              <div className="flex shrink-0 gap-2">
                {current !== key && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void saveProvider({ kind: 'device', deviceModel: key })}
                  >
                    {t('deviceModels.use')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busy)}
                  onClick={() => void removeDeviceModel(key)}
                >
                  {t('deviceModels.remove')}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="shrink-0"
                loading={mine}
                disabled={Boolean(busy) && !mine}
                onClick={() => void install(key)}
              >
                {t('deviceModels.install')}
              </Button>
            )}
          </div>
        )
      })}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{t('deviceModels.fallback')}</p>
    </div>
  )
}
