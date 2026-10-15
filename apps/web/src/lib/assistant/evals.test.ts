import {
  type AgentMessage,
  buildAgentMessages,
  CLEARED_RESULT,
  historyMessages,
  messagesTokens,
  parseCitations,
  planContext,
} from '@fixnote/ai'
import {
  AuditLog,
  type ChatEntry,
  type ChatTrace,
  type Fragment,
  NotesRepo,
  NoteTools,
  OPEN_GATE,
  prepareDatabase,
  readMemory,
  type SqlDriver,
  withFact,
} from '@fixnote/core'
import { createMemoryDriver } from '@fixnote/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { actionCollector, runAgent } from './agent'
import { pastTurns } from './history'

/**
 * Multi-turn regression scenarios with a scripted model: each checks what the model is sent in a
 * later turn (what it remembers), not how clever its answers are. The manual evaluation set with
 * a real model is docs/assistant-evals.md.
 */

type Step = {
  text?: string
  reasoning?: string
  calls?: { name: string; args: object | ((sent: AgentMessage[]) => object) }[]
}

interface Sent {
  messages: AgentMessage[]
  tools?: { function: { name: string } }[]
}

function scriptedModel() {
  const replies: Step[] = []
  const sent: Sent[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Sent
    sent.push(body)
    const reply = replies.shift() ?? { text: 'ok' }
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
                      id: `call_${index}`,
                      function: {
                        name: c.name,
                        arguments: JSON.stringify(
                          typeof c.args === 'function' ? c.args(body.messages) : c.args,
                        ),
                      },
                    })),
                  },
                },
              ],
            },
          ]
        : []),
    ]
    const text = `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n`
    return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  return { fetch, replies, sent }
}

let db: SqlDriver
let repo: NotesRepo
let audit: AuditLog
let entries: ChatEntry[]
let clock: number
let model: ReturnType<typeof scriptedModel>

beforeEach(async () => {
  db = await createMemoryDriver()
  await prepareDatabase(db)
  repo = new NotesRepo(db)
  audit = new AuditLog(db, repo)
  entries = []
  clock = 1000
  model = scriptedModel()
})

/** One turn as the app runs it: history from the thread, the agent, the answer kept with its trace. */
async function turn(
  question: string,
  script: Step[],
  opts: { fragments?: Fragment[]; reasoning?: boolean; clearedUpTo?: number } = {},
) {
  model.replies.push(...script)
  const done = actionCollector()
  const tools = new NoteTools(db, repo, audit, {
    gate: OPEN_GATE,
    provider: () => 'Test',
    kinds: 'chat',
    onChange: (a) => done.add(a.id),
  })
  const fragments = opts.fragments ?? []
  const trace: ChatTrace = {
    steps: [],
    found: fragments.map((f, i) => ({ n: i + 1, noteId: f.noteId, title: f.title })),
  }
  const before = model.sent.length
  const text = await runAgent(
    {
      request: { url: 'x', model: 'm', fetch: model.fetch },
      messages: buildAgentMessages({
        question,
        fragments,
        scope: { kind: 'all' },
        history: pastTurns(entries),
        clearedUpTo: opts.clearedUpTo ?? 0,
        reasoning: Boolean(opts.reasoning),
        memory: await readMemory(db),
      }),
      maxTokens: 8192,
      tools,
      repo,
      mode: 'edits',
      remember: async (fact) => {
        const action = await audit.recordMemory(
          { kind: 'chat.memory', summary: fact, provider: 'Test' },
          withFact(await readMemory(db), fact),
        )
        if (action) done.items.push({ id: action.id, label: `Remembered «${fact}»` })
        return `Remembered: "${fact}".`
      },
      onText: () => {},
      onActivity: () => {},
      confirm: async () => 'allow',
    },
    done.label,
    trace,
  )
  const scope = { kind: 'all' as const }
  entries.push(
    {
      id: `q${clock}`,
      kind: 'user',
      content: question,
      scope,
      citations: [],
      confidence: null,
      status: null,
      createdAt: clock++,
    },
    {
      id: `a${clock}`,
      kind: 'assistant',
      content: text,
      scope,
      citations: parseCitations(text, fragments),
      confidence: null,
      status: 'done',
      actions: done.items.length ? { items: [...done.items], undone: false } : null,
      trace,
      createdAt: clock++,
    },
  )
  return { text, sent: model.sent.slice(before), done }
}

const fragment = (noteId: string, title: string, text: string): Fragment => ({
  noteId,
  title,
  ord: 0,
  text,
  updatedAt: Date.now(),
  via: { keyword: true, semantic: false },
  score: 1,
})

describe('assistant scenarios', () => {
  it('a follow-up sees the note the previous answer read (no second search needed)', async () => {
    const note = await repo.createNote({
      content: '# Georgia trip\n\nTickets: May 12\nHotel: Tbilisi',
    })
    await turn('What did I plan for the Georgia trip?', [
      { calls: [{ name: 'get_note', args: { id: note.id } }] },
      { text: 'Tickets for May 12.' },
    ])
    const { sent } = await turn('а что ещё там было?', [{ text: 'A hotel in Tbilisi.' }])
    const tool = sent[0]?.messages.find((m) => m.role === 'tool')
    expect(tool?.content).toContain('Hotel: Tbilisi')
    expect(tool?.content).toContain(`id: ${note.id}`)
  })

  it('an undone change is reflected, so the model does not claim it still stands', async () => {
    const t1 = await turn('Create a shopping list with milk', [
      { calls: [{ name: 'create_note', args: { content: '# Shopping\n\n- milk' } }] },
      { text: 'Created «Shopping».' },
    ])
    const [action] = t1.done.items
    await audit.undo(action?.id ?? '')
    const answer = entries.at(-1)
    if (answer?.actions) answer.actions = { ...answer.actions, undone: true }
    const { sent } = await turn('Is my shopping list there?', [{ text: 'No, you undid it.' }])
    const replayed = sent[0]?.messages.filter((m) => m.role === 'assistant').at(-1)
    expect(replayed?.content).toContain('The user then undid all of these changes')
  })

  it('old [n] citations become note names in the history', async () => {
    const f = fragment('n1', 'Budget', 'Rent 900')
    await turn('How much is rent?', [{ text: 'Rent is 900 [1].' }], { fragments: [f] })
    const { sent } = await turn('and utilities?', [{ text: 'Not in your notes.' }])
    const replayed = sent[0]?.messages.find((m) => m.role === 'assistant')
    expect(replayed?.content).toBe('Rent is 900.\n\nSources: "Budget" (id: n1)')
    const question = sent[0]?.messages.find(
      (m) => m.role === 'user' && m !== sent[0]?.messages.at(-1),
    )
    expect(question?.content).toContain('Notes found for this message: "Budget" (id: n1)')
  })

  it('remembers a preference into the memory that comes with every later chat', async () => {
    const t = await turn('Remember that I want answers in English', [
      { calls: [{ name: 'remember', args: { fact: 'Answer in English' } }] },
      { text: 'Noted.' },
    ])
    expect(t.done.items.map((i) => i.label)).toEqual(['Remembered «Answer in English»'])
    entries = [] // "New chat"
    const { sent } = await turn('hi', [{ text: 'Hello!' }])
    expect(sent[0]?.messages[0]?.content).toContain('- Answer in English')
    expect(sent[0]?.tools?.map((x) => x.function.name)).toContain('remember')
  })

  it('a long rewrite is steered to edit_note, and only the final text is the answer', async () => {
    const note = await repo.createNote({ content: `# Long\n\n${'Paragraph. '.repeat(800)}\n\nEnd` })
    const { text, sent } = await turn('Fix the ending of this note', [
      { text: 'Let me read it first.', calls: [{ name: 'get_note', args: { id: note.id } }] },
      { calls: [{ name: 'edit_note', args: { id: note.id, find: 'End', replace: 'The end.' } }] },
      { text: 'Changed the ending.' },
    ])
    expect(text).toBe('Changed the ending.')
    expect((await repo.getNote(note.id))?.content.endsWith('The end.')).toBe(true)
    expect(sent[0]?.messages[0]?.content).toContain('Use update_note only to rewrite a short note')
  })

  it('returning to the start of a long chat: old results are a stub, the calls and answers stay', async () => {
    const note = await repo.createNote({ content: `# Ideas\n\n${'idea '.repeat(2000)}` })
    for (let i = 0; i < 8; i++) {
      await turn(`question ${i}`, [
        { calls: [{ name: 'get_note', args: { id: note.id } }] },
        { text: `answer ${i}` },
      ])
    }
    const turns = pastTurns(entries)
    const prompt = Math.ceil(
      messagesTokens(historyMessages(turns, { clearedUpTo: 0, reasoning: false })) / 0.65,
    )
    const plan = planContext(turns, { fixed: 0, prompt, clearedUpTo: 0, reasoning: false })
    expect(plan.compact).toBe(0)
    const { sent } = await turn('what was my first question?', [{ text: 'question 0' }], {
      clearedUpTo: plan.clearedUpTo,
    })
    const messages = sent[0]?.messages ?? []
    expect(messages[1]?.content).toBe('question 0')
    expect(messages.find((m) => m.role === 'tool')?.content).toBe(CLEARED_RESULT)
    // The two latest turns keep their results whole.
    expect(messages.filter((m) => m.role === 'tool').at(-1)?.content).toContain('idea idea')
  })

  it('a thinking model gets every earlier reasoning back with the structured history', async () => {
    await turn(
      'list my folders',
      [
        { reasoning: 'Use list_folders.', calls: [{ name: 'list_folders', args: {} }] },
        { reasoning: 'Nothing there.', text: 'No folders yet.' },
      ],
      { reasoning: true },
    )
    const { sent } = await turn('ok, and recent notes?', [{ text: 'None.' }], { reasoning: true })
    const assistants = (sent[0]?.messages ?? []).filter((m) => m.role === 'assistant')
    expect(assistants.map((m) => ('reasoning_content' in m ? m.reasoning_content : null))).toEqual([
      'Use list_folders.',
      'Nothing there.',
    ])
  })
})
