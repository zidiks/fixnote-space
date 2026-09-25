# FixNote

Private personal notes with an assistant that helps you remember. Local-first, end-to-end encrypted,
voice input, chat over your notes, MCP. Desktop (Tauri, Windows first) and web from one codebase.

- Product and architecture concept: [docs/CONCEPT.md](docs/CONCEPT.md)

## Repository layout

```
apps/
  web/             React + Vite app; runs in the browser and inside the desktop shell
  desktop/         Tauri 2 shell; src-tauri/ holds the Rust side
packages/
  core/            domain logic and platform interfaces (no React)
  platform-web/    browser adapters (sqlite-wasm, WebCrypto, transformers.js)
  platform-tauri/  desktop adapters (plugin-sql, keychain, fastembed, whisper.cpp)
  ui/              design tokens and shadcn-style components (Tailwind 4)
  i18n/            en / es / ru dictionaries
supabase/          CLI config, auth email templates, migrations, edge functions
```

## Getting started

Requirements: Node 22+, pnpm 10 (`corepack enable`), Rust stable for the desktop app.

```bash
pnpm install
cp .env.example .env        # fill in VITE_SUPABASE_ANON_KEY
pnpm dev                    # web app on http://localhost:5173
pnpm dev:desktop            # desktop app (Tauri) with hot reload
```

The app runs without Supabase configured; cloud features stay off until the env is set.

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

- `.mcp.json` registers the Supabase MCP server for Claude Code; authenticate once with `claude /mcp`.
- Auth settings and the trilingual code email live in `supabase/config.toml` and
  `supabase/templates/otp.html`. Apply them to the hosted project with the
  [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
supabase login
supabase link --project-ref nsteehqbmljuczxgkvae
supabase config push
```

In CI, set the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
(Settings → Secrets and variables → Actions → Variables).

## CI

- `CI` runs lint, typecheck, tests, the web build, and Rust clippy on every push and PR.
- `Desktop build` builds Windows installers on `main`, on `v*` tags, and on demand, and uploads
  them as workflow artifacts.
