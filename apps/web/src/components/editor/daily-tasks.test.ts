import { addTasks, openTaskItems } from '@fixnote/core'
import { describe, expect, it } from 'vitest'
import { schemaEditor } from './headless'

const parse = (md: string) => schemaEditor().markdown?.parse(md)
const serialize = (md: string) => schemaEditor().markdown?.serialize(parse(md) ?? { type: 'doc' })

describe('nested daily tasks in editor markdown', () => {
  it('round-trips 3-level nested task items after carry-over', () => {
    const yesterday = [
      '# Yesterday',
      '',
      '- [ ] Level 1',
      '  - [ ] Level 2',
      '    - [ ] Level 3',
      '  - [ ] Level 2b',
    ].join('\n')

    const serializedYesterday = serialize(yesterday) ?? ''
    const items = openTaskItems(serializedYesterday)
    expect(items).toEqual([
      { text: 'Level 1', depth: 0 },
      { text: 'Level 2', depth: 1 },
      { text: 'Level 3', depth: 2 },
      { text: 'Level 2b', depth: 1 },
    ])

    const today = addTasks('# Today\n\n- [ ] \n', items)
    const doc = parse(today)
    const taskList = doc?.content?.find((n) => n.type === 'taskList')
    const level1 = taskList?.content?.[0]
    const nested1 = level1?.content?.find((n) => n.type === 'taskList')
    const level2 = nested1?.content?.[0]
    const nested2 = level2?.content?.find((n) => n.type === 'taskList')
    const level3 = nested2?.content?.[0]

    expect(level1?.type).toBe('taskItem')
    expect(level2?.type).toBe('taskItem')
    expect(level3?.type).toBe('taskItem')
    expect(nested1?.content).toHaveLength(2)
  })
})
