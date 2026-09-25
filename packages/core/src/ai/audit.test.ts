import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { AuditLog } from './audit'

let db: SqlDriver
let repo: NotesRepo
let log: AuditLog

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  repo = new NotesRepo(db)
  log = new AuditLog(db, repo)
})

const meta = { kind: 'tidy.move' as const, summary: 'Moved to Work', provider: 'test' }

describe('AuditLog', () => {
  it('records before/after of a change and undoes it', async () => {
    const work = await repo.createFolder('Work')
    const n = await repo.createNote({ content: 'Plan' })
    const { action } = await log.track(meta, [n.id], async () => {
      await repo.moveNote(n.id, work.id)
      await repo.updateContent(n.id, '# Plan\n\nPlan')
      return {}
    })
    expect(action.changes).toEqual([
      {
        noteId: n.id,
        before: { content: 'Plan', folderId: null },
        after: { content: '# Plan\n\nPlan', folderId: work.id },
      },
    ])
    expect((await log.list()).map((a) => a.summary)).toEqual(['Moved to Work'])
    expect(await log.undo(action.id)).toEqual({ ok: true })
    const back = await repo.getNote(n.id)
    expect([back?.content, back?.folderId]).toEqual(['Plan', null])
    expect(await log.undo(action.id)).toEqual({ ok: false, reason: 'already' })
    expect((await log.list())[0]?.undoneAt).not.toBeNull()
  })

  it('refuses to undo over later edits, and skips no-op actions', async () => {
    const n = await repo.createNote({ content: 'a' })
    const { action } = await log.track(meta, [n.id], async () => {
      await repo.updateContent(n.id, 'b')
      return {}
    })
    await repo.updateContent(n.id, 'c')
    expect(await log.undo(action.id)).toEqual({ ok: false, reason: 'changed' })
    expect((await repo.getNote(n.id))?.content).toBe('c')
    await log.track(meta, [n.id], async () => ({}))
    expect(await log.list()).toHaveLength(1)
  })

  it('undoes created and merged (deleted) notes', async () => {
    const keep = await repo.createNote({ content: 'one' })
    const drop = await repo.createNote({ content: 'two' })
    const merge = await log.track({ ...meta, kind: 'tidy.merge' }, [keep.id, drop.id], async () => {
      await repo.updateContent(keep.id, 'one\ntwo')
      await repo.deleteNote(drop.id)
      return {}
    })
    const created = await log.track({ ...meta, kind: 'mcp.create' }, [], async () => {
      const x = await repo.createNote({ content: 'from Claude' })
      return { created: [x.id] }
    })
    expect(created.action.changes[0]?.before).toBeNull()
    expect(await log.undo(created.action.id)).toEqual({ ok: true })
    expect(await log.undo(merge.action.id)).toEqual({ ok: true })
    expect((await repo.getNote(drop.id))?.content).toBe('two')
    expect((await repo.getNote(keep.id))?.content).toBe('one')
    expect(await repo.getNote(created.result.created?.[0] ?? '')).toBeNull()
  })
})
