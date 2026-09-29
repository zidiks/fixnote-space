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
- A button that waits for something (the server, a long task) gets `loading` (spinner, same size,
  no second click); with several actions in one place, only the clicked one spins. Waiting that is
  not a button shows `Spinner` next to its text. Nothing may look frozen.
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
- A note's time (`updatedAt` in the app, `edited_at` in SQL) moves only when its text changes;
  `updated_at` moves with any change and settles moves and deletes in sync. Triggers keep `edited_at`.
- Sync conflicts: an edit in the same lines on two devices keeps the server version and makes a copy;
  the copy is recorded in the local `sync_conflicts` table and settled with `repo.settleConflict`
  (banner and compare dialog: `ConflictBanner`). Two daily notes for one date are merged
  (`mergeDailyNotes`, deterministic so devices converge), the one with the larger id is deleted.
- Try sync UI without Supabase: `pnpm dev` + `?dev-backend` (code 123456).
- Assistant: retrieval in `packages/core/src/ai`, LLM client/prompt/citations in `packages/ai`,
  app wiring in `apps/web/src/lib/assistant`. Query expansion (`expandQuery`) only adds FTS keywords;
  embeddings always use the question as typed. Model output is rendered as React elements only
  (`AnswerText`), never as HTML. The LLM key stays in the `llm-proxy` edge function.
- The assistant is an agent: it calls the note tools of `packages/core/src/agent` (`NoteTools`,
  `NOTE_TOOL_SPECS`; the MCP server uses the same ones, so a tool added there reaches both) in a
  loop (`apps/web/src/lib/assistant/agent.ts`). It remembers the thread until "new chat"; older
  turns become a summary (`chat.summary` kv) near the context limit. Deleting, and more than a few
  changes in one answer, always ask; in "ask" mode every change asks. Each answer lists its changes
  (`chat_messages.actions`) with Undo all. llm-proxy takes tools; a step that only returns tool
  results is not a new request, and cached prompt tokens count a tenth.
  A change to a note open on screen goes through `registerOpenNote` (`lib/assistant/open-notes.ts`):
  solo it is one editor step that types in (`editor/ai-typing.ts`); in a shared note it is written
  into the live Yjs document, and the awareness field `ai` shows "FixNote AI · asked by …" in LiveBar.
- `packages/ui/src/bloub/engine` is vendored (MIT) and excluded from Biome; do not edit or round
  its numbers, update by copying from upstream (see its README).
- AI never changes a note without an explicit accept unless the user picked "Accept edits" or "Auto"
  in Settings → AI (`useLlm().mode`); then the change applies with an Undo toast and still goes to
  `AuditLog`. Changes are shown as diffs (`AiEdit.tsx`, prompts in `packages/ai/src/edit.ts`). The dev backend's fake LLM recognizes edit, expansion,
  agent and summary requests by the markers exported from `@fixnote/ai`; keep them in the prompts.
- Attachments: Markdown `![](attachment:<id>)` (images) or `[name](attachment:<id> "1.2 MB")` (other
  files; the title is the size, so id regexes must allow a title),
  bytes in the platform `BlobStore`, one encrypted blob per file in Storage
  (`packages/core/src/attachments`). Images are block nodes; the custom paragraph in
  `editor/paragraph.ts` keeps images that share a line with text. Drops onto the window go through
  `DropLayer` (`lib/drop.ts`): into the open note, else a new note.
- Capture (Telegram): the bot only seals and queues (`supabase/functions/telegram-bot`); notes are
  made on the device (`packages/core/src/capture`). The payload format lives in both places.
- Speech and embeddings run in the webview on both platforms (transformers.js workers in
  `platform-web`); the Rust side only fetches pages, streams HTTP for the user's own LLM key,
  stores files, holds keys and edits MCP client configs. Every on-device model is listed in
  `packages/core/src/models.ts` (Settings → Advanced shows size, download, remove); the speech model
  the person picked is kept by the Whisper client (`setModel`).
- Spoken conversation with the assistant (the button left of the mic in the chat,
  `lib/voice/conversation.ts`): an open mic with a loudness VAD (`vad.ts`, `live-mic.ts`), Whisper on
  the device, `ask()` as a voice message, and the answer read aloud by the system's speech synthesis
  (`speech.ts`) sentence by sentence as it streams, in the language the person spoke; a filler phrase
  when the answer is slow, yes/no aloud for changes that ask. The mic pauses while the app speaks.
- Text in images (OCR, on the device, Free): Tesseract via tesseract.js (`platform-web/src/ocr`; its
  language data is fetched into Cache Storage and handed over through tesseract.js's own idb cache,
  never downloaded by it). Read in the background (`lib/ocr.ts`) into `image_text` (+ FTS), which
  note search, the assistant's retrieval and `get_note` include; right-click an image → "Text from
  image". Local and derived: not synced, forgotten with the notes.
- Every AI change to a note goes through `AuditLog` (`packages/core/src/ai/audit.ts`), so it shows
  in Settings → AI and can be undone. LLM calls go through `llm()` in
  `apps/web/src/lib/assistant/llm.ts` (FixNote AI, the user's key, or Ollama). In local-only mode
  nothing may reach our server: no sync, Telegram, sharing or FixNote AI.
- MCP server: `apps/mcp`; its tools are `NoteTools` from core (writes only through `NotesRepo`, every
  change in `AuditLog`, folders too) behind a gate that reads the user's settings. Images and files: it reads and writes the desktop app's `blobs/` folder
  (`apps/mcp/src/blobs.ts` names files exactly like `blobs.rs`); an attachment is visible only
  through a note the client may see. Each call checks the `mcp.access` level and the `mcp.scope` kv (see
  `packages/core/src/mcp.ts`); outside the scope a note or folder must look like it does not exist.
  Build the desktop sidecar with `pnpm --filter @fixnote/mcp build:sea` (build.rs uses a
  placeholder otherwise).
- Microsoft Store build: the same exe packed as MSIX by CI (`apps/desktop/msix`). When packaged
  (`store::packaged()` in Rust, `store` in `app_info`) the app never updates itself and MCP clients
  get the `fixnote-mcp` alias path instead of the exe next to the app. Folders the app shares with
  other programs must be listed in the manifest's `ExcludedDirectories`, or Windows virtualizes them.
- Apple Notes import (macOS desktop): `apple_notes.rs` asks the Notes app over JXA (`osascript`,
  `NSAppleEventsUsageDescription`; "denied" when Automation is off) for folders and batches of
  notes as HTML; `lib/apple-notes.ts` turns them into Markdown with the note schema, then core
  `planConverted` + `runImport`. Try it with `?dev-backend` (`apple-notes-dev.ts`, `&apple-denied`).
- Repeating tasks live in the task line (`- [ ] Call mom 🔁 weekly:mon`, rules in
  `packages/core/src/notes/recurrence.ts`); a new daily note gets the tasks due that day
  (`getOrCreateDaily`), and a changed rule reaches existing later days via `applyRecurrence`.
- Shared notes (people by email, roles edit/view): server tables and RPCs in
  `supabase/migrations/*_shared_notes.sql`, logic in `packages/core/src/shared-notes` (`SharedNotes`:
  share, invite, save with version + CRDT merge, sync), live editing in `packages/core/src/collab`
  (`CollabSession`) over private Realtime channels `shared:<id>` (`backend.collab`; BroadcastChannel
  with `?dev-backend`). A shared note is a normal `notes` row with `shared_id` (Markdown for search,
  cards, AI) plus `shared_docs` (Yjs state; `projected` detects edits made outside the editor). Shared
  notes never go through the personal sync. Markdown ⇄ Yjs via `lib/shared/projector.ts`.
  Invitations must be accepted (`accepted` column, the bell in `Notifications.tsx`) and expire after
  `INVITE_DAYS`; role changes reach an open note through `onSharedSync`. Others' carets: `LiveCarets`
  (overlay) + `RemoteFade`. Shared folders (`*_shared_folders.sql`): a folder key seals the name and
  each note's key; a member's copy is a local folder with `folders.shared_id` (kept out of the
  personal sync, subfolders too); its subfolders and each note's place are a Yjs layout document
  (`shared-notes/layout.ts`, `*_shared_folder_layout.sql`). `MemorySharedServer` in core mirrors
  the SQL rules for tests and `?dev-backend`:
  change both together.
  Files in shared notes: `shared/<shared id>/<file id>` in Storage, sealed with the note key
  (`encryptSharedAttachment`), uploaded by `SharedNotes.pushFiles` on each sync and fetched through
  `attachmentSource()` (own copy first, then `SharedNotes.fileSource()`); they count against the
  note owner's storage (`*_shared_files.sql`) and storage-cleanup leaves them alone.
  View only means nothing may change: `NotesRepo` throws `ReadOnlyError` for such notes and folders
  (every writer goes through it); only the shared sync writes, with `fromSharing`. The UI hides what
  would change them (`note.readOnly`, `folder.shared === 'view'`).
- A device's notes belong to one account (`account.owner` in kv, `ownerEmail` in the account
  store). Signing out keeps them and the binding (offline use goes on); another account can sign in
  only after "Unbind device" (`unbindDevice` → `forgetLocalNotes` in core: notes and everything
  made from them, device settings stay), which warns about changes not synced yet
  (`unsyncedChanges`). Anything new stored per account must be removed there too.
- The recovery phrase shows only after a code sent to the account's email (`RecoveryPhrase` in
  `AccountSection.tsx`, `sendCheckCode`/`checkCode` on the backend; `123456` with `?dev-backend`).
- Plans: Free = on the device, Pro = through our server (sync push, FixNote AI, sharing, links,
  capture, files). The server enforces it (`*_plans.sql`: triggers, storage policy, `ai_allowance`
  in `llm-proxy`); the app only explains (`lib/plan.ts`, `PlanSection`, `ProCard`, `withPro`). On
  Free, sync only downloads (`engine.sync({ push: false })`). `MemorySharedServer.isPro` and
  `lib/account/dev-plan.ts` mirror the rules: change them together with the SQL. Payments: Suby
  (`functions/billing` opens the checkout, `functions/suby-webhook` sets `subscriptions` from the
  subscription Suby reports; `_shared/suby.ts`). The Suby key never leaves the edge functions.
  The beta is only a label (`my_plan().beta`); nothing depends on it (`*_beta_label.sql`).
  The trial is the account's choice, no card (`begin_trial()` in `*_trial_on_request.sql`; the
  `Paywall` offer once after sign-in, the Pro card, Settings → Plan); none for `disposable_domains`,
  1 GB of files. Files of accounts that never paid leave the server
  `free_files_days` after Pro ended (`functions/storage-cleanup`, pg_cron); before that the app
  keeps a local copy (`Attachments.keepLocal`). Never delete anything of an account that paid.
- Shared links: the key lives only in the URL fragment; never send it or the plaintext to the
  server. The share page (`SharePage`, `/?s=<id>#<key>`) must not open the local DB or the account.
- Edge function tests: `deno test -A` in each function folder (deno is not a repo dependency).
- Landing and blog: `apps/landing` (Astro, static, fixnote.space: English at the root, `/ru/`, `/es/`;
  the app is app.fixnote.space). Its copy
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
