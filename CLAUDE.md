# FixNote — working notes for Claude

Read docs/CONCEPT.md before larger changes; section 10 lists decisions already made.

## Conventions

- pnpm workspaces + Turborepo. Internal packages are source-only (`exports` point at `src/*.ts`).
- TypeScript strict, no `any`. Biome formats and lints: run `pnpm format` before committing.
- Domain logic goes in `packages/core` and must not import React or platform APIs. Anything that
  differs between desktop and web goes behind an interface in `packages/core/src/platform.ts`
  with one adapter in `platform-web` and one in `platform-tauri`.
- Rust in `apps/desktop/src-tauri` only for what the browser can't do well (SQLite, keychain,
  files, fetching pages without CORS, WebView2 settings). No domain logic in Rust.
- Every UI string goes through `@fixnote/i18n`. Add the key to `en.ts`, then `es.ts` and `ru.ts`;
  the locale test fails on missing keys or placeholders.
- UI components: shadcn style in `packages/ui`, Tailwind 4 tokens in `packages/ui/src/styles.css`.
  Use semantic color tokens (`bg-card`, `text-muted-foreground`), not raw palette colors.
- Hotkeys: Mod = Ctrl on Windows/Linux, ⌘ on macOS. Windows is the primary desktop target. Match
  letters by physical key (`e.code`, see `hotkeys.ts`), never only by `e.key`: users type in RU/ES layouts.
- Local DB: schema and all SQL live in `packages/core` (`db/schema.ts`, `notes/repo.ts`). Append
  migrations, never edit a shipped one. Inside `db.transaction(fn)` use only the `tx` argument;
  calling the driver itself there deadlocks.
- TanStack Query: per-call `mutate(…, { onSuccess })` callbacks do not run if the component has
  unmounted; anything that must happen later (undo in a toast) goes through the repo directly.
- Sync: every local write must go through `NotesRepo` so rows get `dirty = 1, local_rev + 1`.
  Editor saves pass the text the edit started from (`updateContent(id, text, { base })`) so a change
  that sync applied meanwhile is merged, not overwritten. Server schema changes = new file in
  `supabase/migrations/`; test RLS and RPCs on a local Postgres before pushing.
- Try sync UI without Supabase: `pnpm dev` + `?dev-backend` (code 123456).
- Assistant: retrieval in `packages/core/src/ai`, LLM client/prompt/citations in `packages/ai`,
  app wiring in `apps/web/src/lib/assistant`. Query expansion (`expandQuery`) only adds FTS keywords;
  embeddings always use the question as typed. Model output is rendered as React elements only
  (`AnswerText`), never as HTML. The LLM key stays in the `llm-proxy` edge function.
- `packages/ui/src/bloub/engine` is vendored (MIT) and excluded from Biome; do not edit or round
  its numbers, update by copying from upstream (see its README).
- AI never changes a note without an explicit accept; changes are shown as diffs (`AiEdit.tsx`,
  prompts in `packages/ai/src/edit.ts`). The dev backend's fake LLM recognizes edit and expansion
  requests by the markers exported from `@fixnote/ai`; keep them in the prompts.
- Attachments: Markdown `![](attachment:<id>)`, bytes in the platform `BlobStore`, one encrypted
  blob per file in Storage (`packages/core/src/attachments`). Images are block nodes; the custom
  paragraph in `editor/paragraph.ts` keeps images that share a line with text.
- Capture (Telegram): the bot only seals and queues (`supabase/functions/telegram-bot`); notes are
  made on the device (`packages/core/src/capture`). The payload format lives in both places.
- Speech and embeddings run in the webview on both platforms (transformers.js workers in
  `platform-web`); the Rust side only fetches pages, streams HTTP for the user's own LLM key,
  stores files, holds keys and edits MCP client configs.
- Every AI change to a note goes through `AuditLog` (`packages/core/src/ai/audit.ts`), so it shows
  in Settings → AI and can be undone. LLM calls go through `llm()` in
  `apps/web/src/lib/assistant/llm.ts` (FixNote AI, the user's key, or Ollama). In local-only mode
  nothing may reach our server: no sync, Telegram, sharing or FixNote AI.
- MCP server: `apps/mcp`; it writes only through `NotesRepo` and checks the `mcp.access` kv first.
  Build the desktop sidecar with `pnpm --filter @fixnote/mcp build:sea` (build.rs uses a
  placeholder otherwise).
- Import (`packages/core/src/import`) plans first and writes only in `runImport`; keep it
  idempotent (notes with the same text are skipped).
- Shared links: the key lives only in the URL fragment; never send it or the plaintext to the
  server. The share page (`SharePage`, `/?s=<id>#<key>`) must not open the local DB or the account.
- Edge function tests: `deno test -A` in each function folder (deno is not a repo dependency).
- Landing and blog: `apps/landing` (Astro, static, fixnote.space; the app is app.fixnote.space). Its copy
  lives in `apps/landing/src/i18n` (ru is the reference, en/es must match its shape), not in
  `@fixnote/i18n`. Keep pages script-free apart from the small inline scripts in `Base.astro` and
  `Hero.astro`; only claim what the app does. No GitHub links on the site: downloads go through
  `/download/*` in `public/_redirects`. Blog posts: `src/content/blog/<lang>/<slug>.md`, one
  `translationKey` per article across languages.

## Verify before pushing

```bash
pnpm check                      # lint + typecheck + test
pnpm --filter @fixnote/web build
pnpm --filter @fixnote/landing build
(cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings)
```
