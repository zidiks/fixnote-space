/**
 * Registers the Discord app's commands (run once, and after changing them):
 *
 *   DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… deno run --allow-net --allow-env register.ts
 *
 * User-installed (integration type 1), usable in servers, the bot's DM and other DMs.
 */
const appId = Deno.env.get('DISCORD_APP_ID')
const token = Deno.env.get('DISCORD_BOT_TOKEN')
if (!appId || !token) throw new Error('DISCORD_APP_ID and DISCORD_BOT_TOKEN are needed')

const everywhere = { integration_types: [1], contexts: [0, 1, 2] }

const commands = [
  {
    // Message command: right-click a message → Apps.
    type: 3,
    name: 'Save to Fixnote',
    name_localizations: { ru: 'Сохранить в Fixnote', 'es-ES': 'Guardar en Fixnote' },
    ...everywhere,
  },
  {
    type: 1,
    name: 'save',
    description: 'Save text or a link to Fixnote',
    description_localizations: {
      ru: 'Сохранить текст или ссылку в Fixnote',
      'es-ES': 'Guardar texto o un enlace en Fixnote',
    },
    options: [
      {
        type: 3,
        name: 'text',
        description: 'What to save',
        description_localizations: { ru: 'Что сохранить', 'es-ES': 'Qué guardar' },
        required: true,
      },
    ],
    ...everywhere,
  },
  {
    type: 1,
    name: 'disconnect',
    description: 'Stop saving from Discord to Fixnote',
    description_localizations: {
      ru: 'Больше не сохранять из Discord в Fixnote',
      'es-ES': 'Dejar de guardar de Discord en Fixnote',
    },
    ...everywhere,
  },
]

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
})
console.log(res.status, await res.text())
