# FixNote

Private personal notes with an assistant that helps you remember. Local-first, end-to-end encrypted,
voice input, chat over your notes, MCP. Desktop (Tauri, Windows first) and web from one codebase.

- Product and architecture concept: [docs/CONCEPT.md](docs/CONCEPT.md)

## What works today (M5)

Offline first, on web and desktop; an account is optional and only adds sync:

- Notes in Markdown with a Bear-like editor: headings, lists, checklists, quotes, code, links,
  images (paste or drop; large ones are scaled down).
- Home shows every note with filters (no folder, folder, type, period) and infinite scroll;
  folders with subfolders; `#tags` and nested `#area/project` tags from the text.
- Link cards: a URL alone on its line shows the page's title, description and image.
- Spotlight: recent notes, full-text search with highlighted snippets in ru/es/en that also tries
  the other alphabet ("телеграм" finds "Telegram"), notes similar in meaning once the assistant's
  index is ready, commands.
- Daily note, soft delete with undo, blank notes discarded automatically.
- Sync across devices with end-to-end encryption: sign in with an email code, keep a 12-word
  recovery phrase; the server stores only ciphertext. Concurrent edits merge line by line; if two
  devices changed the same line, both versions are kept.
- Export of all notes as a Markdown zip with images in `attachments/` (Settings → Data).
- Voice: dictate a new note, into the open note or into the chat (Ctrl+Shift+Space). Whisper runs
  on the device (model ~80 MB, downloaded on first use); the audio never leaves it.
- Ask AI about a selection (Ctrl+Shift+E) or the whole note: rewrite, shorten, reformat, fix
  mistakes, tidy up a dump, or your own instruction. The change is shown as a word diff and
  applied only on Accept, as one undo step.
- Telegram bot: send text, voice messages and photos to the bot; they become notes. The bot seals
  each message to your public key, so only your devices can read it; voice is transcribed on
  the device.
- A new device can be let in from a device that is already set up (matching 6-digit codes), no
  phrase typing needed. Images sync end-to-end encrypted too.
- Assistant (Ctrl+J): one chat over your notes with answers that cite their sources. The context
  follows what is open (a note, a folder, everything), and a divider marks each switch. Search
  combines keywords with meaning; the embedding model (multilingual-e5-small, ~120 MB) downloads
  on the first visit to the assistant and runs on the device. Only the passages found for a
  question are sent to the LLM (DeepSeek through our proxy). Before searching, the assistant asks
  the LLM for translations and synonyms of the question, so "розыгрыши" finds a note about a
  "giveaway". The avatar is
  [Bloub](https://github.com/jeremy-prt/bloub) (MIT).
- Tidy up: the assistant suggests titles, folders, tags and merging duplicates, a batch every few
  days and one note right after you write it. Nothing changes until you accept a suggestion, and
  every accepted change can be undone.
- AI history (Settings → AI): every change the assistant made to a note, with before and after,
  and undo as long as the note has not changed since.
- Choice of model (Settings → AI): FixNote AI (DeepSeek through our proxy, needs an account), your
  own key for OpenAI, OpenRouter, Groq, DeepSeek or any OpenAI-compatible API, or Ollama on this
  computer. The key stays in the OS keychain (desktop) or encrypted in the browser. Local-only
  mode turns off sync, Telegram and sharing and allows only Ollama.
- MCP (desktop): Claude Desktop, Cursor and other MCP clients can search and read your notes, and
  with permission create notes or append to them (Settings → AI → MCP; off / read / read and
  write). The server `fixnote-mcp` ships with the app and works on the local database.
- Import (Settings → Data): a folder of Markdown files (Obsidian too), a Bear backup
  (`.bear2bk`), a Notion export (`.zip`) or a FixNote export, with folders, tags, dates and images.
  Notes that are already there are skipped; Undo removes the whole import.
- Share a note by link (signed in): the copy is sealed with a key that exists only in the link, so
  the server cannot read it. Update the link after edits or turn it off, from the note or from
  Settings → Account. The link opens a read-only page that needs no account.
- Feels native: custom title bar with Windows caption buttons, right-click menus for notes,
  folders and the editor, no browser menus or shortcuts on desktop.

| Shortcut (Ctrl on Windows, ⌘ on macOS) | Action |
|---|---|
| Ctrl+K or Ctrl+F | Spotlight (Ctrl+F on desktop) |
| Ctrl+D | Today's note |
| Ctrl+N | New note (desktop only; browsers reserve it) |
| Ctrl+[ / Ctrl+], Alt+← / Alt+→, mouse back/forward | Back / forward |
| Ctrl+J | Assistant panel |
| Ctrl+Shift+E | Ask AI about the selection (or the whole note) |
| Ctrl+Shift+Space | Start / stop dictation (Esc cancels) |
| Ctrl+\\ | Sidebar |

Shortcuts follow the physical key, so they work in any keyboard layout.

Local data lives in `%APPDATA%\space.fixnote.app\fixnote.db` on Windows and in the browser's
origin-private file system on the web.

## Repository layout

```
apps/
  web/             React + Vite app; runs in the browser and inside the desktop shell
  desktop/         Tauri 2 shell; src-tauri/ holds the Rust side
  mcp/             fixnote-mcp: stdio MCP server over the local database (Node single executable)
packages/
  core/            domain logic and platform interfaces (no React)
  platform-web/    browser adapters (sqlite-wasm, WebCrypto, OPFS files, transformers.js
                   embeddings and Whisper, shared with desktop)
  platform-tauri/  desktop adapters (rusqlite commands, keychain, app-data files, page fetch)
  ui/              design tokens and shadcn-style components (Tailwind 4)
  i18n/            en / es / ru dictionaries
supabase/          CLI config, auth email templates, migrations, edge functions
```

## Getting started

Requirements: Node 22+, pnpm 10 (`corepack enable`), Rust stable for the desktop app.

```bash
pnpm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
pnpm dev                    # web app on http://localhost:5173
pnpm dev:desktop            # desktop app (Tauri) with hot reload
```

The app also runs without `.env`; cloud features stay off until it is set.

### Windows (primary desktop target)

1. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   with the "Desktop development with C++" workload.
2. Install Rust via [rustup](https://rustup.rs) (MSVC toolchain, the default).
3. WebView2 ships with Windows 10/11; the installer bootstraps it if missing.

`pnpm build:desktop` produces NSIS (`.exe`) and MSI installers in
`apps/desktop/src-tauri/target/release/bundle/`. Builds are unsigned for now, so SmartScreen warns
on first launch.

### macOS

CI builds a `.dmg` for Apple Silicon (`fixnote-macos-latest`) and one for Intel Macs
(`fixnote-macos-15-intel`), see [CI](#ci). It is ad-hoc signed but not notarized, so
after dragging FixNote to Applications, clear the download flag once, or macOS reports the app
as damaged:

```bash
xattr -cr /Applications/FixNote.app
```

To build on a Mac yourself: Xcode Command Line Tools (`xcode-select --install`), Rust, then
`pnpm --filter @fixnote/mcp build:sea && pnpm build:desktop`.

### Linux

Follow the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). On Debian/Ubuntu:

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Assistant (DeepSeek)

The DeepSeek key lives only in the Supabase project, never in the app. Once:

```powershell
pnpm sb secrets set DEEPSEEK_API_KEY=sk-...
pnpm sb:functions        # deploys llm-proxy, unfurl (link cards on the web) and telegram-bot
```

Function tests: `deno test -A` inside each folder of `supabase/functions`.

### Telegram bot

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Pick a random webhook secret (letters, digits, `_`, `-`), then:

```powershell
pnpm sb secrets set TELEGRAM_BOT_TOKEN=123:abc TELEGRAM_WEBHOOK_SECRET=<secret>
pnpm sb:functions
$env:TELEGRAM_BOT_TOKEN = "123:abc"; $env:TELEGRAM_WEBHOOK_SECRET = "<secret>"
pnpm tg:webhook          # points the bot at the function, prints its username
```

3. Put `VITE_TELEGRAM_BOT=<username>` into `.env` (and the CI variables). Settings → Account →
   Telegram then shows "Connect Telegram".

### MCP server

The desktop installer includes `fixnote-mcp`; Settings → AI → MCP adds it to Claude Desktop or
Cursor with one click. For a local desktop build, create it first (CI does this for installers):

```bash
pnpm --filter @fixnote/mcp build:sea   # apps/desktop/src-tauri/binaries/fixnote-mcp-<target>
```

Without it the desktop app still builds (a placeholder is used) and MCP shows as unavailable.

### Shared links

Links open the web app: `VITE_WEB_URL` (default `https://fixnote.space`) must serve the built web
app (`apps/web/dist`, any static host). On the web the app uses its own address. The server keeps
only the sealed copy (`shares` table); apply the migration with `pnpm sb:migrate`.

### Trying sync without Supabase

`pnpm dev`, then open http://localhost:5173/?dev-backend. A development-only fake server lives in
the browser's localStorage; the sign-in code is `123456`, and a fake LLM answers from the first found
passage (and makes simple AI edits). Speech recognition and link cards are faked too, and
`__devTelegram.start()` / `__devTelegram.send({ kind: 'text', text: '…' })` in the console play
the Telegram bot. Shared links work there too, in the same browser. It is never part of production
builds.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Web app dev server |
| `pnpm dev:desktop` | Desktop app with hot reload |
| `pnpm build` | Build all packages and the web app |
| `pnpm build:desktop` | Desktop installers for the current OS |
| `pnpm lint` / `pnpm format` | Biome check / autofix |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm test` | Vitest across the workspace |
| `pnpm check` | lint + typecheck + test |
| `pnpm tg:webhook` | Point the Telegram bot at its edge function |

## Supabase

Project ref: `nsteehqbmljuczxgkvae`. Sign-in is passwordless: email plus a 6-digit code.
`.env.example` already holds the public URL and anon key; `cp .env.example .env` is enough.

The Supabase CLI is a dev dependency of the repo, so it works on Windows without a global install.
Auth settings and the trilingual code email live in `supabase/config.toml` and
`supabase/templates/otp.html`. Apply them to the hosted project:

```bash
pnpm sb:login     # opens the browser, stores an access token
pnpm sb:link      # links this folder to project nsteehqbmljuczxgkvae
pnpm sb:diff      # review what would change in the hosted project
pnpm sb:push      # apply; confirms each changed resource
```

Sign-in code emails are sent through Resend from `no-reply@fixnote.space` (the domain must be
verified in Resend). Set the Resend API key in the shell before pushing; it is never committed:

```powershell
$env:SUPABASE_AUTH_SMTP_PASS = "re_..."
pnpm sb:push
```

Apply the database schema (tables, row-level security, sync functions) once, and after every new
file in `supabase/migrations/`. The CLI asks for the database password from the Supabase dashboard:

```powershell
pnpm sb:migrate
```

Any other CLI command runs as `pnpm sb <command>`, e.g. `pnpm sb migration new init`.

`.mcp.json` registers the Supabase MCP server for Claude Code; authenticate once with `claude /mcp`.

CI builds with the repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_TELEGRAM_BOT` and `VITE_WEB_URL`
(Settings → Secrets and variables → Actions → Variables) and falls back to `.env.example`.

## CI

- `CI` runs lint, typecheck, tests, the web build, and Rust clippy on every push and PR.
- `Desktop build` builds Windows installers and macOS `.dmg`s (Apple Silicon and Intel) on `main`, on `v*`
  tags, on demand, and on any branch when the pushed commit message contains `[build desktop]`,
  and uploads them as workflow artifacts.
