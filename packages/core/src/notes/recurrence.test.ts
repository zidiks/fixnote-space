import { describe, expect, it } from 'vitest'
import {
  applyTaskRule,
  dueRecurringTasks,
  formatRecurrence,
  parseRecurrence,
  type Recurrence,
  recursOn,
  setTaskRecurrence,
  splitRecurrence,
  weekdayOf,
} from './recurrence'

describe('recurrence rules', () => {
  it('parse and format back', () => {
    for (const rule of [
      'daily',
      'weekdays',
      'weekly:mon,thu',
      'monthly:15',
      'every:3d@2026-09-26',
    ]) {
      const parsed = parseRecurrence(rule)
      expect(parsed).not.toBeNull()
      expect(formatRecurrence(parsed as NonNullable<typeof parsed>)).toBe(rule)
    }
    expect(parseRecurrence('weekly:xyz')).toBeNull()
    expect(parseRecurrence('monthly:40')).toBeNull()
  })

  it('know which days they fall on', () => {
    expect(weekdayOf('2026-09-28')).toBe('mon')
    expect(recursOn({ kind: 'weekdays' }, '2026-09-26')).toBe(false) // Saturday
    expect(recursOn({ kind: 'weekdays' }, '2026-09-28')).toBe(true)
    expect(recursOn({ kind: 'weekly', days: ['mon', 'thu'] }, '2026-10-01')).toBe(true)
    expect(recursOn({ kind: 'monthly', day: 31 }, '2026-09-30')).toBe(true) // last day of September
    expect(recursOn({ kind: 'monthly', day: 15 }, '2026-09-14')).toBe(false)
    const every3 = { kind: 'interval', every: 3, from: '2026-09-26' } as const
    expect(['2026-09-26', '2026-09-29', '2026-10-02'].map((d) => recursOn(every3, d))).toEqual([
      true,
      true,
      true,
    ])
    expect(recursOn(every3, '2026-09-27')).toBe(false)
    expect(recursOn(every3, '2026-09-23')).toBe(false)
  })
})

describe('repeating tasks in daily notes', () => {
  it('reads the rule off a task line', () => {
    expect(splitRecurrence('Позвонить маме 🔁 weekly:mon')).toEqual({
      text: 'Позвонить маме',
      rule: { kind: 'weekly', days: ['mon'] },
    })
    expect(splitRecurrence('Просто задача')).toEqual({ text: 'Просто задача', rule: null })
  })

  it('takes the due tasks from the newest note that has them', () => {
    const newest = '# Пт\n\n- [x] Позвонить маме 🔁 weekly:mon\n- [ ] Спорт\n'
    const older = '# Чт\n\n- [ ] Спорт 🔁 daily\n- [ ] Вода 🔁 daily\n'
    // Monday: mom is due; "Спорт" lost its rule in the newest note, so it stopped; water continues.
    expect(dueRecurringTasks([newest, older], '2026-09-28')).toEqual([
      'Позвонить маме 🔁 weekly:mon',
      'Вода 🔁 daily',
    ])
    expect(dueRecurringTasks([newest, older], '2026-09-29')).toEqual(['Вода 🔁 daily'])
  })

  it('sets, changes and clears the rule of a task', () => {
    const md = '- [ ] Позвонить маме\n- [x] Другое'
    const set = setTaskRecurrence(md, 'Позвонить маме', { kind: 'daily' })
    expect(set).toBe('- [ ] Позвонить маме 🔁 daily\n- [x] Другое')
    const changed = setTaskRecurrence(set, 'Позвонить маме', { kind: 'weekly', days: ['fri'] })
    expect(changed).toBe('- [ ] Позвонить маме 🔁 weekly:fri\n- [x] Другое')
    expect(setTaskRecurrence(changed, 'Позвонить маме', null)).toBe(md)
  })
})

describe('applyTaskRule', () => {
  const weekly: Recurrence = { kind: 'weekly', days: ['mon'] }
  it('updates, removes and adds repeats but keeps finished and hand-typed tasks', () => {
    expect(applyTaskRule('- [ ] a 🔁 daily', '2026-09-28', 'a', weekly)).toBe(
      '- [ ] a 🔁 weekly:mon',
    )
    expect(applyTaskRule('- [ ] a 🔁 daily\n- [ ] b', '2026-09-29', 'a', weekly)).toBe('- [ ] b')
    expect(applyTaskRule('- [x] a 🔁 daily', '2026-09-29', 'a', null)).toBe('- [x] a 🔁 daily')
    expect(applyTaskRule('- [ ] a', '2026-09-29', 'a', null)).toBe('- [ ] a')
    expect(applyTaskRule('- [ ] b', '2026-09-28', 'a', weekly)).toBe(
      '- [ ] b\n- [ ] a 🔁 weekly:mon',
    )
  })
})
