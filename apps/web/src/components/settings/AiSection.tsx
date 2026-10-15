import { type AiAction, MEMORY_MAX, readMemory, type SqlDriver, writeMemory } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAssistant } from '../../lib/assistant/assistant'
import { AI_LEVELS, AI_MODES, setAiLevel, setAiMode, useLlm } from '../../lib/assistant/llm'
import { useDb } from '../../lib/db'
import { useInvalidateNotes } from '../../lib/queries'
import { formatRelative } from '../../lib/time'
import { McpSection } from './McpSection'
import { ProviderSection } from './ProviderSection'

const AUDIT_KEY = ['audit'] as const

/** The AI activity log: what the AI and connected apps changed, with Undo. */
function AuditLogList() {
  const { t, i18n } = useTranslation()
  const { audit, driver } = useDb()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const actions = useQuery({ queryKey: AUDIT_KEY, queryFn: () => audit.list(200) }).data ?? []

  const undo = async (a: AiAction) => {
    const res = await audit.undo(a.id)
    if (!res.ok) toast(res.reason === 'changed' ? t('audit.changed') : t('audit.undone'))
    await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: AUDIT_KEY })])
    // Undoing "Remembered …" changes what the assistant knows (the editor above shows it).
    if (a.memory) await showMemory(driver)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('audit.title')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('audit.body')}</p>
      </div>
      {actions.length ? (
        <ul className="max-w-xl divide-y rounded-lg border">
          {actions.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm',
                    a.undoneAt && 'text-muted-foreground line-through',
                  )}
                >
                  {a.summary}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelative(a.createdAt, i18n.resolvedLanguage)} · {a.provider}
                </p>
              </div>
              {a.undoneAt ? (
                <span className="text-xs text-muted-foreground">{t('audit.undone')}</span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => void undo(a)}>
                  <Undo2 />
                  {t('audit.undo')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('audit.empty')}</p>
      )}
    </div>
  )
}

/** Reads the assistant's memory into the store the chat and this editor share. */
async function showMemory(db: SqlDriver) {
  useAssistant.setState({ memoryText: await readMemory(db) })
}

/**
 * What the assistant knows about the user (like CLAUDE.md for Claude Code): sent with every
 * message, kept across chats, added to by the assistant's `remember` tool. On this device only.
 */
function AssistantMemorySection() {
  const { t } = useTranslation()
  const { driver } = useDb()
  const qc = useQueryClient()
  const stored = useAssistant((s) => s.memoryText)
  const [text, setText] = useState(stored)
  const [saving, setSaving] = useState(false)
  // What the assistant remembers while the settings are open shows up here too.
  useEffect(() => setText(stored), [stored])
  useEffect(() => {
    void showMemory(driver)
  }, [driver])

  const save = async (next: string) => {
    setSaving(true)
    try {
      await writeMemory(driver, next)
      await showMemory(driver)
      await qc.invalidateQueries({ queryKey: AUDIT_KEY })
      toast(next.trim() ? t('aiMemory.saved') : t('aiMemory.cleared'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('aiMemory.title')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('aiMemory.body')}</p>
      </div>
      <textarea
        value={text}
        maxLength={MEMORY_MAX}
        rows={5}
        placeholder={t('aiMemory.placeholder')}
        aria-label={t('aiMemory.title')}
        onChange={(e) => setText(e.target.value)}
        className="block w-full max-w-xl resize-y rounded-md border bg-transparent px-3 py-2 text-sm pointer-coarse:text-base"
      />
      <p className="max-w-xl text-xs text-muted-foreground">{t('aiMemory.local')}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={saving}
          disabled={text.trim() === stored.trim()}
          onClick={() => void save(text)}
        >
          {t('aiMemory.save')}
        </Button>
        {stored ? (
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => void save('')}>
            {t('aiMemory.clear')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** How AI changes reach notes: ask every time, accept edits, or auto (like Claude Code). */
function AiModeSection() {
  const { t } = useTranslation()
  const mode = useLlm((s) => s.mode)
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('aiMode.title')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('aiMode.body')}</p>
      </div>
      <div role="radiogroup" aria-label={t('aiMode.title')} className="max-w-xl space-y-2">
        {AI_MODES.map((m) => (
          <label
            key={m}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5',
              mode === m && 'border-brand/50 bg-brand/5',
            )}
          >
            <input
              type="radio"
              name="ai-mode"
              className="mt-1 size-4 accent-brand"
              checked={mode === m}
              onChange={() => void setAiMode(m)}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t(`aiMode.${m}`)}</span>
              <span className="block text-sm text-muted-foreground">{t(`aiMode.${m}Body`)}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

/** How hard FixNote AI thinks in the chat; only for FixNote AI (other models are chosen above). */
function AiLevelSection() {
  const { t } = useTranslation()
  const level = useLlm((s) => s.level)
  const fixnote = useLlm((s) => s.settings.kind === 'fixnote')
  if (!fixnote) return null
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('aiLevel.title')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('aiLevel.body')}</p>
      </div>
      <div role="radiogroup" aria-label={t('aiLevel.title')} className="max-w-xl space-y-2">
        {AI_LEVELS.map((l) => (
          <label
            key={l}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5',
              level === l && 'border-brand/50 bg-brand/5',
            )}
          >
            <input
              type="radio"
              name="ai-level"
              className="mt-1 size-4 accent-brand"
              checked={level === l}
              onChange={() => void setAiLevel(l)}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t(`aiLevel.${l}`)}</span>
              <span className="block text-sm text-muted-foreground">{t(`aiLevel.${l}Body`)}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export function AiSection() {
  return (
    <div className="space-y-8">
      <ProviderSection />
      <AiLevelSection />
      <AiModeSection />
      <AssistantMemorySection />
      <McpSection />
      <AuditLogList />
    </div>
  )
}
