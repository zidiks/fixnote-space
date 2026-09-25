# FixNote — working notes for Claude

Read docs/CONCEPT.md before larger changes; section 10 lists decisions already made.

## Conventions

- pnpm workspaces + Turborepo. Internal packages are source-only (`exports` point at `src/*.ts`).
- TypeScript strict, no `any`. Biome formats and lints: run `pnpm format` before committing.
- Domain logic goes in `packages/core` and must not import React or platform APIs. Anything that
  differs between desktop and web goes behind an interface in `packages/core/src/platform.ts`
  with one adapter in `platform-web` and one in `platform-tauri`.
- Rust in `apps/desktop/src-tauri` only for what the browser can't do well (SQLite plugin,
  keychain, embeddings, whisper). No domain logic in Rust.
- Every UI string goes through `@fixnote/i18n`. Add the key to `en.ts`, then `es.ts` and `ru.ts`;
  the locale test fails on missing keys or placeholders.
- UI components: shadcn style in `packages/ui`, Tailwind 4 tokens in `packages/ui/src/styles.css`.
  Use semantic color tokens (`bg-card`, `text-muted-foreground`), not raw palette colors.
- Hotkeys: Mod = Ctrl on Windows/Linux, ⌘ on macOS. Windows is the primary desktop target.
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
  app wiring in `apps/web/src/lib/assistant`. Model output is rendered as React elements only
  (`AnswerText`), never as HTML. The LLM key stays in the `llm-proxy` edge function.
- `packages/ui/src/bloub/engine` is vendored (MIT) and excluded from Biome; do not edit or round
  its numbers, update by copying from upstream (see its README).
- AI never changes a note without an explicit accept; changes are shown as diffs.

## Verify before pushing

```bash
pnpm check                      # lint + typecheck + test
pnpm --filter @fixnote/web build
(cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings)
```
