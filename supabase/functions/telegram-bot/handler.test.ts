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
  const sent: { chat: number; text: string }[] = []
  const reactions: number[] = []
  const codes = new Map([['good-code', 'user-1']])
  const links = new Map<string, string>()
  const items: { user: string; sealed: string }[] = []
  const store: CaptureStore = {
    consumeCode: async (c) => {
      const u = codes.get(c) ?? null
      codes.delete(c)
      return u
    },
    link: async (chat, user) => void links.set(chat, user),
    unlink: async (chat) => links.delete(chat),
    userForChat: async (chat) => links.get(chat) ?? null,
    publicKey: async (user) => (user === 'user-1' ? PK : null),
    addItem: async (user, sealed) => void items.push({ user, sealed }),
  }
  const deps: BotDeps = {
    secret: 's3cret',
    store,
    now: () => 1000,
    telegram: {
      sendMessage: async (chat, text) => void sent.push({ chat, text }),
      react: async (_c, id) => void reactions.push(id),
      download: async (id) => (id === 'huge' ? null : new TextEncoder().encode(`bytes of ${id}`)),
    },
    seal: async (pk, message) =>
      sodium.to_base64(
        sodium.crypto_box_seal(sodium.from_string(message), sodium.from_base64(pk, V)),
        V,
      ),
  }
  const send = (message: object, secret = 's3cret') =>
    handle(
      new Request('http://fn', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': secret },
        body: JSON.stringify({
          message: {
            message_id: 7,
            chat: { id: 42, type: 'private' },
            from: { language_code: 'ru' },
            ...message,
          },
        }),
      }),
      deps,
    )
  return { sent, reactions, links, items, send }
}

Deno.test('rejects requests without the webhook secret', async () => {
  const { send, items } = setup()
  assertEquals((await send({ text: 'hi' }, 'wrong')).status, 401)
  assertEquals(items.length, 0)
})

Deno.test('links a chat with a one-time code, in the user language', async () => {
  const { send, sent, links } = setup()
  await send({ text: 'hello' })
  assertEquals(sent.at(-1)?.text.startsWith('Этот чат не подключён'), true)
  await send({ text: '/start bad-code' })
  assertEquals(sent.at(-1)?.text.startsWith('Ссылка устарела'), true)
  await send({ text: '/start good-code' })
  assertEquals(links.get('42'), 'user-1')
  assertEquals(sent.at(-1)?.text.startsWith('Готово'), true)
  await send({ text: '/start good-code' })
  assertEquals(sent.at(-1)?.text.startsWith('Ссылка устарела'), true)
})

Deno.test('seals text, voice and photos to the account key; nothing readable is stored', async () => {
  const { send, items, reactions, links } = setup()
  links.set('42', 'user-1')
  await send({
    text: 'Купить молоко',
    forward_origin: { type: 'user', sender_user: { first_name: 'Аня' } },
  })
  await send({ voice: { file_id: 'v1', duration: 3, mime_type: 'audio/ogg' } })
  await send({
    photo: [
      { file_id: 'small', width: 90, height: 90 },
      { file_id: 'big', width: 1280, height: 960 },
    ],
    caption: 'Доска',
  })
  assertEquals(items.length, 3)
  assertEquals(
    items.every((i) => i.user === 'user-1' && !i.sealed.includes('молоко')),
    true,
  )
  assertEquals(open(items[0]?.sealed ?? ''), {
    v: 1,
    receivedAt: 1000,
    kind: 'text',
    text: 'Купить молоко\n\n— Аня',
  })
  const voice = open(items[1]?.sealed ?? '')
  assertEquals(
    [voice.kind, voice.mime, voice.durationSec, atob(voice.audio)],
    ['voice', 'audio/ogg', 3, 'bytes of v1'],
  )
  const photo = open(items[2]?.sealed ?? '')
  assertEquals([photo.kind, photo.caption, atob(photo.image)], ['photo', 'Доска', 'bytes of big'])
  assertEquals(reactions, [7, 7, 7])
})

Deno.test('refuses big files, unsupported messages and group chats; /stop unlinks', async () => {
  const { send, items, sent, links } = setup()
  links.set('42', 'user-1')
  await send({ voice: { file_id: 'huge' } })
  assertEquals(sent.at(-1)?.text.startsWith('Файл слишком большой'), true)
  await send({ sticker: { file_id: 's' } })
  assertEquals(sent.at(-1)?.text.startsWith('Пока принимаю'), true)
  await handle(
    new Request('http://fn', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 's3cret' },
      body: JSON.stringify({
        message: { message_id: 1, chat: { id: -5, type: 'group' }, text: 'x' },
      }),
    }),
    { secret: 's3cret' } as BotDeps,
  )
  await send({ text: '/stop' })
  assertEquals(links.has('42'), false)
  assertEquals(items.length, 0)
})
