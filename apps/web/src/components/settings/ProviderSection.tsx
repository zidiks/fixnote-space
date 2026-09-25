import { streamChat } from '@fixnote/ai'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn, Input } from '@fixnote/ui'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, LoaderCircle, RefreshCw } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { unavailableText } from '../../lib/assistant/assistant'
import {
  baseUrlOf,
  llm,
  modelOf,
  ollamaModels,
  PRESETS,
  type Preset,
  type ProviderKind,
  saveApiKey,
  saveProvider,
  setLocalOnly,
  useLlm,
} from '../../lib/assistant/llm'
import { usePlatform } from '../../lib/platform'

function Choice({
  active,
  disabled,
  title,
  body,
  onSelect,
}: {
  active: boolean
  disabled?: boolean
  title: string
  body: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full max-w-xl flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
        active ? 'border-brand/60 bg-brand/5' : 'hover:bg-accent',
        disabled && 'opacity-50',
      )}
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex max-w-xl items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Which model answers: FixNote AI, the user's own OpenAI-compatible key, or Ollama. */
export function ProviderSection() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const desktop = platform.kind === 'desktop'
  const settings = useLlm((s) => s.settings)
  const localOnly = useLlm((s) => s.localOnly)
  const hasKey = useLlm((s) => s.hasKey)
  const [key, setKey] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text?: string }>({
    state: 'idle',
  })
  const models = useQuery({
    queryKey: ['ollama-models', baseUrlOf(settings)],
    queryFn: () => ollamaModels(baseUrlOf(settings)),
    enabled: settings.kind === 'ollama' && desktop,
    retry: false,
  })

  const choose = (kind: ProviderKind) => {
    setTest({ state: 'idle' })
    void saveProvider({ kind, ...(kind === 'ollama' ? { baseUrl: '', model: '' } : {}) })
  }

  const check = async () => {
    setTest({ state: 'running' })
    const reach = await llm()
    if (!reach.ok) {
      setTest({ state: 'fail', text: unavailableText(reach.reason) })
      return
    }
    try {
      let reply = ''
      for await (const d of streamChat({
        ...reach.route,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
        maxTokens: 5,
        temperature: 0,
        signal: AbortSignal.timeout(30_000),
      })) {
        reply += d
      }
      setTest({
        state: 'ok',
        text:
          t('aiProvider.works', { model: reach.route.model }) + (reply ? ` «${reply.trim()}»` : ''),
      })
    } catch (err) {
      setTest({
        state: 'fail',
        text: t('aiProvider.failed', { message: err instanceof Error ? err.message : String(err) }),
      })
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium">{t('aiProvider.title')}</h3>
      <div className="space-y-2">
        <Choice
          active={settings.kind === 'fixnote'}
          disabled={localOnly}
          title={t('aiProvider.fixnote')}
          body={t('aiProvider.fixnoteBody')}
          onSelect={() => choose('fixnote')}
        />
        <Choice
          active={settings.kind === 'custom'}
          disabled={localOnly}
          title={t('aiProvider.custom')}
          body={t('aiProvider.customBody')}
          onSelect={() => choose('custom')}
        />
        <Choice
          active={settings.kind === 'ollama'}
          disabled={!desktop}
          title={t('aiProvider.ollama')}
          body={
            desktop
              ? t('aiProvider.ollamaBody')
              : `${t('aiProvider.ollamaBody')} ${t('aiProvider.desktopOnly')}`
          }
          onSelect={() => choose('ollama')}
        />
      </div>

      {settings.kind === 'custom' ? (
        <div className="space-y-2 pt-1">
          <Field label={t('aiProvider.provider')}>
            <select
              value={settings.preset}
              onChange={(e) => void saveProvider({ preset: e.target.value as Preset, model: '' })}
              className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
            >
              {(Object.keys(PRESETS) as Exclude<Preset, 'other'>[]).map((p) => (
                <option key={p} value={p}>
                  {PRESETS[p].name}
                </option>
              ))}
              <option value="other">{t('aiProvider.other')}</option>
            </select>
          </Field>
          {settings.preset === 'other' ? (
            <Field label={t('aiProvider.address')}>
              <Input
                value={settings.baseUrl}
                placeholder="https://example.com/v1"
                onChange={(e) => void saveProvider({ baseUrl: e.target.value })}
              />
            </Field>
          ) : null}
          <Field label={t('aiProvider.model')}>
            <Input
              value={settings.model}
              placeholder={modelOf({ ...settings, model: '' }) || 'model-name'}
              onChange={(e) => void saveProvider({ model: e.target.value })}
            />
          </Field>
          <Field label={t('aiProvider.key')}>
            {hasKey && !editingKey ? (
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="size-4 text-muted-foreground" />
                <span className="flex-1 text-muted-foreground">{t('aiProvider.keySaved')}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditingKey(true)}>
                  {t('aiProvider.replaceKey')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void saveApiKey(null)}>
                  {t('aiProvider.removeKey')}
                </Button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveApiKey(key).then(() => {
                    setKey('')
                    setEditingKey(false)
                  })
                }}
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder="sk-…"
                  onChange={(e) => setKey(e.target.value)}
                  aria-label={t('aiProvider.key')}
                />
                <Button type="submit" size="sm" disabled={!key.trim()}>
                  {t('aiProvider.saveKey')}
                </Button>
              </form>
            )}
          </Field>
        </div>
      ) : null}

      {settings.kind === 'ollama' && desktop ? (
        <div className="space-y-2 pt-1">
          <Field label={t('aiProvider.address')}>
            <Input
              value={settings.baseUrl}
              placeholder="http://localhost:11434"
              onChange={(e) => void saveProvider({ baseUrl: e.target.value })}
            />
          </Field>
          <Field label={t('aiProvider.model')}>
            <div className="flex gap-2">
              <select
                value={settings.model}
                onChange={(e) => void saveProvider({ model: e.target.value })}
                className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">—</option>
                {(models.data ?? []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void models.refetch()}
                aria-label={t('aiProvider.refresh')}
              >
                <RefreshCw className={cn(models.isFetching && 'animate-spin')} />
              </Button>
            </div>
            {models.isError ? (
              <p className="mt-1 text-xs text-destructive">
                {models.error instanceof Error ? models.error.message : String(models.error)}
              </p>
            ) : models.data && !models.data.length ? (
              <p className="mt-1 text-xs text-muted-foreground">{t('aiProvider.noModels')}</p>
            ) : null}
          </Field>
        </div>
      ) : null}

      {settings.kind !== 'fixnote' ? (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={test.state === 'running'}
            onClick={() => void check()}
          >
            {test.state === 'running' ? <LoaderCircle className="animate-spin" /> : null}
            {test.state === 'running' ? t('aiProvider.testing') : t('aiProvider.test')}
          </Button>
          {test.text ? (
            <span
              className={cn(
                'text-sm',
                test.state === 'fail' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {test.text}
            </span>
          ) : null}
        </div>
      ) : null}

      {desktop ? (
        <label className="flex max-w-xl cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5">
          <input
            type="checkbox"
            checked={localOnly}
            onChange={(e) => void setLocalOnly(e.target.checked)}
            className="mt-1 accent-brand"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{t('aiProvider.localOnly')}</span>
            <span className="block text-xs text-muted-foreground">
              {t('aiProvider.localOnlyBody')}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  )
}
