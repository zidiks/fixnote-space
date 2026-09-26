import { type Recurrence, type Weekday, weekdayOf } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
} from '@fixnote/ui'
import { useState } from 'react'
import { weekdayNames } from './recurring'

type Kind = 'none' | Recurrence['kind']
const KINDS: Kind[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'interval']

/**
 * How a task of a daily note repeats. Defaults follow the note's date: its weekday, its day of
 * the month, and counting "every N days" from it.
 */
export function RepeatDialog({
  date,
  rule,
  onSave,
  onClose,
}: {
  /** The daily note's date, YYYY-MM-DD. */
  date: string
  rule: Recurrence | null
  onSave: (rule: Recurrence | null) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<Kind>(rule?.kind ?? 'none')
  const [days, setDays] = useState<Weekday[]>(
    rule?.kind === 'weekly' ? rule.days : [weekdayOf(date)],
  )
  const [monthDay, setMonthDay] = useState(
    rule?.kind === 'monthly' ? rule.day : Number(date.slice(8, 10)),
  )
  const [every, setEvery] = useState(rule?.kind === 'interval' ? rule.every : 2)

  const result = (): Recurrence | null => {
    switch (kind) {
      case 'none':
        return null
      case 'daily':
      case 'weekdays':
        return { kind }
      case 'weekly':
        return { kind, days }
      case 'monthly':
        return { kind, day: Math.min(31, Math.max(1, monthDay || 1)) }
      case 'interval':
        return {
          kind,
          every: Math.min(365, Math.max(1, every || 1)),
          from: rule?.kind === 'interval' ? rule.from : date,
        }
    }
  }
  const invalid = kind === 'weekly' && days.length === 0

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md p-6">
        <DialogTitle className="font-semibold">{t('repeat.title')}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {t('repeat.body')}
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (invalid) return
            onSave(result())
          }}
        >
          <div role="radiogroup" aria-label={t('repeat.title')} className="space-y-1">
            {KINDS.map((k) => (
              <label
                key={k}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted',
                  kind === k && 'bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="repeat"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="size-4 accent-brand"
                />
                {t(`repeat.${k}`)}
              </label>
            ))}
          </div>
          {kind === 'weekly' ? (
            <div className="flex flex-wrap gap-1.5">
              {weekdayNames().map((d) => {
                const on = days.includes(d.key)
                return (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDays((cur) => (on ? cur.filter((x) => x !== d.key) : [...cur, d.key]))
                    }
                    className={cn(
                      'h-8 min-w-10 rounded-md border px-2 text-sm capitalize transition-colors',
                      on
                        ? 'border-brand bg-brand text-brand-foreground'
                        : 'bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {d.name}
                  </button>
                )
              })}
            </div>
          ) : null}
          {kind === 'monthly' || kind === 'interval' ? (
            <label htmlFor="repeat-number" className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {kind === 'monthly' ? t('repeat.monthDay') : t('repeat.everyDays')}
              </span>
              <Input
                id="repeat-number"
                type="number"
                min={1}
                max={kind === 'monthly' ? 31 : 365}
                className="h-8 w-20"
                value={kind === 'monthly' ? monthDay : every}
                onChange={(e) =>
                  (kind === 'monthly' ? setMonthDay : setEvery)(Number(e.currentTarget.value))
                }
              />
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={invalid}>
              {t('repeat.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
