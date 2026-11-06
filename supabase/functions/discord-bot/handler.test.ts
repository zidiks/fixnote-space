import { assertEquals } from 'jsr:@std/assert@1'
import sodium from 'npm:libsodium-wrappers@0.8.4'
import { type BotDeps, type CaptureStore, handle } from './handler.ts'

await sodium.ready
const V = sodium.base64_variants.URLSAFE_NO_PADDING
const keys = sodium.crypto_box_keypair()
const PK = sodium.to_base64(keys.publicKey, V)
const open = (sealed: string) =>
  JSON.parse(
    sodium.to_string(
      sodium.crypto_box_seal_open(sodium.from_base64(sealed, V), keys.publicKey, keys.privateKey),
    ),
  )

function setup() {
  const codes = new Map([['good-code', 'user-1']])
  const links = new Map<string, string>([['d-1', 'user-1']])
  const items: { user: string; sealed: string }[] = []
  const replies: string[] = []
  const tasks: Promise<unknown>[] = []
  const store: CaptureStore = {
    consumeCode: async (c) => {
      const u = codes.get(c) ?? null
      codes.delete(c)
      return u
    },
    link: async (d, user) => void links.set(d, user),
    unlink: async (d) => links.delete(d),
    userFor: async (d) => links.get(d) ?? null,
    publicKey: async () => PK,
    isPro: async (user) => user !== 'free-user',
    addItem: async (user, sealed) => void items.push({ user, sealed }),
  }
  const deps: BotDeps = {
    publicKey: 'aa',
    store,
    doneUrl: 'https://discord.com/channels/@me',
    now: () => 1000,
    verify: async (_pk, sig) => sig === 'good',
    defer: (t) => void tasks.push(t),
    discord: {
      editReply: async (_token, content) => void replies.push(content),
      download: async (url) => (url.includes('huge') ? null : new TextEncoder().encode(url)),
      userFromCode: async (code) => (code === 'dc' ? { id: 'd-2', label: 'Ann' } : null),
    },
    seal: async (pk, message) =>
      sodium.to_base64(
        sodium.crypto_box_seal(sodium.from_string(message), sodium.from_base64(pk, V)),
        V,
      ),
  }
  const send = (body: object, sig = 'good') =>
    handle(
      new Request('http://fn/discord-bot', {
        method: 'POST',
        headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': '1' },
        body: JSON.stringify(body),
      }),
      deps,
    )
  const settle = () => Promise.all(tasks)
  return { deps, items, replies, links, send, settle }
}

const saveMessage = (message: object, user = 'd-1') => ({
  type: 2,
  token: 'tok',
  locale: 'ru',
  guild_id: 'g',
  user: { id: user, username: 'me' },
  data: {
    name: 'Save to FixNote',
    type: 3,
    target_id: 'm1',
    resolved: {
      messages: {
        m1: {
          id: 'm1',
          channel_id: 'c1',
          content: '',
          timestamp: '2026-11-01T10:00:00.000Z',
          author: { id: 'x', username: 'bob', global_name: 'Bob' },
          ...message,
        },
      },
    },
  },
})

Deno.test('refuses a bad signature and answers PING', async () => {
  const { send } = setup()
  assertEquals((await send({ type: 1 }, 'bad')).status, 401)
  assertEquals(await (await send({ type: 1 })).json(), { type: 1 })
})

Deno.test('saves a message with its author and where it was', async () => {
  const { send, settle, items, replies } = setup()
  const res = await send(saveMessage({ content: 'Remember this' }))
  assertEquals((await res.json()).type, 5)
  await settle()
  assertEquals(items.length, 1)
  const p = open(items[0]?.sealed ?? '')
  assertEquals(p.kind, 'text')
  assertEquals(p.receivedAt, Date.parse('2026-11-01T10:00:00.000Z'))
  assertEquals(p.text, 'Remember this\n\n— Bob, [Discord](https://discord.com/channels/g/c1/m1)')
  assertEquals(replies, ['Сохранено в FixNote.'])
})

Deno.test('a message that is only a link is saved as a link; images and voice too', async () => {
  const { send, settle, items, replies } = setup()
  await send(
    saveMessage({
      content: '<https://example.com/a>',
      attachments: [
        {
          url: 'https://cdn.discordapp.com/1.png',
          filename: '1.png',
          size: 10,
          content_type: 'image/png',
        },
        {
          url: 'https://cdn.discordapp.com/x.zip',
          filename: 'x.zip',
          size: 10,
          content_type: 'application/zip',
        },
      ],
    }),
  )
  await settle()
  const kinds = items.map((i) => open(i.sealed).kind)
  assertEquals(kinds, ['link', 'photo'])
  assertEquals(open(items[0]?.sealed ?? '').url, 'https://example.com/a')
  assertEquals(replies, ['Сохранено в FixNote: 2. Другие файлы пока не поддерживаются.'])
})

Deno.test('/save keeps the words; not linked, Free and /disconnect answer at once', async () => {
  const { send, settle, items, links } = setup()
  const command = (name: string, user = 'd-1', options?: object[]) => ({
    type: 2,
    token: 't',
    user: { id: user },
    data: { name, type: 1, ...(options ? { options } : {}) },
  })
  await send(command('save', 'd-1', [{ name: 'text', value: 'an idea' }]))
  await settle()
  assertEquals(open(items[0]?.sealed ?? '').text, 'an idea')

  const notLinked = await (
    await send(command('save', 'd-9', [{ name: 'text', value: 'x' }]))
  ).json()
  assertEquals(notLinked.data.flags, 64)
  links.set('d-3', 'free-user')
  const free = await (await send(command('save', 'd-3', [{ name: 'text', value: 'x' }]))).json()
  assertEquals(String(free.data.content).includes('Pro'), true)

  await send(command('disconnect'))
  assertEquals(links.has('d-1'), false)
})

Deno.test('connect: links the Discord user with the code from the app', async () => {
  const { deps, links } = setup()
  const res = await handle(new Request('http://fn/discord-bot/oauth?code=dc&state=good-code'), deps)
  assertEquals(res.status, 302)
  assertEquals(links.get('d-2'), 'user-1')
  const again = await handle(
    new Request('http://fn/discord-bot/oauth?code=dc&state=good-code'),
    deps,
  )
  assertEquals(again.status, 400)
})
