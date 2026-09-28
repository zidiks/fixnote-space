# FixNote

Private personal notes with an assistant that helps you remember. Local-first, end-to-end encrypted,
voice input, chat over your notes, MCP. Desktop (Tauri, Windows first) and web from one codebase.

- Product and architecture concept: [docs/CONCEPT.md](docs/CONCEPT.md)

## What works today (M5)

Offline first, on web and desktop; an account is optional and only adds sync:

- Notes in Markdown with a Bear-like editor: headings, lists, checklists, quotes, code, links,
  images (paste or drop; large ones are scaled down).
- Home shows every note with filters (no folder, folder, type, period) and infinite scroll;
  folders with subfolders.
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
- Tidy up: the assistant suggests titles, folders and merging duplicates, a batch every few
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
  (`.bear2bk`), a Notion export (`.zip`) or a FixNote export, with folders, dates and images (front matter tags stay as `#words` at the end).
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
  landing/         fixnote.space: static Astro site (ru at the root, /en/, /es/) with the blog
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

Hardened runtime is off (`tauri.macos.conf.json`): the bundled MCP server runs V8, which crashes
under hardened runtime without the JIT entitlement. Notarizing later needs hardened runtime back on
plus `com.apple.security.cs.allow-jit` for `fixnote-mcp`.

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

Tools: `search_notes`, `get_note`, `list_recent`, `list_folders`, `daily_note`, `create_note`,
`append_to_note`, `update_note`, `move_note`, `delete_note`, `create_folder`, `rename_folder`,
`delete_folder`, `get_attachment` (an image to look at, a text file as text, other files as an
embedded file) and `attach_file` (a file on this computer or base64 data, up to 20 MB; it lands in
the app's `blobs/` folder and the app uploads it on the next sync). Settings → AI → Connected apps sets the access level (off, read, read and write,
full with deletion) and what apps can see: every note, or chosen folders (with their subfolders) and
single notes. Every change is in the AI activity log and can be undone, deletions included.

### Web app hosting (Cloudflare)

The web app is static files (`apps/web/dist`). `wrangler.jsonc` deploys them as a Cloudflare
Worker with static assets: connect the repository in Cloudflare (Workers & Pages → Create →
import from Git) with

- build command `pnpm install --frozen-lockfile && pnpm --filter @fixnote/web build`
- deploy command `npx wrangler deploy`

Without a `.env`, the build takes the public values of `.env.example`; build variables set in
Cloudflare (e.g. `VITE_TELEGRAM_BOT`) win. Cloudflare serves files up to 25 MiB, so the hosted app
loads the ONNX runtime (26 MB) from jsDelivr; the desktop app and `pnpm dev` bundle it. Add the
domain (`app.fixnote.space`) under the Worker's Settings → Domains & Routes.

### Landing and blog (fixnote.space)

`apps/landing` is a static [Astro](https://astro.build) site: prebuilt HTML, one inlined stylesheet
and a few lines of inline JavaScript, so pages are fast and search engines read them as is.
Russian lives at the root, English under `/en/`, Spanish under `/es/`; copy is in
`apps/landing/src/i18n` (the Russian file sets the shape, the others must match it). Blog posts are
Markdown in `src/content/blog/<lang>/<slug>.md`; translations of one post share `translationKey`.
The build also writes the sitemap and an RSS feed per language.

`pnpm --filter @fixnote/landing dev` serves it on http://localhost:4321. To deploy, create a second
Cloudflare Worker from the same repository with root directory `apps/landing`, build command
`pnpm install --frozen-lockfile && pnpm --filter @fixnote/landing build` and deploy command
`npx wrangler deploy`, then add `fixnote.space` to it. Download buttons link to
`/download/windows`, `/download/mac-arm` and `/download/mac-intel`, which `public/_redirects` sends
to the latest GitHub release's installers.

### Shared links

Links open the web app: `VITE_WEB_URL` (default `https://app.fixnote.space`) must serve it (see above).
On the web the app uses its own address. The server keeps only the sealed copy (`shares` table);
apply the migration with `pnpm sb:migrate`.

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
| `pnpm --filter @fixnote/landing dev` | Landing and blog dev server |
| `pnpm dev:desktop` | Desktop app with hot reload |
| `pnpm build` | Build all packages and the web app |
| `pnpm build:desktop` | Desktop installers for the current OS |
| `pnpm lint` / `pnpm format` | Biome check / autofix |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm test` | Vitest across the workspace |
| `pnpm check` | lint + typecheck + test |
| `pnpm tg:webhook` | Point the Telegram bot at its edge function |

## Plans (Free and Pro)

Free is everything on the device; Pro is what goes through the server: personal sync, FixNote AI,
sharing notes and folders (people invited join on Free), public links, capture from messengers and
20 GB of files. The first subscription starts with a 7-day free trial that needs a card (Suby
takes it at checkout and charges when the trial ends), one per account. The server decides (triggers and the storage
policy in `supabase/migrations/*_plans.sql`); the app only explains (Settings → Plan, the sidebar
card, "This is part of Pro").

- Beta: until `plan_config.beta_until` (2027-01-01 at first) everyone has Pro. To end it:
  `update plan_config set beta_until = now();` in the SQL editor. Limits live in the same row
  (`ai_month_tokens`, `ai_trial_tokens`, `ai_day_requests`, `ai_global_month_tokens`,
  `storage_bytes`).
- `llm-proxy` charges each answer in tokens (`ai_usage`); past a limit it answers with a code and
  the renewal date, which the app shows next to the offer to use your own key or a local model.
- Payments go through [Suby](https://docs.suby.fi/v3-beta): Settings → Plan opens a Suby checkout
  for the account's email (`supabase/functions/billing`), and Suby's signed webhooks set
  `subscriptions` (`supabase/functions/suby-webhook`: reads the subscription back from Suby, Pro
  until the paid period ends, taken away on a refund or chargeback). "Manage subscription" opens
  Suby's customer portal (customer.suby.fi) for cancelling and changing the card. Set up once:
  1. Suby dashboard → Products → Create: Recurring payments, "FixNote Pro, monthly" ($7 USD,
     Monthly) and "FixNote Pro, yearly" ($60 USD, Yearly). Leave Access & delivery, the discount,
     custom fields and the After payment URLs empty: the app sets where the buyer returns. Note
     their ids (`pro_…`). The 7-day trial is a product setting that neither the create dialog nor
     the API has: turn it on in the product's settings, or ask Suby support to. Then two more
     products the same but without a trial, for accounts that already had a subscription
     (`SUBY_PRODUCT_MONTH_NO_TRIAL`, `SUBY_PRODUCT_YEAR_NO_TRIAL`; without them a returning
     account gets the trial again). Until the trial is on, set `plan_config.trial_days = 0` so the
     app does not promise one.
  2. Dashboard → Settings: an API key (start with `sk_sandbox_…` to test, `sk_live_…` for real),
     and a webhook endpoint `https://<project-ref>.supabase.co/functions/v1/suby-webhook` for the
     `payment.*`, `subscription.*` and `dispute.*` events; keep its `whsec_…` secret.
  3. `pnpm sb secrets set SUBY_API_KEY=... SUBY_WEBHOOK_SECRET=... SUBY_PRODUCT_MONTH=pro_... SUBY_PRODUCT_YEAR=pro_... SUBY_PRODUCT_MONTH_NO_TRIAL=pro_... SUBY_PRODUCT_YEAR_NO_TRIAL=pro_...`
     (optional `BILLING_RETURN_URL`, default `https://app.fixnote.space/`), then `pnpm sb:migrate`
     and `pnpm sb:functions`.
  Test in sandbox with the card 4242 4242 4242 4242; the account should turn Pro within seconds
  (status "trialing" with a trial, "active" without).
- Try every state without Supabase: `?dev-backend`, then Settings → Plan has a switch
  (beta, trial, pro, free, "use up AI", "trial again"); the fake checkout starts the trial the
  first time and Pro after that.

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

- `CI` runs lint, typecheck, tests, the web and landing builds, and Rust clippy on every push and PR.
- `Desktop build` builds Windows installers and macOS `.dmg`s (Apple Silicon and Intel) on `main`, on `v*`
  tags, on demand, and on any branch when the pushed commit message contains `[build desktop]`,
  and uploads them as workflow artifacts.
- A release publishes a GitHub release with stable file names
  (`FixNote-Windows-x64-setup.exe`, `FixNote-Windows-x64-<lang>.msi`, `FixNote-macOS-arm64.dmg`,
  `FixNote-macOS-x64.dmg`); the site's download buttons point at the latest release. To release:
  GitHub → Actions → Desktop build → Run workflow on `main`, `release` = `patch` (or `minor`,
  `major`). The workflow takes the next version after the latest `v*` tag, stamps it into the app
  and the MCP server, builds, then creates the tag and the release. Pushing a `v*` tag by hand
  works too. The version in `tauri.conf.json` only matters for local builds.
- Installed desktop apps update themselves from those releases (Tauri updater: a check shortly after
  start and every 6 hours, or Settings → General → Check for updates). Updates are signed; set the
  key up once:
  1. `pnpm --filter @fixnote/desktop tauri signer generate -w ~/.tauri/fixnote.key` (choose a
     password; keep the key file safe: without it, installed apps can no longer be updated).
  2. In GitHub → Settings → Secrets and variables → Actions add the secrets
     `TAURI_SIGNING_PRIVATE_KEY` (the contents of `~/.tauri/fixnote.key`) and
     `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and the variable `TAURI_UPDATER_PUBKEY` (the contents of
     `~/.tauri/fixnote.key.pub`).

  Release builds then carry the public key and the release gets `latest.json` plus signed update
  files; apps read it at `https://fixnote.space/download/latest.json`. Builds without the key
  (local ones too) work normally but do not update themselves.
- Windows installers are code signed with Azure Artifact Signing (no "unknown publisher" or
  SmartScreen warning once the signature has built reputation). Set it up once in the Azure portal:
  1. A subscription, then register the resource provider `Microsoft.CodeSigning`.
  2. Create an Artifact Signing account (note its region endpoint, e.g.
     `https://weu.codesigning.azure.net`), give yourself the role *Artifact Signing Identity
     Verifier* on it, run the identity validation (Public), then create a certificate profile
     (Public Trust) from it.
  3. Microsoft Entra ID → App registrations → a new app for CI with a client secret; on the signing
     account give it the role *Artifact Signing Certificate Profile Signer*.
  4. In GitHub add the secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` and the
     variables `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`.

  The Windows build then signs the app, the MCP server and both installers (Tauri's `signCommand`
  with `artifact-signing-cli`) and fails if any of them is not validly signed. Without the settings
  it builds unsigned, as before.
- Microsoft Store: the Windows job also packs the app into an MSIX (`apps/desktop/msix`:
  `AppxManifest.xml`, `build.ps1`, images from `pnpm --filter @fixnote/desktop icons`), installs it
  on the runner and checks that the MCP server answers through its `fixnote-mcp` alias. The
  `fixnote-microsoft-store` artifact has `FixNote-Store-x64.msix` (upload this one in Partner
  Center; the Store signs it) and an unsigned test copy. Set up once:
  1. Partner Center → Apps and games → New product → MSIX or PWA app, reserve the name FixNote.
  2. Product management → Product identity: copy `Package/Identity/Name`,
     `Package/Identity/Publisher` and `Package/Properties/PublisherDisplayName` into the GitHub
     variables `MSSTORE_IDENTITY_NAME`, `MSSTORE_PUBLISHER`, `MSSTORE_PUBLISHER_DISPLAY_NAME`
     (without them the package gets a test identity the Store does not accept).
  3. In the submission, the privacy policy is `https://fixnote.space/privacy/`; the restricted
     capabilities need a note for certification: `runFullTrust` (a desktop app: local database,
     OS credential store, its own MCP server) and `unvirtualizedResources` (the app's data folders
     are shared with its MCP server and the installer version, and connecting Claude Desktop edits
     `%APPDATA%\Claude\claude_desktop_config.json`).

  The Store version never updates itself (Settings shows "updates from the Microsoft Store"): each
  release, run the release, then upload the new `.msix` in a new submission. To try the test copy
  on Windows 11: `Add-AppxPackage FixNote-Store-x64-test.msix -AllowUnsigned` in PowerShell
  (`Remove-AppxPackage` takes it off again).
