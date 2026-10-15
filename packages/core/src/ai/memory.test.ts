import { describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import { createMemoryDriver } from '../testing/memory-driver'
import { AuditLog } from './audit'
import { FACT_MAX, readMemory, withFact, writeMemory } from './memory'

describe('assistant memory', () => {
  it('adds facts as lines, replaces outdated ones and refuses note-sized text', () => {
    let m = withFact('', 'Answer in English')
    m = withFact(m, '- answer in english')
    expect(m).toBe('- Answer in English')
    m = withFact(m, 'My manager is Anna')
    m = withFact(m, 'Answer in Russian', 'Answer in English')
    expect(m).toBe('- My manager is Anna\n- Answer in Russian')
    expect(() => withFact(m, 'x'.repeat(FACT_MAX + 1))).toThrow(/Too long/)
    expect(() => withFact(m, '  ')).toThrow(/Nothing/)
    expect(() => withFact(m, 'Tea', 'Coffee')).toThrow(/Copy the line exactly/)
  })

  it('logs what the assistant remembered, and undoes it unless the user edited it since', async () => {
    const db = await createMemoryDriver()
    await prepareDatabase(db)
    const audit = new AuditLog(db, new NotesRepo(db))
    await writeMemory(db, '- Call me Sasha')
    const meta = { kind: 'chat.memory' as const, summary: 'Remembered', provider: 'Test' }
    const action = await audit.recordMemory(meta, '- Call me Sasha\n- Answer briefly')
    expect(await readMemory(db)).toBe('- Call me Sasha\n- Answer briefly')
    expect((await audit.list())[0]?.memory).toEqual({
      before: '- Call me Sasha',
      after: '- Call me Sasha\n- Answer briefly',
    })
    expect(await audit.undo(action?.id ?? '')).toEqual({ ok: true })
    expect(await readMemory(db)).toBe('- Call me Sasha')

    const again = await audit.recordMemory(meta, '- Call me Sasha\n- Tea')
    await writeMemory(db, '- Edited by hand')
    expect(await audit.undo(again?.id ?? '')).toEqual({ ok: false, reason: 'changed' })
    expect(await readMemory(db)).toBe('- Edited by hand')
    // Nothing changes, nothing is logged.
    expect(await audit.recordMemory(meta, '- Edited by hand')).toBeNull()
  })
})
