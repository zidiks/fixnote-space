import type { TidySuggestion } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileText, LoaderCircle, WandSparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useUi } from '../app/store'
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
  { kind: 'tag', label: 'tidy.groupTag' },
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
  const [busy, setBusy] = useState(false)
  const pending = useTidy((s) => s.pending)
  // Keyed by the count, so a background run shows up without a manual refresh.
  const list =
    useQuery({ queryKey: [...TIDY_KEY, pending], queryFn: () => tidy.pending() }).data ?? []

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const reject = (s: TidySuggestion) =>
    act(async () => {
      await tidy.reject(s.id)
      await qc.invalidateQueries({ queryKey: TIDY_KEY })
      await refreshTidyCount(tidy)
    })

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-8 pb-24 sm:px-10">
      <div className="flex items-start gap-3">
        <WandSparkles className="mt-1 size-5 text-brand" />
        <div className="flex-1 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{t('tidy.title')}</h1>
          <p className="max-w-xl text-sm text-muted-foreground">{t('tidy.intro')}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={running}
          onClick={async () => {
            await runTidy(tidy, kvStore(driver))
            await qc.invalidateQueries({ queryKey: TIDY_KEY })
          }}
        >
          {running ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
          {running ? t('tidy.finding') : t('tidy.find')}
        </Button>
        {list.length > 1 ? (
          <Button disabled={busy} onClick={() => void act(() => accept(list))}>
            <Check />
            {t('tidy.acceptAll')}
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
                    disabled={busy}
                    onClick={() => void reject(s)}
                    aria-label={t('tidy.reject')}
                  >
                    <X />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act(() => accept([s]))}
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
