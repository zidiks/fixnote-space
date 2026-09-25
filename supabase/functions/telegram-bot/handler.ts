/**
 * telegram-bot: the Telegram capture channel (webhook). Links a chat to an account with a one-time
 * code from the app, then seals every message (text, voice, photo) to the account's public key
 * and queues it in inbox_items. Plaintext exists only while the request runs and is never logged
 * or stored; the app opens the items and deletes them. The payload format is CapturePayload in
 * packages/core/src/capture.
 */

export interface TelegramApi {
  sendMessage(chatId: number, text: string): Promise<void>
  react(chatId: number, messageId: number, emoji: string): Promise<void>
  /** Bytes of a file the user sent, or null when it is too big or unavailable. */
  download(fileId: string, maxBytes: number): Promise<Uint8Array | null>
}

export interface CaptureStore {
  /** User of a valid, unexpired code; the code is used up. */
  consumeCode(code: string): Promise<string | null>
  link(chatId: string, userId: string, label: string): Promise<void>
  unlink(chatId: string): Promise<boolean>
  userForChat(chatId: string): Promise<string | null>
  publicKey(userId: string): Promise<string | null>
  addItem(userId: string, sealed: string): Promise<void>
}

export interface BotDeps {
  secret: string | undefined
  telegram: TelegramApi
  store: CaptureStore
  /** crypto_box_seal of the message to a base64url public key, base64url out. */
  seal(publicKey: string, message: string): Promise<string>
  now?: () => number
}

const MAX_FILE = 10 * 1024 * 1024

type Lang = 'en' | 'ru' | 'es'
const TEXT: Record<Lang, Record<string, string>> = {
  en: {
    linked: 'Done. Everything you send here will appear in FixNote. To disconnect, send /stop.',
    notLinked: 'This chat is not connected. In FixNote, open Settings → Account → Telegram.',
    badCode: 'This link has expired. Create a new one in FixNote: Settings → Account → Telegram.',
    stopped: 'Chat disconnected. Messages no longer go to FixNote.',
    unsupported: 'For now I take text, voice messages and photos.',
    tooBig: 'This file is too large (over 10 MB).',
    noKeys: 'Your FixNote account is not set up yet. Open the app and finish signing in.',
  },
  ru: {
    linked: 'Готово. Всё, что вы пришлёте сюда, появится в FixNote. Отключить: /stop',
    notLinked: 'Этот чат не подключён. В FixNote откройте Настройки → Аккаунт → Telegram.',
    badCode: 'Ссылка устарела. Создайте новую в FixNote: Настройки → Аккаунт → Telegram.',
    stopped: 'Чат отключён. Сообщения больше не попадают в FixNote.',
    unsupported: 'Пока принимаю текст, голосовые и фото.',
    tooBig: 'Файл слишком большой (больше 10 МБ).',
    noKeys: 'Аккаунт FixNote ещё не настроен. Откройте приложение и завершите вход.',
  },
  es: {
    linked: 'Listo. Todo lo que envíes aquí aparecerá en FixNote. Para desconectar, envía /stop.',
    notLinked: 'Este chat no está conectado. En FixNote, abre Ajustes → Cuenta → Telegram.',
    badCode: 'Este enlace ha caducado. Crea uno nuevo en FixNote: Ajustes → Cuenta → Telegram.',
    stopped: 'Chat desconectado. Los mensajes ya no llegan a FixNote.',
    unsupported: 'Por ahora acepto texto, mensajes de voz y fotos.',
    tooBig: 'Este archivo es demasiado grande (más de 10 MB).',
    noKeys: 'Tu cuenta de FixNote aún no está lista. Abre la app y termina de iniciar sesión.',
  },
}

const lang = (code: string | undefined): Lang =>
  code?.startsWith('ru') || code?.startsWith('uk') || code?.startsWith('be')
    ? 'ru'
    : code?.startsWith('es')
      ? 'es'
      : 'en'

interface TgMessage {
  message_id: number
  chat: { id: number; type: string; title?: string; username?: string; first_name?: string }
  from?: { language_code?: string }
  text?: string
  caption?: string
  voice?: { file_id: string; duration?: number; mime_type?: string; file_size?: number }
  audio?: { file_id: string; duration?: number; mime_type?: string; file_size?: number }
  photo?: { file_id: string; width: number; height: number; file_size?: number }[]
  forward_origin?: {
    type: string
    sender_user?: { first_name?: string; last_name?: string }
    sender_user_name?: string
    chat?: { title?: string }
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function forwardedFrom(m: TgMessage): string | null {
  const o = m.forward_origin
  if (!o) return null
  const user = [o.sender_user?.first_name, o.sender_user?.last_name].filter(Boolean).join(' ')
  return o.sender_user_name || user || o.chat?.title || null
}

export async function handle(req: Request, deps: BotDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!deps.secret || req.headers.get('x-telegram-bot-api-secret-token') !== deps.secret) {
    return new Response('Unauthorized', { status: 401 })
  }
  let update: { message?: TgMessage }
  try {
    update = (await req.json()) as { message?: TgMessage }
  } catch {
    return new Response('ok')
  }
  const m = update.message
  // Private chats only: a group would mix other people's messages into the notes.
  if (m?.chat.type !== 'private') return new Response('ok')
  try {
    await onMessage(m, deps)
  } catch {
    // Telegram retries non-2xx answers; a failed message is better lost than duplicated.
  }
  return new Response('ok')
}

async function onMessage(m: TgMessage, deps: BotDeps) {
  const t = TEXT[lang(m.from?.language_code)]
  const chatId = String(m.chat.id)
  const say = (text: string) => deps.telegram.sendMessage(m.chat.id, text)
  const command = m.text?.match(/^\/(start|stop)(?:@\w+)?(?:\s+(\S+))?/)

  if (command?.[1] === 'start') {
    const code = command[2]
    if (!code) {
      await say((await deps.store.userForChat(chatId)) ? t.linked : t.notLinked)
      return
    }
    const user = await deps.store.consumeCode(code)
    if (!user) {
      await say(t.badCode)
      return
    }
    const label = m.chat.username ? `@${m.chat.username}` : (m.chat.first_name ?? '')
    await deps.store.link(chatId, user, label)
    await say(t.linked)
    return
  }
  if (command?.[1] === 'stop') {
    await deps.store.unlink(chatId)
    await say(t.stopped)
    return
  }

  const user = await deps.store.userForChat(chatId)
  if (!user) {
    await say(t.notLinked)
    return
  }
  const publicKey = await deps.store.publicKey(user)
  if (!publicKey) {
    await say(t.noKeys)
    return
  }

  const receivedAt = (deps.now ?? Date.now)()
  const from = forwardedFrom(m)
  const caption = [m.caption ?? '', from ? `— ${from}` : ''].filter(Boolean).join('\n\n')
  let payload: Record<string, unknown>
  const file = m.voice ?? m.audio
  const photo = m.photo?.at(-1)
  if (m.text) {
    payload = { kind: 'text', text: [m.text, from ? `— ${from}` : ''].filter(Boolean).join('\n\n') }
  } else if (file) {
    if ((file.file_size ?? 0) > MAX_FILE) return void (await say(t.tooBig))
    const bytes = await deps.telegram.download(file.file_id, MAX_FILE)
    if (!bytes) return void (await say(t.tooBig))
    payload = {
      kind: 'voice',
      audio: toBase64(bytes),
      mime: file.mime_type ?? 'audio/ogg',
      ...(file.duration ? { durationSec: file.duration } : {}),
      ...(caption ? { caption } : {}),
    }
  } else if (photo) {
    if ((photo.file_size ?? 0) > MAX_FILE) return void (await say(t.tooBig))
    const bytes = await deps.telegram.download(photo.file_id, MAX_FILE)
    if (!bytes) return void (await say(t.tooBig))
    payload = {
      kind: 'photo',
      image: toBase64(bytes),
      mime: 'image/jpeg',
      ...(caption ? { caption } : {}),
    }
  } else {
    await say(t.unsupported)
    return
  }

  const sealed = await deps.seal(publicKey, JSON.stringify({ v: 1, receivedAt, ...payload }))
  await deps.store.addItem(user, sealed)
  await deps.telegram.react(m.chat.id, m.message_id, '👌').catch(() => undefined)
}
