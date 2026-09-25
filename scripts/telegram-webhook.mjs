// Points the Telegram bot at the telegram-bot edge function and sets its command list.
// Usage (PowerShell): $env:TELEGRAM_BOT_TOKEN="123:abc"; $env:TELEGRAM_WEBHOOK_SECRET="<same as the
// function secret>"; pnpm tg:webhook
// Nothing here is stored; the token is only sent to api.telegram.org.

// A manual script, not a Turborepo task, so its variables do not affect build caching.
const { env } = process
const token = env.TELEGRAM_BOT_TOKEN
const secret = env.TELEGRAM_WEBHOOK_SECRET
const project = env.SUPABASE_URL ?? 'https://nsteehqbmljuczxgkvae.supabase.co'
if (!token || !secret) {
  console.error(
    'Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET first (see the comment on top).',
  )
  process.exit(1)
}
if (!/^[\w-]{1,256}$/.test(secret)) {
  console.error(
    'TELEGRAM_WEBHOOK_SECRET may contain only letters, digits, _ and - (Telegram rule).',
  )
  process.exit(1)
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`${method}: ${json.description}`)
  return json.result
}

const me = await call('getMe')
await call('setWebhook', {
  url: `${project}/functions/v1/telegram-bot`,
  secret_token: secret,
  allowed_updates: ['message'],
  drop_pending_updates: true,
})
const commands = {
  en: [
    ['start', 'Connect this chat to FixNote'],
    ['stop', 'Disconnect'],
  ],
  ru: [
    ['start', 'Подключить чат к FixNote'],
    ['stop', 'Отключить'],
  ],
  es: [
    ['start', 'Conectar este chat a FixNote'],
    ['stop', 'Desconectar'],
  ],
}
for (const [lang, list] of Object.entries(commands)) {
  await call('setMyCommands', {
    commands: list.map(([command, description]) => ({ command, description })),
    ...(lang === 'en' ? {} : { language_code: lang }),
  })
}
console.log(`Webhook set for @${me.username}.`)
console.log(`Put VITE_TELEGRAM_BOT=${me.username} into .env.local (and the CI variables).`)
