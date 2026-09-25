import type { Fragment } from '@fixnote/core'
import { describe, expect, it } from 'vitest'
import { confidence, parseCitations } from './citations'
import { ChatError, streamChat } from './client'
import { buildMessages } from './prompt'

function sse(chunks: string[], status = 200): typeof fetch {
  return async () =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
          c.close()
        },
      }),
      { status, headers: { 'Content-Type': 'text/event-stream' } },
    )
}

const delta = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`

const collect = async (gen: AsyncGenerator<string>) => {
  let s = ''
  for await (const d of gen) s += d
  return s
}

const frag = (over: Partial<Fragment>): Fragment => ({
  noteId: 'n1',
  title: 'T',
  ord: 0,
  text: 'text',
  updatedAt: Date.UTC(2026, 8, 20),
  via: { keyword: true, semantic: false },
  score: 1,
  ...over,
})

describe('streamChat', () => {
  it('joins deltas split across network chunks and stops at [DONE]', async () => {
    const body = `${delta('Hel')}${delta('lo, ')}${delta('мир')}data: [DONE]\n\n${delta('ignored')}`
    const pieces = [body.slice(0, 17), body.slice(17, 50), body.slice(50)]
    const text = await collect(
      streamChat({ url: 'x', model: 'm', messages: [], fetch: sse(pieces) }),
    )
    expect(text).toBe('Hello, мир')
  })

  it('reports a stop even when the transport ends the stream quietly', async () => {
    const ctrl = new AbortController()
    const gen = streamChat({
      url: 'x',
      model: 'm',
      messages: [],
      fetch: sse([delta('a'), delta('b')]),
      signal: ctrl.signal,
    })
    ctrl.abort()
    await expect(collect(gen)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('surfaces HTTP errors with the provider message', async () => {
    const f: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), { status: 402 })
    await expect(
      collect(streamChat({ url: 'x', model: 'm', messages: [], fetch: f })),
    ).rejects.toEqual(new ChatError(402, 'Insufficient Balance'))
  })

  it('sends an OpenAI-compatible streaming request', async () => {
    let sent: { url: string; body: Record<string, unknown>; headers: Headers } | undefined
    const f: typeof fetch = async (url, init) => {
      sent = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
      }
      return sse(['data: [DONE]\n\n'])(url, init)
    }
    await collect(
      streamChat({
        url: 'https://p/v1/chat/completions',
        headers: { Authorization: 'Bearer t' },
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        fetch: f,
      }),
    )
    expect(sent?.body).toMatchObject({
      model: 'deepseek-chat',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(sent?.headers.get('authorization')).toBe('Bearer t')
  })
})

describe('buildMessages', () => {
  it('numbers fragments, keeps recent history, states the scope', () => {
    const msgs = buildMessages({
      question: 'Что с палитрой?',
      fragments: [frag({ title: 'Design', text: 'oklch palette' }), frag({ title: '', text: 'b' })],
      scope: { kind: 'folder', id: 'f', name: 'Work' },
      history: Array.from(
        { length: 10 },
        (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }) as const,
      ),
      now: new Date(Date.UTC(2026, 8, 25)),
    })
    expect(msgs[0]?.role).toBe('system')
    expect(msgs).toHaveLength(1 + 6 + 1)
    const last = msgs.at(-1)?.content ?? ''
    expect(last).toContain('[1] "Design" (edited 2026-09-20)\noklch palette')
    expect(last).toContain('[2] "Untitled"')
    expect(last).toContain('notes in the folder "Work"')
    expect(last).toContain('Today is 2026-09-25')
    expect(last.endsWith('Question: Что с палитрой?')).toBe(true)
  })
})

describe('citations', () => {
  const fragments = [
    frag({ noteId: 'a', title: 'A', via: { keyword: true, semantic: true } }),
    frag({ noteId: 'b', title: 'B' }),
  ]

  it('parses single, grouped and repeated markers, ignoring unknown numbers', () => {
    const c = parseCitations('One [2]. Two [1][2]. Three [1, 2]. Bad [7].', fragments)
    expect(c.map((x) => [x.n, x.noteId])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ])
  })

  it('grades confidence by grounding', () => {
    expect(confidence([], fragments)).toBe('low')
    expect(confidence(parseCitations('[2]', fragments), fragments)).toBe('medium')
    expect(confidence(parseCitations('[1]', fragments), fragments)).toBe('high')
  })
})

describe('query expansion', async () => {
  const { expandQuery, parseKeywords, buildExpansionMessages, EXPANSION_MARKER } = await import(
    './expand'
  )

  it('parses JSON, tolerates noise and plain lists', () => {
    expect(
      parseKeywords('Sure! {"keywords": ["Giveaway", "розыгрыш", "giveaway", "x"]} done'),
    ).toEqual(['giveaway', 'розыгрыш'])
    expect(parseKeywords('giveaway, розыгрыш\nsorteo')).toEqual(['giveaway', 'розыгрыш', 'sorteo'])
  })

  it('asks for multilingual keywords and never throws', async () => {
    expect(buildExpansionMessages('q')[0]?.content).toContain(EXPANSION_MARKER)
    const reply = `{"keywords":["giveaway","sorteo"]}`
    const ok = await expandQuery(
      { url: 'x', model: 'm', fetch: sse([delta(reply), 'data: [DONE]\n\n']) },
      'розыгрыши',
    )
    expect(ok).toEqual(['giveaway', 'sorteo'])
    const failing: typeof fetch = async () => new Response('nope', { status: 500 })
    expect(await expandQuery({ url: 'x', model: 'm', fetch: failing }, 'q')).toEqual([])
    const hanging: typeof fetch = (_u, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      )
    expect(await expandQuery({ url: 'x', model: 'm', fetch: hanging }, 'q', 50)).toEqual([])
  })
})

describe('edit prompts', () => {
  it('puts the task, context and fragment in one user message', async () => {
    const { buildEditMessages, EDIT_MARKER } = await import('./edit')
    const [system, user] = buildEditMessages({
      action: 'custom',
      instruction: 'сделай список',
      text: 'молоко, хлеб',
      noteTitle: 'Покупки',
      before: 'Список на субботу',
    })
    expect(system?.content).toContain(EDIT_MARKER)
    expect(user?.content).toContain('сделай список')
    expect(user?.content).toContain('Note title: Покупки')
    expect(user?.content).toContain('<<<\nмолоко, хлеб\n>>>')
  })

  it('strips a wrapping code fence and markers from the reply', async () => {
    const { cleanEditOutput } = await import('./edit')
    expect(cleanEditOutput('```markdown\n- a\n- b\n```')).toBe('- a\n- b')
    expect(cleanEditOutput('<<<\nText\n>>>')).toBe('Text')
    expect(cleanEditOutput('```js\ncode\n```')).toBe('```js\ncode\n```')
  })
})

describe('tidy prompts', () => {
  const req = {
    notes: [
      {
        ref: 1,
        title: 'Бот в Telegram',
        excerpt: 'команды',
        tags: ['bot'],
        needsTitle: false,
        noFolder: true,
      },
      {
        ref: 2,
        title: 'Очень длинная первая строка',
        excerpt: '',
        tags: [],
        needsTitle: true,
        noFolder: false,
      },
    ],
    folders: [{ ref: 1, name: 'Проекты' }],
    tags: ['bot'],
  }

  it('lists folders, tags and notes with their flags', async () => {
    const { buildTidyMessages, TIDY_MARKER } = await import('./tidy')
    const [system, user] = buildTidyMessages(req)
    expect(system?.content).toContain(TIDY_MARKER)
    expect(user?.content).toContain('[1] Проекты')
    expect(user?.content).toContain('[2] Очень длинная первая строка\n  tags: none\n  needs title')
  })

  it('keeps only valid proposals about known notes', async () => {
    const { parseTidyReply } = await import('./tidy')
    const reply = `Sure! {"moves":[{"note":1,"folder":1},{"note":2,"folder":1},{"note":9,"folder":1},{"note":1,"newFolder":"x"}],
      "tags":[{"note":1,"tags":["#Bot","идеи","идеи","два слова","123"]}],
      "titles":[{"note":2,"title":"«Партнёрства»"},{"note":1,"title":"no"}]}`
    expect(parseTidyReply(reply, req)).toEqual([
      { kind: 'move', note: 1, folder: 1 },
      { kind: 'tag', note: 1, tags: ['идеи', 'два-слова'] },
      { kind: 'title', note: 2, title: 'Партнёрства' },
    ])
    expect(parseTidyReply('not json', req)).toEqual([])
  })
})
