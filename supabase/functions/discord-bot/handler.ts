/**
 * discord-bot: the Discord capture channel. A user-installed Discord app (it works in any server
 * and DM the person is in, nothing to add to a server):
 *
 * - "Save to FixNote" on any message (right-click → Apps), `/save text:…`, `/disconnect`;
 * - `GET …/discord-bot/oauth`: the end of "Connect" in FixNote (Discord's OAuth with
 *   `state` = the one-time code from the app) links the Discord user to the account.
 *
 * Discord sends plain messages only over its Gateway (a WebSocket an edge function cannot hold),
 * so saving is a command, sent here as an HTTP interaction signed with Ed25519. Like the Telegram
 * bot, every message is sealed to the account's public key and queued in inbox_items; plaintext
 * exists only while the request runs. The payload format is CapturePayload in
 * packages/core/src/capture. A message that is only a link is sent as a link (the app files it).
 */

export interface DiscordApi {
  /** Replaces the "thinking…" answer of a deferred interaction. */
  editReply(token: string, content: string): Promise<void>
  /** Bytes of an attachment, or null when too big or unavailable. */
  download(url: string, maxBytes: number): Promise<Uint8Array | null>
  /** OAuth: the Discord user behind an authorization code. */
  userFromCode(code: string): Promise<{ id: string; label: string } | null>
}

export interface CaptureStore {
  consumeCode(code: string): Promise<string | null>
  link(discordUser: string, userId: string, label: string): Promise<void>
  unlink(discordUser: string): Promise<boolean>
  userFor(discordUser: string): Promise<string | null>
  publicKey(userId: string): Promise<string | null>
  isPro(userId: string): Promise<boolean>
  addItem(userId: string, sealed: string): Promise<void>
}

export interface BotDeps {
  /** The application's public key (hex), to check Discord's signature. */
  publicKey: string | undefined
  discord: DiscordApi
  store: CaptureStore
  seal(publicKey: string, message: string): Promise<string>
  /** Keeps work going after the response (EdgeRuntime.waitUntil). */
  defer(task: Promise<unknown>): void
  /** Where the browser goes after connecting. */
  doneUrl: string
  now?: () => number
  /** Signature check; tests replace it. */
  verify?: (publicKey: string, signature: string, message: string) => Promise<boolean>
}

const MAX_FILE = 10 * 1024 * 1024
const EPHEMERAL = 64
const IS_VOICE_MESSAGE = 1 << 13

type Lang = 'en' | 'ru' | 'es'
const TEXT: Record<Lang, Record<string, string>> = {
  en: {
    saved: 'Saved to FixNote.',
    savedSome: 'Saved to FixNote: {n}. Other files are not supported yet.',
    notLinked:
      'Discord is not connected to FixNote yet. In FixNote, open Settings → Integrations → Discord.',
    badCode:
      'This link has expired. Create a new one in FixNote: Settings → Integrations → Discord.',
    stopped: 'Disconnected. Nothing from Discord goes to FixNote now.',
    empty: 'There is nothing in this message I can save.',
    noKeys: 'Your FixNote account is not set up yet. Open the app and finish signing in.',
    needsPro:
      'Saving from messengers is part of FixNote Pro. Open FixNote → Settings → Plan to upgrade.',
    failed: 'Could not save this one. Try again in a moment.',
  },
  ru: {
    saved: 'Сохранено в FixNote.',
    savedSome: 'Сохранено в FixNote: {n}. Другие файлы пока не поддерживаются.',
    notLinked:
      'Discord ещё не подключён к FixNote. В FixNote откройте Настройки → Интеграции → Discord.',
    badCode: 'Ссылка устарела. Создайте новую в FixNote: Настройки → Интеграции → Discord.',
    stopped: 'Отключено. Из Discord в FixNote больше ничего не попадает.',
    empty: 'В этом сообщении нечего сохранить.',
    noKeys: 'Аккаунт FixNote ещё не настроен. Откройте приложение и завершите вход.',
    needsPro:
      'Сохранение из мессенджеров входит в FixNote Pro. Откройте FixNote → Настройки → Тариф.',
    failed: 'Не получилось сохранить. Попробуйте ещё раз чуть позже.',
  },
  es: {
    saved: 'Guardado en FixNote.',
    savedSome: 'Guardado en FixNote: {n}. Otros archivos aún no se admiten.',
    notLinked:
      'Discord aún no está conectado a FixNote. En FixNote, abre Ajustes → Integraciones → Discord.',
    badCode:
      'Este enlace ha caducado. Crea uno nuevo en FixNote: Ajustes → Integraciones → Discord.',
    stopped: 'Desconectado. Nada de Discord llega ya a FixNote.',
    empty: 'No hay nada que guardar en este mensaje.',
    noKeys: 'Tu cuenta de FixNote aún no está lista. Abre la app y termina de iniciar sesión.',
    needsPro: 'Guardar desde mensajería es parte de FixNote Pro. Abre FixNote → Ajustes → Plan.',
    failed: 'No se pudo guardar. Inténtalo de nuevo en un momento.',
  },
}

const lang = (locale: string | undefined): Lang =>
  locale?.startsWith('ru') || locale?.startsWith('uk')
    ? 'ru'
    : locale?.startsWith('es')
      ? 'es'
      : 'en'

interface DcUser {
  id: string
  username?: string
  global_name?: string | null
}

interface DcAttachment {
  url: string
  filename: string
  size: number
  content_type?: string
  duration_secs?: number
}

interface DcMessage {
  id: string
  channel_id: string
  content: string
  timestamp: string
  flags?: number
  author: DcUser
  attachments?: DcAttachment[]
  embeds?: { url?: string; title?: string; description?: string }[]
}

interface Interaction {
  type: number
  token: string
  locale?: string
  guild_id?: string
  user?: DcUser
  member?: { user: DcUser }
  data?: {
    name: string
    type: number
    target_id?: string
    options?: { name: string; value: unknown }[]
    resolved?: { messages?: Record<string, DcMessage> }
  }
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const reply = (content: string) => json({ type: 4, data: { content, flags: EPHEMERAL } })

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function ed25519(publicKey: string, signature: string, message: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexBytes(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexBytes(signature),
      new TextEncoder().encode(message),
    )
  } catch {
    return false
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

const nameOf = (u: DcUser) => u.global_name || u.username || ''
const escapeLabel = (text: string) => text.replace(/[[\]\\]/g, '\\$&')
const onlyUrl = (text: string) => {
  const t = text.trim().replace(/^<(.+)>$/, '$1')
  return /^https?:\/\/\S+$/i.test(t) ? t : null
}

/** What one message becomes: one payload per thing worth keeping (text, each image, voice). */
export async function payloadsOf(
  m: DcMessage,
  guildId: string | undefined,
  discord: DiscordApi,
): Promise<{ payloads: Record<string, unknown>[]; skipped: number }> {
  const receivedAt = Date.parse(m.timestamp) || Date.now()
  const where = `https://discord.com/channels/${guildId ?? '@me'}/${m.channel_id}/${m.id}`
  const signature = `— ${escapeLabel(nameOf(m.author))}, [Discord](${where})`
  const payloads: Record<string, unknown>[] = []
  let skipped = 0

  const url =
    onlyUrl(m.content) ?? (!m.content.trim() ? (m.embeds?.find((e) => e.url)?.url ?? null) : null)
  if (url) payloads.push({ kind: 'link', url, receivedAt })
  else if (m.content.trim())
    payloads.push({ kind: 'text', text: `${m.content.trim()}\n\n${signature}`, receivedAt })

  for (const a of m.attachments ?? []) {
    const type = a.content_type ?? ''
    const voice = Boolean((m.flags ?? 0) & IS_VOICE_MESSAGE) || type.startsWith('audio/')
    if (!(voice || type.startsWith('image/')) || a.size > MAX_FILE) {
      skipped++
      continue
    }
    const bytes = await discord.download(a.url, MAX_FILE)
    if (!bytes) {
      skipped++
      continue
    }
    payloads.push(
      voice
        ? {
            kind: 'voice',
            audio: toBase64(bytes),
            mime: type || 'audio/ogg',
            ...(a.duration_secs ? { durationSec: Math.round(a.duration_secs) } : {}),
            caption: signature,
            receivedAt,
          }
        : { kind: 'photo', image: toBase64(bytes), mime: type, caption: signature, receivedAt },
    )
  }
  return { payloads, skipped }
}

export async function handle(req: Request, deps: BotDeps): Promise<Response> {
  const path = new URL(req.url).pathname
  if (req.method === 'GET' && path.endsWith('/oauth')) return connect(req, deps)
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.text()
  const signature = req.headers.get('x-signature-ed25519') ?? ''
  const timestamp = req.headers.get('x-signature-timestamp') ?? ''
  const verify = deps.verify ?? ed25519
  if (!deps.publicKey || !(await verify(deps.publicKey, signature, timestamp + body))) {
    return new Response('Bad signature', { status: 401 })
  }
  let i: Interaction
  try {
    i = JSON.parse(body) as Interaction
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (i.type === 1) return json({ type: 1 }) // PING
  if (i.type !== 2 || !i.data) return reply('')

  const t = TEXT[lang(i.locale)]
  const who = i.user ?? i.member?.user
  if (!who) return reply(t.failed)

  if (i.data.name === 'disconnect') {
    await deps.store.unlink(who.id)
    return reply(t.stopped)
  }
  const user = await deps.store.userFor(who.id)
  if (!user) return reply(t.notLinked)
  const publicKey = await deps.store.publicKey(user)
  if (!publicKey) return reply(t.noKeys)
  if (!(await deps.store.isPro(user))) return reply(t.needsPro)

  let message: DcMessage | undefined
  if (i.data.type === 3 && i.data.target_id) message = i.data.resolved?.messages?.[i.data.target_id]
  else if (i.data.name === 'save') {
    const text = i.data.options?.find((o) => o.name === 'text')?.value
    if (typeof text === 'string' && text.trim()) {
      message = {
        id: '',
        channel_id: '',
        content: text,
        timestamp: new Date((deps.now ?? Date.now)()).toISOString(),
        author: who,
      }
    }
  }
  if (!message) return reply(t.empty)

  const target = message
  const fromCommand = i.data.name === 'save'
  // Attachments take a moment: answer "thinking…" at once, then say how it went.
  deps.defer(
    (async () => {
      let answer = t.failed
      try {
        const { payloads, skipped } = fromCommand
          ? { payloads: [commandPayload(target)], skipped: 0 }
          : await payloadsOf(target, i.guild_id, deps.discord)
        for (const p of payloads) {
          const sealed = await deps.seal(publicKey, JSON.stringify({ v: 1, ...p }))
          await deps.store.addItem(user, sealed)
        }
        answer = !payloads.length
          ? t.empty
          : skipped
            ? t.savedSome.replace('{n}', String(payloads.length))
            : t.saved
      } catch {
        // answer stays "failed"
      }
      await deps.discord.editReply(i.token, answer).catch(() => undefined)
    })(),
  )
  return json({ type: 5, data: { flags: EPHEMERAL } })
}

/** `/save text:…`: the person's own words (a bare link stays a link). */
function commandPayload(m: DcMessage): Record<string, unknown> {
  const receivedAt = Date.parse(m.timestamp) || Date.now()
  const url = onlyUrl(m.content)
  return url
    ? { kind: 'link', url, receivedAt }
    : { kind: 'text', text: m.content.trim(), receivedAt }
}

/** Discord sends the browser back here after "Connect": link the user, then back to Discord. */
async function connect(req: Request, deps: BotDeps): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const t = TEXT[lang(req.headers.get('accept-language') ?? undefined)]
  const text = (s: string, status = 400) =>
    new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  if (!code || !state) return text(t.badCode)
  const who = await deps.discord.userFromCode(code)
  if (!who) return text(t.failed, 502)
  const user = await deps.store.consumeCode(state)
  if (!user) return text(t.badCode)
  await deps.store.link(who.id, user, who.label)
  return new Response(null, { status: 302, headers: { Location: deps.doneUrl } })
}
