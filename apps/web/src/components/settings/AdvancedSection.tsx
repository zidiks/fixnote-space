import {
  type ModelInfo,
  type Platform,
  SEARCH_MODEL,
  SPEECH_MODELS,
  type SpeechModelKey,
} from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn } from '@fixnote/ui'
import { Download, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { fileSize } from '../../lib/attachments'
import { usePlatform } from '../../lib/platform'

type Kind = 'search' | SpeechModelKey

const ROWS: { kind: Kind; model: ModelInfo }[] = [
  { kind: 'search', model: SEARCH_MODEL },
  ...(Object.keys(SPEECH_MODELS) as SpeechModelKey[]).map((kind) => ({
    kind,
    model: SPEECH_MODELS[kind],
  })),
]

/** Loads the model the way using it would, so the files land where the app looks for them. */
async function download(platform: Platform, kind: Kind, onProgress: (p: number) => void) {
  if (kind === 'search') {
    const embedder = await platform.embedder()
    await embedder.ready(onProgress)
    return
  }
  const transcriber = await platform.transcriber()
  transcriber.setModel?.(SPEECH_MODELS[kind].id)
  await transcriber.ready(onProgress)
}

async function unload(platform: Platform, kind: Kind) {
  if (kind === 'search') (await platform.embedder()).unload?.()
  else {
    const transcriber = await platform.transcriber()
    if (transcriber.modelId === SPEECH_MODELS[kind].id) transcriber.unload?.()
  }
}

/** Settings → Advanced: the models that run on this device, with their size on disk. */
function ModelsSection() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const models = platform.models
  const [sizes, setSizes] = useState<Record<string, number>>({})
  const [speech, setSpeech] = useState<string | null>(null)
  const [busy, setBusy] = useState<{ kind: Kind; progress: number | null } | null>(null)

  const refresh = useCallback(async () => {
    if (!models) return
    const entries = await Promise.all(
      ROWS.map(async ({ model }) => [model.id, await models.size(model.id)] as const),
    )
    setSizes(Object.fromEntries(entries))
  }, [models])

  useEffect(() => {
    void refresh()
    void platform.transcriber().then((tr) => setSpeech(tr.modelId))
  }, [platform, refresh])

  const choose = async (kind: SpeechModelKey) => {
    const transcriber = await platform.transcriber()
    transcriber.setModel?.(SPEECH_MODELS[kind].id)
    setSpeech(transcriber.modelId)
  }

  const load = async (kind: Kind) => {
    setBusy({ kind, progress: null })
    try {
      await download(platform, kind, (p) => setBusy({ kind, progress: p }))
      if (kind !== 'search') setSpeech(SPEECH_MODELS[kind].id)
    } catch (err) {
      toast(t('models.failed', { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(null)
      await refresh()
    }
  }

  const remove = async (kind: Kind, model: ModelInfo) => {
    if (!models) return
    setBusy({ kind, progress: null })
    try {
      await models.remove(model.id)
      await unload(platform, kind)
    } finally {
      setBusy(null)
      await refresh()
    }
  }

  const row = (kind: Kind, model: ModelInfo) => {
    const size = sizes[model.id] ?? 0
    const mine = busy?.kind === kind
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {size > 0
            ? t('models.downloaded', { size: fileSize(size) })
            : fileSize(model.approxBytes)}
        </span>
        {size > 0 ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('models.remove')}
            title={t('models.remove')}
            loading={mine}
            disabled={busy !== null && !mine}
            onClick={() => void remove(kind, model)}
          >
            <Trash2 />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            loading={mine}
            disabled={busy !== null && !mine}
            onClick={() => void load(kind)}
          >
            {mine ? null : <Download />}
            {mine && busy.progress !== null
              ? t('models.loading', { percent: Math.round(busy.progress * 100) })
              : t('models.load')}
          </Button>
        )}
      </div>
    )
  }

  const search = ROWS[0]
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('models.title')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('models.body')}</p>
      </div>

      {search ? (
        <div className="flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5">
          <span className="min-w-0 flex-1 basis-48 space-y-0.5">
            <span className="block text-sm font-medium">{t('models.search')}</span>
            <span className="block text-sm text-muted-foreground">{t('models.searchBody')}</span>
          </span>
          {row(search.kind, search.model)}
        </div>
      ) : null}

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t('models.speech')}</h4>
        <div role="radiogroup" aria-label={t('models.speech')} className="max-w-xl space-y-2">
          {(Object.keys(SPEECH_MODELS) as SpeechModelKey[]).map((kind) => {
            const model = SPEECH_MODELS[kind]
            const active = speech === model.id
            return (
              <div
                key={kind}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5',
                  active && 'border-brand/50 bg-brand/5',
                )}
              >
                <label className="flex min-w-0 flex-1 basis-48 cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="speech-model"
                    className="mt-1 size-4 accent-brand"
                    checked={active}
                    onChange={() => void choose(kind)}
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{t(`models.${kind}`)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {t(`models.${kind}Body`)}
                    </span>
                  </span>
                </label>
                {row(kind, model)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function AdvancedSection() {
  return (
    <div className="space-y-8">
      <ModelsSection />
    </div>
  )
}
