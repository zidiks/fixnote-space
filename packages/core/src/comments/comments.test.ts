import { beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { prepareDatabase } from '../db/migrate'
import { forgetLocalNotes } from '../local-data'
import { NotesRepo } from '../notes/repo'
import type { SqlDriver } from '../platform'
import { MemorySharedServer } from '../shared-notes/memory-server'
import { createMemoryDriver } from '../testing/memory-driver'
import {
  addYCommentReply,
  addYCommentThread,
  CommentsRepo,
  type CommentThread,
  deleteYCommentMessage,
  emailDisplayName,
  findQuoteRange,
  parseCommentBody,
  readYComments,
  scrubYComments,
  setYCommentStatus,
} from './index'

describe('comments helpers', () => {
  it('derives readable display names from emails and disambiguates collisions by domain', () => {
    expect(emailDisplayName('ivan.petrov@acme.com')).toBe('Ivan Petrov')
    expect(emailDisplayName('anna_smith+work@gmail.com')).toBe('Anna Smith')
    expect(emailDisplayName('alex-k@company.io')).toBe('Alex K')

    const all = ['alex@gmail.com', 'alex@acme.io', 'maria@acme.io']
    expect(emailDisplayName('alex@gmail.com', all)).toBe('Alex (gmail.com)')
    expect(emailDisplayName('alex@acme.io', all)).toBe('Alex (acme.io)')
    expect(emailDisplayName('maria@acme.io', all)).toBe('Maria')
  })

  it('parses comment bodies into plain text and clickable @mention chips', () => {
    const mentions = [
      { userId: 'u1', email: 'ivan.petrov@acme.com' },
      { userId: 'u2', email: 'anna@acme.com' },
    ]
    const parts = parseCommentBody('Hey @Ivan Petrov and @anna, please check this!', mentions)
    expect(parts).toEqual([
      { kind: 'text', text: 'Hey ' },
      { kind: 'mention', text: '@Ivan Petrov', userId: 'u1', email: 'ivan.petrov@acme.com' },
      { kind: 'text', text: ' and ' },
      { kind: 'mention', text: '@anna', userId: 'u2', email: 'anna@acme.com' },
      { kind: 'text', text: ', please check this!' },
    ])
  })

  it('disambiguates duplicate quotes using surrounding context and last offset', () => {
    const text = 'Alpha target beta. Later gamma target delta.'
    const second = findQuoteRange(text, 'target', {
      contextBefore: 'gamma ',
      contextAfter: ' delta',
    })
    expect(second).toEqual({ from: 31, to: 37 })

    const first = findQuoteRange(text, 'target', { from: 5 })
    expect(first).toEqual({ from: 6, to: 12 })

    expect(findQuoteRange(text, 'missing phrase')).toBeNull()
  })
})

describe('Yjs shared note comments CRDT', () => {
  it('merges concurrent replies from two docs without losing messages', () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()

    const thread: CommentThread = {
      id: 'thread-1',
      quote: 'budget estimate',
      contextBefore: 'Review ',
      contextAfter: ' before Friday',
      from: 7,
      to: 22,
      status: 'open',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [
        {
          id: 'm1',
          authorId: 'u-alice',
          authorEmail: 'alice@acme.com',
          body: 'Looks low @Bob',
          mentions: [{ userId: 'u-bob', email: 'bob@acme.com' }],
          createdAt: 1000,
        },
      ],
    }

    addYCommentThread(docA, thread)

    // Sync initial thread to B.
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))
    expect(readYComments(docB)).toHaveLength(1)

    // Both A and B reply concurrently while offline.
    addYCommentReply(docA, thread.id, {
      id: 'm2',
      authorId: 'u-alice',
      authorEmail: 'alice@acme.com',
      body: 'Adding Q4 numbers too',
      mentions: [],
      createdAt: 2000,
    })
    addYCommentReply(docB, thread.id, {
      id: 'm3',
      authorId: 'u-bob',
      authorEmail: 'bob@acme.com',
      body: 'On it!',
      mentions: [],
      createdAt: 2100,
    })

    // Exchange updates both ways.
    const updateA = Y.encodeStateAsUpdate(docA)
    const updateB = Y.encodeStateAsUpdate(docB)
    Y.applyUpdate(docA, updateB)
    Y.applyUpdate(docB, updateA)

    const mergedA = readYComments(docA)[0]
    const mergedB = readYComments(docB)[0]
    expect(mergedA?.messages.map((m) => m.body).sort()).toEqual([
      'Adding Q4 numbers too',
      'Looks low @Bob',
      'On it!',
    ])
    expect(mergedB?.messages).toHaveLength(3)

    // Resolve and delete message.
    setYCommentStatus(docA, thread.id, 'resolved')
    expect(readYComments(docA)[0]?.status).toBe('resolved')

    deleteYCommentMessage(docA, thread.id, 'm2')
    expect(readYComments(docA)[0]?.messages).toHaveLength(2)
  })

  it('scrubs protected values from quotes, context, and message bodies in Yjs comments', () => {
    const doc = new Y.Doc()
    addYCommentThread(doc, {
      id: 't-secret',
      quote: 'token=ghp_abc123',
      contextBefore: 'before ghp_abc123 ',
      contextAfter: ' after **ghp_abc123**',
      status: 'open',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [
        {
          id: 'm1',
          authorId: 'u1',
          authorEmail: 'alice@acme.com',
          body: 'Please revoke ghp_abc123 right away',
          mentions: [],
          createdAt: 1000,
        },
        {
          id: 'm2',
          authorId: 'u2',
          authorEmail: 'bob@acme.com',
          body: 'Unrelated message',
          mentions: [],
          createdAt: 1001,
        },
      ],
    })

    expect(scrubYComments(doc, [])).toBe(false)
    expect(scrubYComments(doc, ['not-present'])).toBe(false)
    expect(scrubYComments(doc, ['ghp_abc123', '**ghp_abc123**'])).toBe(true)

    const [thread] = readYComments(doc)
    expect(thread?.quote).toBe('token=[protected fragment]')
    expect(thread?.contextBefore).toBe('before [protected fragment] ')
    expect(thread?.contextAfter).toBe(' after [protected fragment]')
    expect(thread?.messages[0]?.body).toBe('Please revoke [protected fragment] right away')
    expect(thread?.messages[1]?.body).toBe('Unrelated message')

    // Idempotent once scrubbed.
    expect(scrubYComments(doc, ['ghp_abc123'])).toBe(false)
    doc.destroy()
  })
})

describe('CommentsRepo (local SQLite)', () => {
  let db: SqlDriver
  let repo: CommentsRepo

  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
    repo = new CommentsRepo(db)
  })

  it('saves, lists, updates, removes, and cleans up on forgetLocalNotes', async () => {
    const notesRepo = new NotesRepo(db)
    const note = await notesRepo.createNote({ content: 'Run deploy checklist first' })

    const thread: CommentThread = {
      id: 't-local',
      quote: 'deploy checklist',
      contextBefore: 'Run ',
      contextAfter: ' first',
      from: 4,
      to: 20,
      status: 'open',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [
        {
          id: 'm1',
          authorId: 'u1',
          authorEmail: 'me@example.com',
          body: 'Verify migrations',
          mentions: [],
          createdAt: 1000,
        },
      ],
    }
    await repo.save(note.id, thread)
    expect((await repo.list(note.id))[0]?.messages).toHaveLength(1)

    const updated: CommentThread = {
      ...thread,
      status: 'resolved',
      updatedAt: 2000,
      messages: [
        ...thread.messages,
        {
          id: 'm2',
          authorId: 'u1',
          authorEmail: 'me@example.com',
          body: 'Done',
          mentions: [],
          createdAt: 2000,
        },
      ],
    }
    await repo.save(note.id, updated)
    const list = await repo.list(note.id)
    expect(list).toHaveLength(1)
    expect(list[0]?.status).toBe('resolved')
    expect(list[0]?.messages).toHaveLength(2)

    await forgetLocalNotes(db, {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
    })
    expect(await repo.list(note.id)).toHaveLength(0)
  })
})

describe('MemorySharedServer comment notifications', () => {
  it('notifies accepted note & folder members with mention/reply/comment kinds and tracks read state', async () => {
    const server = new MemorySharedServer()
    server.users.set('alice', { email: 'alice@acme.com', publicKey: 'pk-a' })
    server.users.set('bob', { email: 'bob@acme.com', publicKey: 'pk-b' })
    server.users.set('carol', { email: 'carol@acme.com', publicKey: 'pk-c' })
    server.users.set('dave', { email: 'dave@acme.com', publicKey: 'pk-d' })

    const alice = server.remoteFor('alice')
    const bob = server.remoteFor('bob')
    const carol = server.remoteFor('carol')
    const dave = server.remoteFor('dave')

    const sharedId = await alice.share('n1', 'wk-a')
    await alice.addMember(sharedId, 'bob', 'edit', 'wk-b')
    await alice.addMember(sharedId, 'carol', 'view', 'wk-c')
    await alice.addMember(sharedId, 'dave', 'edit', 'wk-d')
    await bob.accept(sharedId)
    await carol.accept(sharedId)
    // Dave has NOT accepted yet -> must not receive comment events.

    // View-only Carol cannot notify comments.
    await expect(carol.notifyComment?.(sharedId, 't1', [], false)).rejects.toThrow('read only')

    // Alice comments and mentions Bob.
    await alice.notifyComment?.(sharedId, 't1', ['bob'], false)

    const bobEvents = (await bob.commentEvents?.()) ?? []
    const carolEvents = (await carol.commentEvents?.()) ?? []
    const daveEvents = (await dave.commentEvents?.()) ?? []
    const aliceEvents = (await alice.commentEvents?.()) ?? []

    expect(aliceEvents).toHaveLength(0)
    expect(daveEvents).toHaveLength(0)
    expect(bobEvents).toHaveLength(1)
    expect(bobEvents[0]?.kind).toBe('mention')
    expect(bobEvents[0]?.actorEmail).toBe('alice@acme.com')
    expect(carolEvents).toHaveLength(1)
    expect(carolEvents[0]?.kind).toBe('comment')

    // Round-trip through JSON serialization (used by ?dev-backend).
    const restored = MemorySharedServer.fromJSON(server.toJSON())
    const bobRestored = restored.remoteFor('bob')
    expect(await bobRestored.commentEvents?.()).toHaveLength(1)

    // Bob replies -> Alice gets 'reply', Carol gets 'reply'.
    await bobRestored.notifyComment?.(sharedId, 't1', [], true)
    expect((await restored.remoteFor('alice').commentEvents?.())?.[0]?.kind).toBe('reply')

    // Bob marks thread t1 read -> cleared.
    await bobRestored.markCommentsRead?.(sharedId, 't1')
    expect(await bobRestored.commentEvents?.()).toHaveLength(0)
  })
})
