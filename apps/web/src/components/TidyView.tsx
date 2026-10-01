import type { TidySuggestion } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileText, LoaderCircle, WandSparkles, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { useLlm } from '../lib/assistant/llm'
import {
  acceptWithUndo,
  describeSuggestion,
  refreshTidyCount,
  runTidy,
  useTidy,
} from '../lib/assistant/tidy'
import { useDb } from '../lib/db'
import { kvStore } from '../lib/kv'
import { useInvalidateNotes } from '../lib/queries'

const GROUPS = [
  { kind: 'move', label: 'tidy.groupMove' },
  { kind: 'title', label: 'tidy.groupTitle' },
  { kind: 'merge', label: 'tidy.groupMerge' },
] as const satisfies readonly { kind: TidySuggestion['kind']; label: string }[]

export const TIDY_KEY = ['tidy', 'pending'] as const

/** Accepting suggestions with an Undo toast; shared by the Tidy screen and note toasts. */
export function useAcceptSuggestions() {
  const { tidy, audit } = useDb()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const refresh = async () => {
    await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: TIDY_KEY })])
  }
  return (list: TidySuggestion[]) => acceptWithUndo(list, { tidy, audit, refresh })
}

/** Suggestions from Tidy, grouped by kind; each can be accepted or rejected. */
export function TidyView() {
  const { t } = useTranslation()
  const { tidy, driver } = useDb()
  const qc = useQueryClient()
  const navigate = useUi((s) => s.navigate)
  const running = useTidy((s) => s.running)
  const error = useTidy((s) => s.error)
  const accept = useAcceptSuggestions()
  // The action running now: its button shows a spinner.
  const [busy, setBusy] = useState<string | null>(null)
  const pending = useTidy((s) => s.pending)
  // Keyed by the count, so a background run shows up without a manual refresh.
  const list =
    useQuery({ queryKey: [...TIDY_KEY, pending], queryFn: () => tidy.pending() }).data ?? []

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }
  const reject = (s: TidySuggestion) =>
    act(`reject:${s.id}`, async () => {
      await tidy.reject(s.id)
      await qc.invalidateQueries({ queryKey: TIDY_KEY })
      await refreshTidyCount(tidy)
    })
  // Undo goes through the store directly: the toast may outlive this view.
  const rejectAll = () =>
    act('reject-all', async () => {
      const ids = list.map((s) => s.id)
      await tidy.rejectAll(ids)
      await qc.invalidateQueries({ queryKey: TIDY_KEY })
      await refreshTidyCount(tidy)
      toast(t('tidy.rejectedAll', { count: ids.length }), {
        action: {
          label: t('common.undo'),
          onClick: () =>
            void tidy
              .unreject(ids)
              .then(() => qc.invalidateQueries({ queryKey: TIDY_KEY }))
              .then(() => refreshTidyCount(tidy)),
        },
      })
    })

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-8 pb-24 sm:px-10">
      <div className="space-y-1.5">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <WandSparkles className="size-5 shrink-0 text-brand" />
          {t('tidy.title')}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">{t('tidy.intro')}</p>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={running}
          onClick={async () => {
            await runTidy(tidy, kvStore(driver))
            await qc.invalidateQueries({ queryKey: TIDY_KEY })
            // Auto mode: what was found is applied at once (Undo in the toast).
            if (useLlm.getState().mode === 'auto') {
              const found = await tidy.pending()
              if (found.length) await accept(found)
            }
          }}
        >
          {running ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
          {running ? t('tidy.finding') : t('tidy.find')}
        </Button>
        {list.length > 1 ? (
          <Button
            disabled={busy !== null}
            loading={busy === 'all'}
            onClick={() => void act('all', () => accept(list))}
          >
            <Check />
            {t('tidy.acceptAll')}
          </Button>
        ) : null}
        {list.length > 1 ? (
          <Button
            variant="ghost"
            disabled={busy !== null}
            loading={busy === 'reject-all'}
            onClick={() => void rejectAll()}
          >
            <X />
            {t('tidy.rejectAll')}
          </Button>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {!list.length && !running ? (
        <p className="mt-10 text-sm text-muted-foreground">{t('tidy.empty')}</p>
      ) : null}

      {GROUPS.map(({ kind, label }) => {
        const items = list.filter((s) => s.kind === kind)
        if (!items.length) return null
        return (
          <section key={kind} className="mt-8">
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t(label)}
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {items.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => navigate({ kind: 'note', id: s.noteId })}
                      className="block max-w-full truncate text-left text-sm font-medium hover:underline"
                    >
                      {s.noteTitle || t('common.untitled')}
                    </button>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {describeSuggestion(s)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    loading={busy === `reject:${s.id}`}
                    onClick={() => void reject(s)}
                    aria-label={t('tidy.reject')}
                  >
                    <X />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    loading={busy === `accept:${s.id}`}
                    onClick={() => void act(`accept:${s.id}`, () => accept([s]))}
                  >
                    <Check />
                    {t('tidy.accept')}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
