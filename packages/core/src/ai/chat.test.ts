import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import { ChatRepo, voiceBlobKey } from './chat'

describe('ChatRepo voice messages', () => {
  let db: SqlDriver
  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
  })

  it('keeps the recording with the question and hands its key back when the chat is cleared', async () => {
    const repo = new ChatRepo(db)
    const voice = { key: voiceBlobKey('a'), durationMs: 3200, peaks: [0.1, 0.9, 0.4] }
    await repo.add({
      kind: 'user',
      content: 'сколько задач на сегодня?',
      scope: { kind: 'all' },
      voice,
    })
    await repo.add({ kind: 'assistant', content: 'Три.', scope: { kind: 'all' } })
    const [question, answer] = await repo.recent()
    expect(question?.voice).toEqual(voice)
    expect(answer?.voice).toBeNull()
    expect(await repo.clear()).toEqual([voice.key])
    expect(await repo.recent()).toEqual([])
  })
})

describe('ChatRepo agent answers', () => {
  let db: SqlDriver
  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
  })

  it('keeps the changes of an answer and the summary of a long thread until it is cleared', async () => {
    const repo = new ChatRepo(db)
    const answer = await repo.add({ kind: 'assistant', content: 'Готово.', scope: { kind: 'all' } })
    const actions = { items: [{ id: 'a1', label: 'Создана заметка «Покупки»' }], undone: false }
    await repo.setActions(answer.id, actions)
    expect((await repo.recent())[0]?.actions).toEqual(actions)
    await repo.setActions(answer.id, { ...actions, undone: true })
    expect((await repo.recent())[0]?.actions?.undone).toBe(true)
    expect(await repo.summary()).toBeNull()
    await repo.setSummary({ text: 'The user plans a trip.', upTo: 42 })
    expect(await repo.summary()).toEqual({ text: 'The user plans a trip.', upTo: 42 })
    await repo.clear()
    expect(await repo.summary()).toBeNull()
  })
})

describe('ChatRepo traces', () => {
  it('keeps how an answer was reached, and the cleared mark until the chat is cleared', async () => {
    const db = await createMemoryDriver()
    await prepareDatabase(db)
    const repo = new ChatRepo(db)
    const answer = await repo.add({ kind: 'assistant', content: '', scope: { kind: 'all' } })
    const trace = {
      steps: [
        {
          text: 'Let me look.',
          reasoning: 'think',
          calls: [{ id: 'c1', name: 'get_note', arguments: '{"id":"n1"}', result: '# Plan' }],
        },
      ],
      reasoning: 'answer',
      found: [{ n: 1, noteId: 'n1', title: 'Plan' }],
    }
    await repo.finish(answer.id, { content: 'Done.', status: 'done', trace })
    expect((await repo.recent())[0]?.trace).toEqual(trace)
    expect(await repo.cleared()).toBe(0)
    await repo.setCleared(42)
    expect(await repo.cleared()).toBe(42)
    await repo.clear()
    expect(await repo.cleared()).toBe(0)
  })
})
