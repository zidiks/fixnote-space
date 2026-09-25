import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { addTasks, appendToDaily, openTasks, withoutTasks } from './daily'
import { NotesRepo } from './repo'

const yesterday = `# Thursday

## Tasks

- [x] call the bank
- [ ] buy milk
  - [ ] nested thing
- [ ] 
- [ ] buy milk

## Notes

text with [ ] brackets`

describe('daily tasks', () => {
  it('finds unfinished tasks once, skipping done and empty ones', () => {
    expect(openTasks(yesterday)).toEqual(['buy milk', 'nested thing'])
  })

  it('removes moved tasks and keeps the rest', () => {
    const left = withoutTasks(yesterday, ['buy milk', 'nested thing'])
    expect(left).toContain('- [x] call the bank')
    expect(left).toContain('- [ ] ')
    expect(openTasks(left)).toEqual([])
    expect(left).toContain('text with [ ] brackets')
  })

  it('fills the empty checkbox of the template, else extends the list, else appends', () => {
    const today = '# Friday\n\n## Tasks\n\n- [ ] \n\n## Notes\n'
    expect(addTasks(today, ['a', 'b'])).toBe(
      '# Friday\n\n## Tasks\n\n- [ ] a\n- [ ] b\n\n## Notes\n',
    )
    expect(addTasks('- [x] done\n- [ ] a\n\ntext', ['a', 'b'])).toBe(
      '- [x] done\n- [ ] a\n- [ ] b\n\ntext',
    )
    expect(addTasks('just text', ['a'])).toBe('just text\n\n- [ ] a\n')
    expect(addTasks('- [ ] a', ['a'])).toBe('- [ ] a')
  })

  it('stamps appended text with the time', () => {
    expect(appendToDaily('# Friday\n\n', 'idea', '14:05')).toBe('# Friday\n\n14:05 — idea\n')
  })
})

describe('adjacentDaily', () => {
  let db: SqlDriver
  let repo: NotesRepo
  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
    repo = new NotesRepo(db)
  })

  it('finds the nearest existing daily note on each side', async () => {
    const a = await repo.getOrCreateDaily('2026-09-20', () => 'a')
    const b = await repo.getOrCreateDaily('2026-09-24', () => 'b')
    await repo.createNote({ content: 'not daily' })
    expect(await repo.adjacentDaily('2026-09-25', 'before')).toEqual({
      id: b.id,
      dailyDate: '2026-09-24',
    })
    expect(await repo.adjacentDaily('2026-09-24', 'before')).toEqual({
      id: a.id,
      dailyDate: '2026-09-20',
    })
    expect(await repo.adjacentDaily('2026-09-20', 'after')).toEqual({
      id: b.id,
      dailyDate: '2026-09-24',
    })
    expect(await repo.adjacentDaily('2026-09-24', 'after')).toBeNull()
  })
})
