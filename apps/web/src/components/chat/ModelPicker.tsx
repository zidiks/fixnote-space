import { fitVerdict, LOCAL_LLM_MODELS, type LocalLlmKey } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@fixnote/ui'
import { Check, ChevronDown, Cpu, Settings2, Sparkles } from 'lucide-react'
import { useUi } from '../../app/store'
import { modelOf, saveProvider, useLlm } from '../../lib/assistant/llm'
import { usePlatform } from '../../lib/platform'
import { FitBadge, useHardware } from '../settings/DeviceModels'

const LOCAL_KEYS = Object.keys(LOCAL_LLM_MODELS) as LocalLlmKey[]

/**
 * Which model answers in the chat, by the input: Fixnote AI, a model on this device (installed
 * ones, each with how well it runs here), or the person's own provider as set in Settings → AI.
 */
export function ModelPicker() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const settings = useLlm((s) => s.settings)
  const localOnly = useLlm((s) => s.localOnly)
  const installed = useLlm((s) => s.deviceModels)
  const speed = useLlm((s) => s.deviceSpeed)
  const hw = useHardware()
  const openSettings = useUi((s) => s.openSettings)

  const deviceKey =
    settings.kind === 'device' ? (settings.deviceModel ?? installed.at(-1) ?? 'small') : null
  const label =
    settings.kind === 'fixnote'
      ? 'Fixnote AI'
      : deviceKey
        ? t(`deviceModels.models.${deviceKey}.name`)
        : modelOf(settings) || t('aiProvider.model')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('deviceModels.pick')}
          className="flex max-w-[180px] min-w-0 items-center gap-1 rounded-full border bg-card px-2 py-0.5 font-medium text-foreground hover:bg-accent [&_svg]:size-3 [&_svg]:shrink-0"
        >
          {settings.kind === 'fixnote' ? <Sparkles /> : <Cpu />}
          <span className="truncate">{label}</span>
          <ChevronDown className="opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem
          disabled={localOnly}
          onSelect={() => void saveProvider({ kind: 'fixnote' })}
        >
          <Sparkles />
          <span className="flex-1">Fixnote AI</span>
          <Check className={cn(settings.kind !== 'fixnote' && 'invisible')} />
        </DropdownMenuItem>
        {platform.localLlm &&
          LOCAL_KEYS.filter((k) => installed.includes(k)).map((key) => {
            const verdict = hw ? fitVerdict(key, hw, speed[key]) : null
            return (
              <DropdownMenuItem
                key={key}
                onSelect={() => void saveProvider({ kind: 'device', deviceModel: key })}
              >
                <Cpu />
                <span className="flex-1 truncate">
                  {t(`deviceModels.models.${key}.name`)}
                  <span className="ml-1 text-muted-foreground">· {t('aiProvider.device')}</span>
                </span>
                {verdict && (
                  <FitBadge
                    fit={verdict.fit}
                    measured={verdict.measured}
                    speed={verdict.tokensPerSecond}
                  />
                )}
                <Check className={cn(deviceKey !== key && 'invisible')} />
              </DropdownMenuItem>
            )
          })}
        {settings.kind === 'custom' || settings.kind === 'ollama' ? (
          <DropdownMenuItem onSelect={() => undefined}>
            <Cpu />
            <span className="flex-1 truncate">{modelOf(settings)}</span>
            <Check />
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openSettings('ai')}>
          <Settings2 />
          <span className="flex-1">
            {platform.localLlm && !installed.length
              ? t('deviceModels.installMore')
              : t('aiProvider.openSettings')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
