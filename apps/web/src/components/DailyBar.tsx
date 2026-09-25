import { addTasks, type Note, openTasks, withoutTasks } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ListTodo } from 'lucide-react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { useDb, useRepo } from '../lib/db'
import { kvStore } from '../lib/kv'
import { keys, localDate, useInvalidateNotes, useOpenDaily } from '../lib/queries'

const dayLabel = (date: string, lang: string | undefined) =>
  new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00`),
  )

/** Previous / next day links of a daily note, and the offer to carry over unfinished tasks. */
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
        {after ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2"
            aria-label={t('daily.later')}
            onClick={() => navigate({ kind: 'note', id: after.id })}
          >
            {after.dailyDate === today
              ? t('daily.toToday')
              : dayLabel(after.dailyDate, i18n.resolvedLanguage)}
            <ChevronRight />
          </Button>
        ) : date < today ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2"
            onClick={() =>
              openDaily.mutate(undefined, {
                onSuccess: (n) => navigate({ kind: 'note', id: n.id }),
              })
            }
          >
            {t('daily.toToday')}
            <ChevronRight />
          </Button>
        ) : null}
      </nav>
      {date === today && before ? <CarryOver today={note} previousId={before.id} /> : null}
    </>
  )
}

/**
 * Offers, once per day, to move the previous daily note's unfinished tasks into today's. Both notes
 * change through the repo, so sync and an open editor pick it up; Undo puts them back.
 */
function CarryOver({ today, previousId }: { today: Note; previousId: string }) {
  const { t, i18n } = useTranslation()
  const repo = useRepo()
  const { driver } = useDb()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const key = `daily.carry.${today.dailyDate}`
  const offer = useQuery({
    queryKey: ['daily-carry', today.dailyDate, previousId],
    queryFn: async () => {
      if (await kvStore(driver).get(key)) return null
      const prev = await repo.getNote(previousId)
      const tasks = prev ? openTasks(prev.content) : []
      return prev && tasks.length ? { date: prev.dailyDate as string, tasks } : null
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
    const [cur, prev] = await Promise.all([repo.getNote(today.id), repo.getNote(previousId)])
    if (!cur || !prev) return
    const tasks = openTasks(prev.content)
    const had = new Set(openTasks(cur.content))
    const added = tasks.filter((x) => !had.has(x))
    const savedToday = await repo.updateContent(cur.id, addTasks(cur.content, tasks), {
      base: cur.content,
    })
    const savedPrev = await repo.updateContent(prev.id, withoutTasks(prev.content, tasks), {
      base: prev.content,
    })
    await kvStore(driver).set(key, 'moved')
    await refresh(savedToday, savedPrev)
    toast(t('daily.carried', { count: tasks.length }), {
      action: {
        label: t('common.undo'),
        onClick: () =>
          void (async () => {
            const [c, p] = await Promise.all([repo.getNote(today.id), repo.getNote(previousId)])
            if (!c || !p) return
            // Untouched since the move: the exact old text; edited meanwhile: just the tasks.
            const back = await Promise.all([
              repo.updateContent(
                c.id,
                c.content === savedToday.content ? cur.content : withoutTasks(c.content, added),
                { base: c.content },
              ),
              repo.updateContent(
                p.id,
                p.content === savedPrev.content ? prev.content : addTasks(p.content, tasks),
                { base: p.content },
              ),
            ])
            await driver.execute('DELETE FROM kv WHERE key = ?', [key])
            await refresh(...back)
          })(),
      },
    })
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
      <ListTodo className="size-4 shrink-0 text-brand" />
      <span className="flex-1">
        {t('daily.carry', {
          date: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
            day: 'numeric',
            month: 'long',
          }).format(new Date(`${data.date}T12:00:00`)),
          count: data.tasks.length,
        })}
      </span>
      <Button size="sm" variant="brand" onClick={() => void move()}>
        {t('daily.carryMove')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
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
