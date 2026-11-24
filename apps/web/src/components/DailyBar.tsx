import {
  addTasks,
  type DailyTask,
  mergeTaskItems,
  type Note,
  openTaskItems,
  withoutTasks,
} from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ListTodo } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { useDb, useRepo } from '../lib/db'
import { kvStore } from '../lib/kv'
import { addDays, keys, localDate, useInvalidateNotes, useOpenDaily } from '../lib/queries'

const CARRY_LOOKBACK_DAYS = 30

const dayLabel = (date: string, lang: string | undefined) =>
  new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00`),
  )

/** Previous / next day links of a daily note (forward into the coming days too), and the offer to carry over unfinished tasks. */
export function DailyBar({ note }: { note: Note }) {
  const { t, i18n } = useTranslation()
  const repo = useRepo()
  const date = note.dailyDate as string
  const today = localDate()
  const navigate = useUi((s) => s.navigate)
  const openDaily = useOpenDaily()
  const adjacent = useQuery({
    queryKey: ['daily-adjacent', date],
    queryFn: async () => ({
      before: await repo.adjacentDaily(date, 'before'),
      after: await repo.adjacentDaily(date, 'after'),
    }),
    staleTime: 0,
  }).data
  const before = adjacent?.before
  const after = adjacent?.after
  // In the past: the next note that exists, up to today. From today on: the next day, made on click.
  const next: { id: string | null; date: string } | null = !adjacent
    ? null
    : date < today
      ? after && after.dailyDate <= today
        ? { id: after.id, date: after.dailyDate }
        : { id: null, date: today }
      : after?.dailyDate === addDays(date, 1)
        ? { id: after.id, date: after.dailyDate }
        : { id: null, date: addDays(date, 1) }

  return (
    <>
      <nav className="mt-3 flex items-center justify-between text-[13px] text-muted-foreground">
        {before ? (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            aria-label={t('daily.earlier')}
            onClick={() => navigate({ kind: 'note', id: before.id })}
          >
            <ChevronLeft />
            {dayLabel(before.dailyDate, i18n.resolvedLanguage)}
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2"
            aria-label={t('daily.later')}
            onClick={() =>
              next.id
                ? navigate({ kind: 'note', id: next.id })
                : openDaily.mutate(next.date, {
                    onSuccess: (n) => navigate({ kind: 'note', id: n.id }),
                  })
            }
          >
            {next.date === today
              ? t('daily.toToday')
              : next.date === addDays(today, 1)
                ? t('daily.toTomorrow')
                : dayLabel(next.date, i18n.resolvedLanguage)}
            <ChevronRight />
          </Button>
        ) : null}
      </nav>
      {date === today && before ? <CarryOver today={note} previousId={before.id} /> : null}
    </>
  )
}

/**
 * Offers, once per day, to move unfinished tasks from recent earlier daily notes into today's,
 * preserving nested checklist hierarchy. All notes change through the repo, so sync and an open
 * editor pick it up; Undo puts them back.
 */
function CarryOver({ today, previousId }: { today: Note; previousId: string }) {
  const { t, i18n } = useTranslation()
  const repo = useRepo()
  const { driver } = useDb()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const [moving, setMoving] = useState(false)
  const todayDate = today.dailyDate as string
  const key = `daily.carry.${todayDate}`
  const offer = useQuery({
    queryKey: ['daily-carry', todayDate, previousId],
    queryFn: async () => {
      if (await kvStore(driver).get(key)) return null
      const sources = await repo.earlierDailyWithOpenTasks(todayDate, {
        since: addDays(todayDate, -CARRY_LOOKBACK_DAYS),
        limit: CARRY_LOOKBACK_DAYS,
      })
      if (!sources.length) return null
      const count = mergeTaskItems(...sources.map((s) => s.tasks)).length
      return count ? { sources, count } : null
    },
    staleTime: 0,
  })
  const data = offer.data
  if (!data) return null

  const refresh = async (...notes: Note[]) => {
    for (const n of notes) qc.setQueryData(keys.note(n.id), n)
    await qc.invalidateQueries({ queryKey: ['daily-carry'] })
    await invalidate()
  }

  const move = async () => {
    if (moving) return
    setMoving(true)
    try {
      const [cur, ...loadedSources] = await Promise.all([
        repo.getNote(today.id),
        ...data.sources.map((s) => repo.getNote(s.id)),
      ])
      if (!cur) return
      const entries: { before: Note; tasks: DailyTask[] }[] = []
      for (const src of loadedSources) {
        if (!src) continue
        const tasks = openTaskItems(src.content)
        if (tasks.length) entries.push({ before: src, tasks })
      }
      if (!entries.length) return
      const combined = mergeTaskItems(...entries.map((e) => e.tasks))
      const savedToday = await repo.updateContent(cur.id, addTasks(cur.content, combined), {
        base: cur.content,
      })
      const savedSources = await Promise.all(
        entries.map(async ({ before, tasks }) => ({
          before,
          tasks,
          saved: await repo.updateContent(before.id, withoutTasks(before.content, tasks), {
            base: before.content,
          }),
        })),
      )
      await kvStore(driver).set(key, 'moved')
      await refresh(savedToday, ...savedSources.map((s) => s.saved))
      toast(t('daily.carried', { count: combined.length }), {
        action: {
          label: t('common.undo'),
          onClick: () =>
            void (async () => {
              const [c, ...currentSources] = await Promise.all([
                repo.getNote(today.id),
                ...savedSources.map((s) => repo.getNote(s.before.id)),
              ])
              const restored: Note[] = []
              if (c) {
                // Untouched since the move: the exact old text; edited meanwhile: just the added tasks.
                restored.push(
                  await repo.updateContent(
                    c.id,
                    c.content === savedToday.content
                      ? cur.content
                      : withoutTasks(c.content, combined, { keepFrom: cur.content }),
                    { base: c.content },
                  ),
                )
              }
              for (let i = 0; i < savedSources.length; i++) {
                const entry = savedSources[i]
                const p = currentSources[i]
                if (!entry || !p) continue
                restored.push(
                  await repo.updateContent(
                    p.id,
                    p.content === entry.saved.content
                      ? entry.before.content
                      : addTasks(p.content, entry.tasks),
                    { base: p.content },
                  ),
                )
              }
              await driver.execute('DELETE FROM kv WHERE key = ?', [key])
              await refresh(...restored)
            })(),
        },
      })
    } finally {
      setMoving(false)
    }
  }

  const single = data.sources.length === 1 ? data.sources[0] : null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
      <ListTodo className="size-4 shrink-0 text-brand" />
      <span className="flex-1">
        {single
          ? t('daily.carry', {
              date: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                day: 'numeric',
                month: 'long',
              }).format(new Date(`${single.dailyDate}T12:00:00`)),
              count: data.count,
            })
          : t('daily.carryMany', {
              days: data.sources.length,
              count: data.count,
            })}
      </span>
      <Button size="sm" variant="brand" loading={moving} onClick={() => void move()}>
        {t('daily.carryMove')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={moving}
        onClick={async () => {
          await kvStore(driver).set(key, 'dismissed')
          await qc.invalidateQueries({ queryKey: ['daily-carry'] })
        }}
      >
        {t('daily.carryDismiss')}
      </Button>
    </div>
  )
}
