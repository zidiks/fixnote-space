import { beforeEach, describe, expect, it } from 'vitest'
import { AuditLog } from '../ai/audit'
import { ImageTexts } from '../attachments/image-text'
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
  it('searches with the extra words the chat adds (translations, synonyms)', async () => {
    await repo.createNote({ content: 'Giveaway в канале\n\nПриз — наушники' })
    expect(await tools.search('розыгрыши')).toMatch(/^No notes match/)
    const chat = new NoteTools(db, repo, audit, {
      gate: OPEN_GATE,
      provider: () => 'Test model',
      kinds: 'chat',
      expand: async () => ['giveaway'],
      semantic: () => null,
    })
    expect(await chat.search('розыгрыши')).toContain('Giveaway в канале')
  })

  it('mentions get_attachment only to clients that have it', async () => {
    const n = await repo.createNote({ content: '# Photo\n\n![](attachment:abc)' })
    expect(await tools.get(n.id)).not.toContain('get_attachment')
    const mcp = new NoteTools(db, repo, audit, {
      gate: OPEN_GATE,
      provider: () => 'Claude (MCP)',
      kinds: 'mcp',
      attachmentTool: true,
    })
    expect(await mcp.get(n.id)).toContain('get_attachment')
  })

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

describe('NoteTools and images', () => {
  it('shows the text read from an image with the note', async () => {
    await db.execute(
      "INSERT INTO attachments (id, mime, size, created_at) VALUES ('rcpt', 'image/jpeg', 50000, 1)",
    )
    const n = await repo.createNote({ content: '# Lunch\n\n![](attachment:rcpt)' })
    await new ImageTexts(db).set('rcpt', 'Cafe Leto\nTotal 570')
    expect(await tools.get(n.id)).toContain('text in it: Cafe Leto / Total 570')
  })

  it('does not leak out-of-scope ancestor or containing folder names in paths', async () => {
    const privateParent = await repo.createFolder('SecretParent')
    const sharedChild = await repo.createFolder('SharedWork', privateParent.id)
    const deepChild = await repo.createFolder('Roadmap', sharedChild.id)
    const inDeep = await repo.createNote({ content: '# Q4\n\nlaunch plan', folderId: deepChild.id })
    const singleShared = await repo.createNote({
      content: '# Single\n\nlaunch checklist',
      folderId: privateParent.id,
    })

    const scoped = new NoteTools(db, repo, audit, {
      gate: {
        need: async () => {},
        scope: async () => ({
          kind: 'some',
          folders: [sharedChild.id],
          notes: [singleShared.id],
        }),
        dailyHidden: 'hidden',
      },
      provider: () => 'MCP',
      kinds: 'mcp',
    })

    const folders = await scoped.folders()
    expect(folders).toContain('SharedWork')
    expect(folders).toContain('SharedWork / Roadmap')
    expect(folders).not.toContain('SecretParent')

    const deepNote = await scoped.get(inDeep.id)
    expect(deepNote).toContain('folder: SharedWork / Roadmap')
    expect(deepNote).not.toContain('SecretParent')

    const singleNote = await scoped.get(singleShared.id)
    expect(singleNote).toContain('folder: (no folder)')
    expect(singleNote).not.toContain('SecretParent')

    const found = await scoped.search('launch')
    expect(found).toContain('in SharedWork / Roadmap')
    expect(found).toContain('in (no folder)')
    expect(found).not.toContain('SecretParent')

    const recent = await scoped.recent(10)
    expect(recent).toContain('in SharedWork / Roadmap')
    expect(recent).toContain('in (no folder)')
    expect(recent).not.toContain('SecretParent')

    // Scoped path resolution matches the redacted path without the hidden ancestor.
    expect(await scoped.recent(10, 'SharedWork / Roadmap')).toContain('Q4')
  })
})
