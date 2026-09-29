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
