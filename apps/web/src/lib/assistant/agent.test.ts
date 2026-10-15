import type { AgentMessage } from '@fixnote/ai'
import type { ChatTrace } from '@fixnote/core'
import { AuditLog, NotesRepo, NoteTools, OPEN_GATE, prepareDatabase } from '@fixnote/core'
import { createMemoryDriver } from '@fixnote/core/testing'
import { describe, expect, it } from 'vitest'
import { actionCollector, type ConfirmAnswer, type ConfirmRequest, runAgent } from './agent'

type Reply =
  | { text?: string; reasoning?: string; calls?: { name: string; args: object | string }[] }
  | { status: number; message?: string }

/** A model that answers each request with the next reply, and remembers what it was sent. */
function model(replies: Reply[]) {
  const sent: { messages: AgentMessage[]; tools?: unknown[]; max_tokens?: number }[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)))
    const reply = replies.shift() ?? { text: 'ok' }
    if ('status' in reply) {
      return new Response(
        JSON.stringify({ error: { message: reply.message ?? 'model does not support tools' } }),
        { status: reply.status },
      )
    }
    const chunks = [
      ...(reply.reasoning
        ? [{ choices: [{ delta: { reasoning_content: reply.reasoning } }] }]
        : []),
      ...(reply.text ? [{ choices: [{ delta: { content: reply.text } }] }] : []),
      ...(reply.calls
        ? [
            {
              choices: [
                {
                  delta: {
                    tool_calls: reply.calls.map((c, index) => ({
                      index,
                      id: `c${sent.length}_${index}`,
                      function: {
                        name: c.name,
                        arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args),
                      },
                    })),
                  },
                },
              ],
            },
          ]
        : []),
    ]
    const body = `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n`
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  return { fetch, sent, replies }
}

async function setup(
  replies: Reply[],
  answers: ConfirmAnswer[] = [],
  mode: 'ask' | 'edits' = 'ask',
  extra: { remember?: (fact: string, replaces?: string) => Promise<string> } = {},
) {
  const db = await createMemoryDriver()
  await prepareDatabase(db)
  const repo = new NotesRepo(db)
  const audit = new AuditLog(db, repo)
  const done = actionCollector()
  const tools = new NoteTools(db, repo, audit, {
    gate: OPEN_GATE,
    provider: () => 'Test',
    kinds: 'chat',
    onChange: (a) => done.add(a.id),
  })
  const m = model(replies)
  const asked: ConfirmRequest[] = []
  const trace: ChatTrace = { steps: [] }
  const shown: string[] = []
  const run = () =>
    runAgent(
      {
        request: { url: 'x', model: 'm', fetch: m.fetch },
        messages: [
          { role: 'system', content: 'rules' },
          { role: 'user', content: 'go' },
        ],
        fallback: () => [
          { role: 'system', content: 'rules' },
          { role: 'user', content: 'history as text. go' },
        ],
        maxTokens: 8192,
        ...extra,
        tools,
        repo,
        mode,
        onText: (t) => shown.push(t),
        onActivity: () => {},
        confirm: async (r) => {
          asked.push(r)
          return answers.shift() ?? 'deny'
        },
      },
      done.label,
      trace,
    )
  return { repo, audit, done, sent: m.sent, replies: m.replies, asked, run, trace, shown }
}

describe('runAgent', () => {
  it('runs the tools the model calls and gives it their results', async () => {
    const t = await setup(
      [
        { calls: [{ name: 'create_note', args: { content: '# Shopping\n\n- milk' } }] },
        { text: 'Created.' },
      ],
      ['allow'],
    )
    expect(await t.run()).toBe('Created.')
    expect((await t.repo.listNotes()).items.map((n) => n.title)).toEqual(['Shopping'])
    expect(t.asked.map((a) => a.danger)).toEqual([false])
    expect(t.done.items).toHaveLength(1)
    const last = t.sent[1]?.messages.at(-1)
    expect(last).toMatchObject({
      role: 'tool',
      content: expect.stringMatching(/^Saved "Shopping"/),
    })
    expect(t.sent[0]?.tools?.length).toBeGreaterThan(5)
  })

  it('asks before deleting even in edits mode, and tells the model when the user says no', async () => {
    const t = await setup([], ['deny'], 'edits')
    const note = await t.repo.createNote({ content: '# Keep me' })
    t.replies.push(
      { calls: [{ name: 'delete_note', args: { id: note.id } }] },
      { text: 'Kept it.' },
    )
    expect(await t.run()).toBe('Kept it.')
    expect(t.asked).toMatchObject([{ danger: true, many: false }])
    expect(await t.repo.getNote(note.id)).not.toBeNull()
    expect(t.sent[1]?.messages.at(-1)?.content).toContain('declined')
    expect(t.done.items).toEqual([])
  })

  it('"allow all" lets the rest of the answer through without asking again', async () => {
    const calls = Array.from({ length: 7 }, (_, i) => ({
      name: 'create_note',
      args: { content: `# Note ${i}` },
    }))
    const t = await setup([{ calls }, { text: 'Done.' }], ['all'])
    await t.run()
    expect(t.asked).toHaveLength(1)
    expect(t.done.items).toHaveLength(7)
  })

  it('in edits mode asks once when many notes change', async () => {
    const calls = Array.from({ length: 7 }, (_, i) => ({
      name: 'create_note',
      args: { content: `# Note ${i}` },
    }))
    const t = await setup([{ calls }, { text: 'Done.' }], ['allow'], 'edits')
    await t.run()
    expect(t.asked).toHaveLength(1)
    expect(t.done.items).toHaveLength(7)
  })

  it('answers without tools when the model cannot use them', async () => {
    const t = await setup([{ status: 400 }, { text: 'From your notes: nothing.' }])
    expect(await t.run()).toBe('From your notes: nothing.')
    expect(t.sent[1]?.tools).toBeUndefined()
    expect(t.sent[1]?.messages[0]?.content).toContain('cannot use the tools')
  })

  it('answers with the last step only and keeps the steps for later turns', async () => {
    const t = await setup(
      [
        {
          text: 'Let me look.',
          reasoning: 'think',
          calls: [{ name: 'search_notes', args: { query: 'milk' } }],
        },
        { text: 'Nothing about milk.', reasoning: 'done thinking' },
      ],
      [],
    )
    expect(await t.run()).toBe('Nothing about milk.')
    expect(t.shown.at(-1)).toBe('Nothing about milk.')
    expect(t.trace.steps).toHaveLength(1)
    expect(t.trace.steps[0]).toMatchObject({
      text: 'Let me look.',
      reasoning: 'think',
      calls: [{ name: 'search_notes', result: expect.stringContaining('No notes match') }],
    })
    expect(t.trace.reasoning).toBe('done thinking')
    // The model gets its reasoning back with its calls.
    expect(t.sent[1]?.messages.at(-2)).toMatchObject({ reasoning_content: 'think' })
    expect(t.sent[0]?.max_tokens).toBe(8192)
  })

  it('takes the text before the last tool call when the model ends silently', async () => {
    const t = await setup([
      { text: 'Here is the answer.', calls: [{ name: 'list_folders', args: {} }] },
      { text: '' },
    ])
    expect(await t.run()).toBe('Here is the answer.')
  })

  it('tells the model when its arguments were cut off', async () => {
    // A long note cut by max_tokens: the arguments end mid-string.
    const t = await setup([
      { calls: [{ name: 'update_note', args: '{"id":"n1","content":"# Long note\n\nand so' }] },
      { text: 'I will change it in parts.' },
    ])
    expect(await t.run()).toBe('I will change it in parts.')
    expect(t.sent[1]?.messages.at(-1)?.content).toMatch(/cut off.*edit_note/)
    expect(t.asked).toEqual([])
  })

  it('saves what the user asks it to remember, through the memory callback', async () => {
    const remembered: string[] = []
    const t = await setup(
      [{ calls: [{ name: 'remember', args: { fact: 'Answer in English' } }] }, { text: 'Noted.' }],
      [],
      'ask',
      {
        remember: async (fact) => {
          remembered.push(fact)
          return `Remembered: "${fact}".`
        },
      },
    )
    expect(await t.run()).toBe('Noted.')
    expect(remembered).toEqual(['Answer in English'])
    // Remembering is not a note change: no question first.
    expect(t.asked).toEqual([])
    expect(
      t.sent[0]?.tools?.some(
        (x) => (x as { function: { name: string } }).function.name === 'remember',
      ),
    ).toBe(true)
  })

  it('sends the history as text when the provider refuses it for missing reasoning', async () => {
    const t = await setup([
      { status: 400, message: 'The reasoning_content in the thinking mode must be passed back' },
      { text: 'ok' },
    ])
    expect(await t.run()).toBe('ok')
    expect(t.sent[1]?.messages.at(-1)?.content).toContain('history as text')
    expect(t.sent[1]?.tools?.length).toBeGreaterThan(5)
  })
})
