import { beforeEach, describe, expect, it } from 'vitest'
import { ChatRepo, type ChatTrace } from '../ai/chat'
import { CommentsRepo, type CommentThread } from '../comments'
import { prepareDatabase } from '../db/migrate'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { protectedReference, REDACTED_PROTECTED_FRAGMENT } from './reference'

let db: SqlDriver
let repo: NotesRepo
let comments: CommentsRepo
let chat: ChatRepo

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  repo = new NotesRepo(db)
  comments = new CommentsRepo(db)
  chat = new ChatRepo(db)
})

describe('scrubProtectedCopies', () => {
  it('scrubs note_comments on the note and globally without corrupting JSON structure', async () => {
    const secret = 'pw="alpha\\beta"\nline2'
    const noteA = await repo.createNote({ content: `Credentials:\n${secret}\nend` })
    const noteB = await repo.createNote({ content: 'Other note' })

    const makeThread = (id: string, quote: string, body: string): CommentThread => ({
      id,
      quote,
      contextBefore: `ctx ${secret} `,
      contextAfter: ` tail ${secret}`,
      status: 'open',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [
        {
          id: `${id}-m1`,
          authorId: 'u1',
          authorEmail: 'me@example.com',
          body,
          mentions: [],
          createdAt: 1000,
        },
      ],
    })

    await comments.save(noteA.id, makeThread('t1', secret, `Remember ${secret}`))
    await comments.save(noteB.id, makeThread('t2', 'status', `Copied ${secret} here`))

    const fragmentId = crypto.randomUUID()
    const reference = protectedReference({ audience: 'personal', fragmentId })
    await repo.updateContent(noteA.id, `Credentials:\n${reference}\nend`, {
      base: noteA.content,
      protect: { fragmentId, reference, values: [secret, 'status'] },
    })

    const [threadA] = await comments.list(noteA.id)
    expect(threadA?.status).toBe('open')
    expect(threadA?.quote).toBe(REDACTED_PROTECTED_FRAGMENT)
    expect(threadA?.contextBefore).toBe(`ctx ${REDACTED_PROTECTED_FRAGMENT} `)
    expect(threadA?.contextAfter).toBe(` tail ${REDACTED_PROTECTED_FRAGMENT}`)
    expect(threadA?.messages[0]?.body).toBe(`Remember ${REDACTED_PROTECTED_FRAGMENT}`)

    // Globally scrubbed on another note too, while JSON key "status" remains valid.
    const [threadB] = await comments.list(noteB.id)
    expect(threadB?.status).toBe('open')
    expect(threadB?.quote).toBe(REDACTED_PROTECTED_FRAGMENT)
    expect(threadB?.messages[0]?.body).toBe(`Copied ${REDACTED_PROTECTED_FRAGMENT} here`)
  })

  it('scrubs double-JSON-escaped secrets in chat_messages.trace tool arguments', async () => {
    const secret = 'key "quoted" \\path\nnext-line'
    const note = await repo.createNote({ content: `Secret:\n${secret}` })

    const entry = await chat.add({
      kind: 'assistant',
      content: '',
      scope: { kind: 'all' },
      status: 'streaming',
    })
    const trace: ChatTrace = {
      steps: [
        {
          text: `Checking ${secret}`,
          calls: [
            {
              id: 'call-1',
              name: 'edit_note',
              arguments: JSON.stringify({ id: note.id, find: secret, replace: 'redacted' }),
              result: `Edited note with ${secret}`,
            },
          ],
        },
      ],
    }
    await chat.finish(entry.id, {
      content: `Found ${secret}`,
      status: 'done',
      citations: [{ n: 1, noteId: note.id, title: 'Secret', quote: secret }],
      confidence: 'high',
      trace,
    })

    const fragmentId = crypto.randomUUID()
    const reference = protectedReference({ audience: 'personal', fragmentId })
    await repo.updateContent(note.id, `Secret:\n${reference}`, {
      base: note.content,
      protect: { fragmentId, reference, values: [secret] },
    })

    const [raw] = await db.query<{ content: string; trace: string; citations: string }>(
      'SELECT content, trace, citations FROM chat_messages WHERE id = ?',
      [entry.id],
    )
    expect(raw?.content).toBe(`Found ${REDACTED_PROTECTED_FRAGMENT}`)
    expect(raw?.trace).not.toContain('quoted')
    expect(raw?.trace).not.toContain('next-line')
    expect(raw?.citations).not.toContain('quoted')

    // Parsed trace and nested tool arguments JSON must remain valid and cleanly scrubbed.
    const [reloaded] = await chat.recent()
    const call = reloaded?.trace?.steps[0]?.calls[0]
    expect(reloaded?.trace?.steps[0]?.text).toBe(`Checking ${REDACTED_PROTECTED_FRAGMENT}`)
    expect(call?.result).toBe(`Edited note with ${REDACTED_PROTECTED_FRAGMENT}`)
    expect(JSON.parse(call?.arguments ?? '{}')).toEqual({
      id: note.id,
      find: REDACTED_PROTECTED_FRAGMENT,
      replace: 'redacted',
    })
    expect(reloaded?.citations[0]?.quote).toBe(REDACTED_PROTECTED_FRAGMENT)
  })
})
