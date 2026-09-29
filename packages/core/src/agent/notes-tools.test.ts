import { beforeEach, describe, expect, it } from 'vitest'
import { AuditLog } from '../ai/audit'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { NoteTools, OPEN_GATE } from './notes-tools'
import { changesNotes, NOTE_TOOL_SPECS, runNoteTool } from './specs'

let db: SqlDriver
let repo: NotesRepo
let audit: AuditLog
let tools: NoteTools

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  repo = new NotesRepo(db)
  audit = new AuditLog(db, repo)
  tools = new NoteTools(db, repo, audit, {
    gate: OPEN_GATE,
    provider: () => 'Test model',
    kinds: 'chat',
  })
})

describe('NoteTools for the assistant', () => {
  it('edits one exact passage and logs it for undo', async () => {
    const n = await repo.createNote({ content: '# Shopping\n\n- milk\n- bread' })
    expect(await tools.edit(n.id, '- bread', '- bread\n- eggs')).toBe('Edited "Shopping".')
    expect((await repo.getNote(n.id))?.content).toBe('# Shopping\n\n- milk\n- bread\n- eggs')
    const [action] = await audit.list(5)
    expect(action?.kind).toBe('chat.update')
    expect(action?.provider).toBe('Test model')
    expect(await audit.undo(action?.id ?? '')).toEqual({ ok: true })
    expect((await repo.getNote(n.id))?.content).toBe('# Shopping\n\n- milk\n- bread')
  })

  it('refuses an edit it cannot place', async () => {
    const n = await repo.createNote({ content: '# Tasks\n\n- call\n- call' })
    await expect(tools.edit(n.id, '- write', '- read')).rejects.toThrow('was not found')
    await expect(tools.edit(n.id, '- call', '- ring')).rejects.toThrow('more than once')
    await expect(tools.edit(n.id, '# Tasks\n\n- call\n- call', '')).rejects.toThrow('empty')
  })

  it('runs tools by name with the arguments a model sends', async () => {
    const saved = await runNoteTool(tools, 'create_note', { content: '# Idea\n\nA bot' })
    expect(saved).toMatch(/^Saved "Idea" \(id: /)
    expect(await runNoteTool(tools, 'search_notes', { query: 'bot', limit: 99 })).toContain('Idea')
    await expect(runNoteTool(tools, 'get_note', {})).rejects.toThrow('`id` is required')
    await expect(runNoteTool(tools, 'format_disk', {})).rejects.toThrow('no tool named')
    expect((await audit.list(5))[0]?.kind).toBe('chat.create')
  })

  it('knows which tools change notes', () => {
    expect(changesNotes('search_notes', {})).toBe(false)
    expect(changesNotes('daily_note', {})).toBe(false)
    expect(changesNotes('daily_note', { append: 'x' })).toBe(true)
    expect(changesNotes('delete_note', { id: 'x' })).toBe(true)
    expect(changesNotes('unknown', {})).toBe(false)
    for (const spec of NOTE_TOOL_SPECS) {
      for (const key of spec.parameters.required ?? []) {
        expect(spec.parameters.properties[key]).toBeDefined()
      }
    }
  })
})
