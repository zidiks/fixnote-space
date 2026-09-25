import { describe, expect, it } from 'vitest'
import { dateGroup } from './time'

describe('dateGroup', () => {
  const now = new Date(2026, 8, 25, 10, 0) // 25 Sep 2026, 10:00 local
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime()

  it('uses calendar days, then months of this year, then years', () => {
    expect(dateGroup(at(2026, 8, 25, 0), now)).toEqual({ kind: 'today' })
    expect(dateGroup(at(2026, 8, 25, 23), now)).toEqual({ kind: 'today' })
    expect(dateGroup(at(2026, 8, 24, 23), now)).toEqual({ kind: 'yesterday' })
    expect(dateGroup(at(2026, 8, 23), now)).toEqual({ kind: 'week' })
    expect(dateGroup(at(2026, 8, 18), now)).toEqual({ kind: 'week' })
    expect(dateGroup(at(2026, 8, 17), now)).toEqual({ kind: 'month' })
    expect(dateGroup(at(2026, 7, 26), now)).toEqual({ kind: 'month' })
    expect(dateGroup(at(2026, 7, 25), now)).toEqual({ kind: 'monthOf', year: 2026, month: 7 })
    expect(dateGroup(at(2026, 0, 1), now)).toEqual({ kind: 'monthOf', year: 2026, month: 0 })
    expect(dateGroup(at(2025, 11, 31), now)).toEqual({ kind: 'year', year: 2025 })
  })
})
