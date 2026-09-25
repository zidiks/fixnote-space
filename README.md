# FixNote

Private personal notes with an assistant that helps you remember. Local-first, end-to-end encrypted,
voice input, chat over your notes, MCP. Desktop (Tauri, Windows first) and web from one codebase.

- Product and architecture concept: [docs/CONCEPT.md](docs/CONCEPT.md)

## What works today (M3)

Offline first, on web and desktop; an account is optional and only adds sync:

- Notes in Markdown with a Bear-like editor: headings, lists, checklists, quotes, code, links.
- Inbox by default; folders with subfolders; `#tags` and nested `#area/project` tags from the text.
- Home with filters (Inbox, folder, type, period) and infinite scroll; lists per folder and tag.
- Spotlight: recent notes, full-text search with highlighted snippets in ru/es/en that also tries
  the other alphabet ("телеграм" finds "Telegram"), notes similar in meaning once the assistant's
  index is ready, commands.
- Daily note, soft delete with undo, blank notes discarded automatically.
- Sync across devices with end-to-end encryption: sign in with an email code, keep a 12-word
  recovery phrase; the server stores only ciphertext. Concurrent edits merge line by line; if two
  devices changed the same line, both versions are kept.
- Export of all notes as a Markdown zip (Settings → Data).
- Assistant (Ctrl+J): one chat over your notes with answers that cite their sources. The context
  follows what is open (a note, a folder, everything), and a divider marks each switch. Search
  combines keywords with meaning; the embedding model (multilingual-e5-small, ~120 MB) downloads
  on the first visit to the assistant and runs on the device. Only the passages found for a
  question are sent to the LLM (DeepSeek through our proxy). Before searching, the assistant asks
  the LLM for translations and synonyms of the question, so "розыгрыши" finds a note about a
  "giveaway". The avatar is
  [Bloub](https://github.com/jeremy-prt/bloub) (MIT).
- Feels native: custom title bar with Windows caption buttons, right-click menus for notes,
  folders and the editor, no browser menus or shortcuts on desktop.

| Shortcut (Ctrl on Windows, ⌘ on macOS) | Action |
|---|---|
| Ctrl+K or Ctrl+F | Spotlight (Ctrl+F on desktop) |
| Ctrl+D | Today's note |
| Ctrl+N | New note (desktop only; browsers reserve it) |
| Ctrl+[ / Ctrl+], Alt+← / Alt+→, mouse back/forward | Back / forward |
| Ctrl+J | Assistant panel |
| Ctrl+\\ | Sidebar |

Shortcuts follow the physical key, so they work in any keyboard layout.

Local data lives in `%APPDATA%\space.fixnote.app\fixnote.db` on Windows and in the browser's
origin-private file system on the web.

## Repository layout

```
apps/
  web/             React + Vite app; runs in the browser and inside the desktop shell
  desktop/         Tauri 2 shell; src-tauri/ holds the Rust side
packages/
  core/            domain logic and platform interfaces (no React)
  platform-web/    browser adapters (sqlite-wasm, WebCrypto, transformers.js)
  platform-tauri/  desktop adapters (rusqlite commands, keychain, fastembed, whisper.cpp)
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

### macOS / Linux

Follow the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). On Debian/Ubuntu:

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Assistant (DeepSeek)

The DeepSeek key lives only in the Supabase project, never in the app. Once:

```powershell
pnpm sb secrets set DEEPSEEK_API_KEY=sk-...
pnpm sb:functions        # deploys supabase/functions/llm-proxy
```

Function tests: `deno test --allow-net --allow-env supabase/functions`.

### Trying sync without Supabase

`pnpm dev`, then open http://localhost:5173/?dev-backend. A development-only fake server lives in
the browser's localStorage; the sign-in code is `123456`, and a fake LLM answers from the first found passage. It is never part
of production builds.

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

CI builds with the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
(Settings → Secrets and variables → Actions → Variables) and falls back to `.env.example`.

## CI

- `CI` runs lint, typecheck, tests, the web build, and Rust clippy on every push and PR.
- `Desktop build` builds Windows installers on `main`, on `v*` tags, and on demand, and uploads
  them as workflow artifacts.
