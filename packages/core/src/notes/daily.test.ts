import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import {
  addTasks,
  appendToDaily,
  mergeDailyNotes,
  mergeTaskItems,
  openTaskItems,
  openTasks,
  withoutTasks,
} from './daily'
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

  it('preserves 2+ level nested checklist hierarchy when carrying over', () => {
    const src = [
      '# Wednesday',
      '',
      '## Tasks',
      '',
      '- [ ] Release v2',
      '  - [ ] Frontend',
      '    - [ ] Write tests',
      '    - [ ] Check dark mode',
      '  - [ ] Backend',
      '    - [ ] Write tests',
      '- [ ] Call mom',
    ].join('\n')

    const items = openTaskItems(src)
    expect(items).toEqual([
      { text: 'Release v2', depth: 0 },
      { text: 'Frontend', depth: 1 },
      { text: 'Write tests', depth: 2 },
      { text: 'Check dark mode', depth: 2 },
      { text: 'Backend', depth: 1 },
      { text: 'Write tests', depth: 2 },
      { text: 'Call mom', depth: 0 },
    ])

    const today = '# Thursday\n\n## Tasks\n\n- [ ] \n\n## Notes\n'
    expect(addTasks(today, items)).toBe(
      [
        '# Thursday',
        '',
        '## Tasks',
        '',
        '- [ ] Release v2',
        '  - [ ] Frontend',
        '    - [ ] Write tests',
        '    - [ ] Check dark mode',
        '  - [ ] Backend',
        '    - [ ] Write tests',
        '- [ ] Call mom',
        '',
        '## Notes',
        '',
      ].join('\n'),
    )
    expect(openTaskItems(withoutTasks(src, items))).toEqual([])
  })

  it('promotes open subtasks of done parents and dedents surviving done subtasks of moved parents', () => {
    const src = [
      '- [x] Earlier done task',
      '- [ ] Open parent',
      '  - [x] Done child',
      '    - [x] Done grandchild',
      '  - [ ] Open child',
      '- [x] Done parent',
      '  - [ ] Orphan open child',
      '    - [ ] Orphan open grandchild',
    ].join('\n')

    const items = openTaskItems(src)
    expect(items).toEqual([
      { text: 'Open parent', depth: 0 },
      { text: 'Open child', depth: 1 },
      { text: 'Orphan open child', depth: 0 },
      { text: 'Orphan open grandchild', depth: 1 },
    ])

    const left = withoutTasks(src, items)
    expect(left).toBe(
      [
        '- [x] Earlier done task',
        '- [x] Done child',
        '  - [x] Done grandchild',
        '- [x] Done parent',
      ].join('\n'),
    )
  })

  it('merges nested tasks from multiple days and attaches new children under existing parents', () => {
    const mon = openTaskItems('- [ ] Project A\n  - [ ] Task 1\n- [ ] Shared')
    const tue = openTaskItems('- [ ] Project A\n  - [ ] Task 2\n- [ ] Shared\n- [ ] Solo')
    const merged = mergeTaskItems(mon, tue)
    expect(merged).toEqual([
      { text: 'Project A', depth: 0 },
      { text: 'Task 1', depth: 1 },
      { text: 'Task 2', depth: 1 },
      { text: 'Shared', depth: 0 },
      { text: 'Solo', depth: 0 },
    ])

    const todayBefore = '# Today\n\n- [ ] Project A\n  - [ ] Existing\n'
    const after = addTasks(todayBefore, merged)
    expect(after).toBe(
      [
        '# Today',
        '',
        '- [ ] Project A',
        '  - [ ] Existing',
        '  - [ ] Task 1',
        '  - [ ] Task 2',
        '- [ ] Shared',
        '- [ ] Solo',
        '',
      ].join('\n'),
    )

    // Undo after an extra edit keeps Project A and Existing that were already in today.
    const edited = `${after}extra note\n`
    const undone = withoutTasks(edited, merged, { keepFrom: todayBefore })
    expect(undone).toBe('# Today\n\n- [ ] Project A\n  - [ ] Existing\nextra note\n')
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

  it('finds unfinished tasks across multiple earlier days even when yesterday has none', async () => {
    await repo.getOrCreateDaily('2026-08-01', () => '- [ ] Too old')
    const d1 = await repo.getOrCreateDaily(
      '2026-09-18',
      () => '- [ ] Older task\n  - [ ] Older child',
    )
    await repo.getOrCreateDaily('2026-09-22', () => '- [x] All done')
    const d2 = await repo.getOrCreateDaily('2026-09-23', () => '- [ ] Recent task')
    await repo.getOrCreateDaily('2026-09-24', () => '# Empty yesterday\n\n- [ ] ')

    const found = await repo.earlierDailyWithOpenTasks('2026-09-25', {
      since: '2026-08-26',
      limit: 30,
    })
    expect(found).toEqual([
      {
        id: d1.id,
        dailyDate: '2026-09-18',
        tasks: [
          { text: 'Older task', depth: 0 },
          { text: 'Older child', depth: 1 },
        ],
      },
      {
        id: d2.id,
        dailyDate: '2026-09-23',
        tasks: [{ text: 'Recent task', depth: 0 }],
      },
    ])
  })
})

describe('mergeDailyNotes', () => {
  const template = '# Sat, 26 Sep\n\n## Tasks\n\n- [ ] \n\n## Notes\n\n'
  it('joins two notes of one day: shared lines once, each task once, done wins', () => {
    const a = template.replace('- [ ] ', '- [ ] Buy milk\n- [ ] Call mom').concat('Met Anna.')
    const b = template.replace('- [ ] ', '- [x] Call mom\n- [ ] Gym').concat('Rain all day.')
    expect(mergeDailyNotes(a, b)).toBe(
      '# Sat, 26 Sep\n\n## Tasks\n\n- [ ] Buy milk\n- [x] Call mom\n- [ ] Gym\n\n## Notes\n\nMet Anna.\nRain all day.',
    )
  })
  it('keeps the empty checkbox only when there are no tasks, and is idempotent', () => {
    expect(mergeDailyNotes(template, template)).toBe(template.replace(/\n\n$/, '\n'))
    const a = template.replace('- [ ] ', '- [ ] One')
    const merged = mergeDailyNotes(a, template)
    expect(merged).not.toContain('- [ ] \n')
    expect(mergeDailyNotes(merged, template)).toBe(merged)
  })
})
