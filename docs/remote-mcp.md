# Remote MCP (ChatGPT, claude.ai…) — phase 1

Browser AI apps can use a person's notes from any device without breaking end-to-end encryption.
Decision: **device bridge** ("variant 1"). The server never holds keys; the person's own device
decrypts and answers.

```
ChatGPT / Claude ──HTTPS (MCP Streamable HTTP) + OAuth 2.1──▶ mcp.fixnote.space (relay, apps/relay)
                                   │  WebSocket opened by the device (hibernatable)
                                   ▼
            FixNote desktop (tray) or an open web tab, Remote access on
            keys → decrypt → core NoteTools (gate: mcp.access, mcp.scope ∩ account scope) → answer
```

- The relay stores **no note content**. Plaintext (the question's arguments and the answer) passes
  through relay memory only, as with FixNote AI today: "goes through our server, not stored or
  logged". Its Durable Object stores only: connected client ids and names, last use (to within
  5 min), revocations, and the account's remote scope as folder/note **ids**.
- Phase 1 is **read-only**: `search_notes`, `get_note`, `list_recent`, `list_folders`,
  `daily_note` (without `append`), whatever `mcp.access` allows locally.
- Pro only (it goes through our server). Off in "Only on this device" mode.

## Pieces

| Where | What |
|---|---|
| `packages/core/src/remote-mcp/protocol.ts` | Relay ⇄ device messages, the remote tool list, close codes, MCP versions. Imported by the relay as `@fixnote/core/remote-mcp`; depends only on `agent/tool-specs.ts`. |
| `packages/core/src/remote-mcp/executor.ts` | `RemoteExecutor`: runs a call on the device with core `NoteTools` and `remoteGate` (Remote access on, `mcp.access` not off, read only, scope = device `mcp.scope` ∩ account scope). Logs each call (client, tool, time, ok; no arguments, no answers) in kv `mcp.remote.log`. |
| `packages/core/src/remote-mcp/bridge.ts` | `RemoteBridge`: the device's WebSocket, reconnect with backoff (1 s → 60 s, jitter; 10 min when not Pro), 30 s keep-alive pings. |
| `apps/relay` | Cloudflare Worker `fixnote-mcp-relay` + Durable Object `UserRelay` (one per account, SQLite-backed). `src/index.ts` routes, `auth.ts` token checks, `mcp.ts` JSON-RPC, `hub.ts` device routing. |
| `apps/web/src/lib/remote-mcp/` | `api.ts` (grants from Supabase, overview from the relay), `bridge.ts` (runs the bridge when signed in + unlocked + Remote access on + not Free + not local-only; activity store), `dev.ts` (in-page relay for `?dev-backend`; `fixnoteRemote.call(tool, args)` in the console). |
| `apps/web/src/components/settings/RemoteMcpCard.tsx` | Settings → Integrations → Remote access. |
| `apps/web/src/components/RemoteActivityPill.tsx` | The quiet "Claude · searching notes" pill while a call runs here (also in the tray menu). |
| `apps/web/src/components/connect/` | `ConnectPage` (`/oauth/consent`, Supabase Auth's consent step, a page of its own), `ConnectDialog` (the app answers `fixnote://connect`), shared `ConnectParts`. |
| `apps/web/src/lib/remote-mcp/connect*.ts`, `consent.ts` | The page's steps (`connectReducer`, `waitForAnswer`), its backend (tab-only session, relay polling, dev fakes), the dialog's logic (`loadConnect`, `answerConnect`), Supabase's consent API. |
| `packages/core/src/remote-mcp/connect.ts` | `fixnote://connect` links, the handoff format and timings (shared by relay, page and app). |
| `apps/relay/src/consent.ts`, `handoff.ts` | The connect handoff: `ConsentHandoff` Durable Object per authorization id. |
| `supabase/migrations/20261014090000_remote_mcp.sql` | Keeps AI-app tokens out of the API; `remote_mcp_allowed()`. |

## OAuth: Supabase Auth's OAuth 2.1 server

Verified in Supabase docs (Oct 2026; the feature is **beta**):
[OAuth server](https://supabase.com/docs/guides/auth/oauth-server),
[getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication),
[token security](https://supabase.com/docs/guides/auth/oauth-server/token-security),
[`revokeGrant`](https://supabase.com/docs/reference/javascript/oauth-server-revokegrant).
It does authorization code + PKCE (S256), dynamic client registration, refresh tokens with
rotation, discovery at `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`,
a consent UI we host (`site_url` + `authorization_url_path`), and `listGrants` / `revokeGrant` for
the user. So FixNote has **no OAuth server of its own and no token tables**.

Flow:

1. The AI app POSTs `/mcp` without a token → `401` with
   `WWW-Authenticate: Bearer resource_metadata="https://mcp.fixnote.space/.well-known/oauth-protected-resource"`.
2. Protected resource metadata (RFC 9728): `resource` = `https://mcp.fixnote.space/mcp`,
   `authorization_servers` = [`https://<ref>.supabase.co/auth/v1`]. (Older clients that look for
   `/.well-known/oauth-authorization-server` on the MCP origin get Supabase's document proxied.)
3. The app registers itself (DCR), sends the person to Supabase's authorize endpoint with PKCE;
   Supabase redirects to `https://app.fixnote.space/oauth/consent?authorization_id=…`.
4. The connect page answers it, usually through the FixNote app (see **Connecting** below):
   Allow/Deny → `approveAuthorization` / `denyAuthorization` → back to the AI app with a code (or
   `error=access_denied`).
5. The app exchanges the code at Supabase; its access token is a normal Supabase user JWT plus a
   `client_id` claim (`aud` = `authenticated`).

Relay token check (`apps/relay/src/auth.ts`): `iss` = Supabase Auth, `exp`, `role` =
`authenticated`, `aud` `authenticated` (or the resource URL, should a hook set it), and
**`client_id` required on `/mcp`, forbidden on `/device` and `/api`** — an AI app's token can never
pose as a device. Then `GET /auth/v1/user` (signature and that the session still exists, so a
revoked grant stops working) and `rpc/remote_mcp_allowed` (Pro); cached per isolate for 60 s.
Revocation is also immediate: Settings → Revoke calls `revokeGrant` and `DELETE /api/clients/:id`,
and the Durable Object refuses tokens issued before that moment.

Keeping AI-app tokens away from everything else (`*_remote_mcp.sql`): a PostgREST pre-request
hook (`guard_oauth_clients`) refuses any request with `client_id` except
`/rpc/remote_mcp_allowed`; a restrictive policy `"no oauth clients"` on every RLS table,
`storage.objects` and `realtime.messages`; edge functions treat such tokens as signed out
(`_shared/auth.ts`). Checked on PGlite with stubbed `auth`/`storage`/`realtime` schemas; still run
it on the local Supabase stack before pushing.

## Connecting (the consent step)

People are usually signed in only in the desktop app, so the consent step must not look like (or
be) the web app. `/oauth/consent` is `ConnectPage`, a page of its own like `PaidPage`/`SharePage`:
no sidebar, no local database, no account store, no sync.

```
AI app ──authorize (PKCE)──▶ Supabase Auth ──302──▶ app.fixnote.space/oauth/consent?authorization_id=A
                                                     │ ConnectPage: "An AI app wants to read your notes"
            "Approve in the FixNote app" ────────────┤ opens fixnote://connect?authorization_id=A
                                                     ▼
 FixNote desktop (deep_link.rs → tray::show → webview) ConnectDialog, always asks:
   getAuthorizationDetails(A) with the app's session → client, can/cannot, redirect host, account
   Allow / Deny → approveAuthorization / denyAuthorization(A) → redirect R (code or access_denied)
   POST mcp.fixnote.space/api/consent/A {approved, redirect: R}   (app session bearer)
                                                     │  ConsentHandoff DO "A": R, ≤ 2 min, read once
 ConnectPage polls GET mcp.fixnote.space/consent/A every 1.5 s (≤ 3 min) ◀─┘
   → location.replace(R): back to ChatGPT / Claude in the same tab
```

- **Before sign-in** Supabase shows nothing (`getAuthorizationDetails` needs a session), so the page
  says "An AI app wants to read your notes" with what it can do (search and read; only what
  Settings → AI → Connected apps allows) and cannot (change or delete; read while FixNote is
  closed). The client's name, site, logo and redirect host appear in the app's dialog, or on the
  page once signed in there. A browser with the web app's session goes straight to Allow/Deny.
- **Fallback / phones**: "Sign in with an email code instead": an OTP session that lives only in
  that tab (`persistSession: false`), then the same card with Allow/Deny.
- After 5 s without an answer the page offers "Open FixNote again", the download page
  (fixnote.space/download) and the email code; after 3 min it stops polling.
- **The app** (`App.tsx` deep-link listener, also on a cold start: links wait in Rust until the
  webview takes them; the window comes to the front from the tray) parses the link
  (`parseConnectLink`, ids `[A-Za-z0-9_-]{8,128}`) and opens `ConnectDialog`. Signed out, or
  "Only on this device": it says so and points to the email code. An id that is not pending (wrong,
  expired, answered, another account's) shows an error. A client allowed before (Supabase answers
  with a redirect at once) gets "connecting again → Continue / Cancel"; Cancel hands over
  `{approved: false, redirect: null}` and the page shows "Not connected".
- **Never automatic**: any web page can open a `fixnote://` link, so the dialog always asks and
  shows the redirect host with "Allow only if you just connected FixNote in <host> yourself". This
  is the same risk as any OAuth consent screen reached by a link (consent phishing); the host line
  is what protects it.
- **The handoff** (`apps/relay/src/consent.ts`): one `ConsentHandoff` Durable Object per
  authorization id stores only `{approved, redirect}`; the first answer wins (409 after), the
  first read deletes it, an alarm deletes it after 2 min, and more than 200 reads answer 429.
  `GET /consent/<id>` needs no auth and allows the app origins (CORS); `POST /api/consent/<id>`
  takes the app's own session like the rest of `/api` (never an AI app's token). Handing the
  redirect to whoever knows the id is harmless: the id is an unguessable handle only that browser
  has, the code in it is useless without the PKCE verifier only the AI app holds, and the redirect
  goes to the AI app's registered callback anyway. Only http(s) redirects are accepted and
  followed.
- Cost: a connect is 1 POST + one GET per 1.5 s while waiting (typically 5–15, at most ~120), on a
  short-lived object: negligible on Workers Free.
- `?dev-backend`: any authorization id is a pending request from "Claude" (`again…` = allowed
  before, `expired…` = gone); the page hands links to an open `?dev-backend` app tab over
  BroadcastChannel and the handoff lives in localStorage. `&dev-signed-out` makes the page ignore
  the app tab's session.

## What Claude and ChatGPT require (checked Oct 2026)

- **Claude** ([authentication for connectors](https://claude.com/docs/connectors/building/authentication)):
  MCP over Streamable HTTP; 401 with `WWW-Authenticate` `resource_metadata` (required for claude.ai);
  `resource` must equal the URL the user pastes (`https://mcp.fixnote.space/mcp`); only the first
  `authorization_servers` entry is used; DCR or CIMD (Supabase: DCR); PKCE S256; callback
  `https://claude.ai/api/mcp/auth_callback` (maybe `claude.com` later) and loopback for Claude
  Code; refresh tokens rotated, `invalid_grant` on bad refresh; endpoints answer within 10 s
  (refresh 30 s); traffic from `160.79.104.0/21`.
- **ChatGPT** ([Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth)), developer mode
  connectors: protected resource metadata + AS metadata with `code_challenge_methods_supported:
  ["S256"]`; DCR or CIMD; redirect `https://chatgpt.com/connector_platform_oauth_redirect` (or
  `/connector/oauth/{callback_id}`); sends `resource` on authorize and token requests and expects
  the token's `aud` to match. Supabase keeps `aud = authenticated`; the relay accepts both, and a
  custom access token hook could set `aud` for OAuth clients later.

MCP protocol versions answered: `2025-11-25`, `2025-06-18`, `2025-03-26`. The relay answers JSON
(no SSE stream, no `Mcp-Session-Id`), `GET /mcp` → 405, which the spec allows.

## Relay ⇄ device protocol

Device opens `wss://mcp.fixnote.space/device` with subprotocols `fixnote.relay.v1` and
`auth.<supabase access token>` (browsers cannot set headers; a query string would end up in logs).
Refused tokens close with `4001`, accounts not on Pro with `4003` (accepted, then closed, so the app
sees the code).

| Direction | Message |
|---|---|
| device → relay | `{type:'hello'|'state', device, kind:'desktop'|'web', syncedAt, serving}` on connect and after each sync |
| device → relay | `{type:'scope', scope:{folders,notes}|null}` when the person changes Visible notes (or turns Remote access on) |
| relay → device | `{type:'call', id, client:{id,name}, tool, args, scope}` |
| device → relay | `{type:'result', id, content:[{type:'text',text}], isError?}` (≤ 512 KB) |
| both | `ping` / `pong` text, answered by the runtime (`setWebSocketAutoResponse`) without waking the object |

### Several devices online

- Each call goes to **exactly one** device, never fanned out. Order (`rankDevices`): only devices
  that said `serving: true` (a socket that has not said hello is never asked); desktop before a
  browser tab; then the freshest `syncedAt`; then the most recently active.
- A **read** that gets no answer in 8 s, or whose device drops, is tried **once** on the next
  device (25 s). Changes (phase 2) are never retried automatically.
- Devices can differ (one has not synced yet): the answer reflects the answering device's notes as
  last synced. Writes in phase 2 go through `NotesRepo` there and reach the others by normal sync.
- Remote access is **per device** (kv `mcp.remote`). A device with it off has no socket, and its
  executor refuses anyway. Settings lists the account's devices answering now.
- **Scope across devices**: `mcp.access`/`mcp.scope` are per device. The relay keeps one account
  remote scope (ids; folder ids are the same everywhere because folders sync), set from the device
  where the person last changed Visible notes with Remote access on. Every call carries it, and the
  answering device applies `its own mcp.scope ∩ account scope`, so no device shows more than its
  own settings allow. (The consent page cannot show folder names: they are encrypted.)

## Security notes

- **Prompt injection**: note text is the user's data, but a note (or a shared note someone else
  wrote, or a captured Telegram message) can contain instructions aimed at the AI app. Phase 1 is
  read-only, so the worst case is the AI app being steered within what it can read; the server
  instructions tell the client not to follow instructions inside notes. Phase 2 writes need
  on-device confirmation for deletes and bulk changes for exactly this reason.
- **Scope is enforced on the device**, not by the relay: the relay never sees folder names or note
  content at rest, and the executor re-reads the settings on every call. Notes out of scope answer
  exactly like notes that do not exist.
- **Token separation**: AI-app tokens carry `client_id` and are useless against PostgREST, Storage,
  Realtime and edge functions; device sockets refuse them.
- **Revocation**: Revoke in Settings (or in the AI app) → `revokeGrant` deletes the grant's sessions
  and refresh tokens; the relay refuses older tokens at once and Supabase refuses the session within
  the 60 s cache.
- **Observability**: the Worker keeps request logs (method, path, status) at 10 % sampling. It never
  logs bodies or headers; keep it that way.
- The relay trusts the client name a client gives at `initialize` / registration only as a label;
  the connect page and the app's dialog show the redirect host.

## Cloudflare cost (Workers Free)

Checked [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
(Oct 2026): Durable Objects are on Workers Free with the **SQLite backend only**: 100,000
requests/day, 13,000 GB-s/day, 5 M rows read/day, 100,000 rows written/day, 5 GB stored. Incoming
WebSocket messages bill at 20:1; outgoing messages and protocol pings are free; hibernated objects
cost no duration; `setWebSocketAutoResponse` replies cost no duration.

Per active user per day, roughly:

- device connections: a few reconnects (each = 1 request); 30 s keep-alives are auto-answered
  (free of duration; counted only as incoming messages at 20:1 if at all — ~2,900/day ≈ 150
  requests at worst);
- each tool call: 1 Worker request + 1 DO RPC + 1 incoming result message (1/20) + a DO wake of
  < 1 s at 128 MB ≈ 0.1 GB-s; each `initialize` adds one DO RPC and maybe one row write;
- token checks: 2 subrequests to Supabase per token per minute;
- rows written: last use at most every 5 min per client, plus `hello`/scope changes.

So ~50 calls/day per user ≈ 200–300 requests and ~5 GB-s: the free plan carries a few hundred
daily active users. Move to **Workers Paid ($5/month**: 1 M requests and 400,000 GB-s included,
then $0.15/M requests) when daily requests approach 100k or before launch to the whole user base
(the free limits fail hard when exceeded, they do not throttle).

## Deploying (manual)

1. Supabase: switch the project to asymmetric JWT signing keys (ES256) — clients request `openid`;
   `supabase config push` (turns on `[auth.oauth_server]` with dynamic registration and
   `/oauth/consent`); apply `20261014090000_remote_mcp.sql` (`pnpm sb:migrate`) after testing on the
   local stack; deploy the edge functions (`_shared/auth.ts` changed).
2. Cloudflare: `cd apps/relay && npx wrangler secret put SUPABASE_ANON_KEY`, then
   `pnpm --filter @fixnote/relay deploy` (custom domain `mcp.fixnote.space`, created from the
   route on deploy; it also applies Durable Object migration `v2`, the `ConsentHandoff` class). Check `SUPABASE_URL` / `APP_ORIGINS` vars in `wrangler.jsonc`.
3. Web app: `VITE_MCP_URL` (defaults to `https://mcp.fixnote.space`), rebuild and deploy; the
   consent page lives at `https://app.fixnote.space/oauth/consent` (SPA fallback serves it).
   Desktop: a release with `fixnote://connect` handling (`ConnectDialog`) and `connect-src`
   `https://mcp.fixnote.space wss://mcp.fixnote.space` in the CSP; older desktop builds ignore the
   link, so the page's email code stays the fallback.
4. Try: Claude → Settings → Connectors → Add custom connector → `https://mcp.fixnote.space/mcp`;
   ChatGPT → developer mode → add connector with the same URL.

## Phase 2

- Write tools (`create_note`, `append_to_note`, `edit_note`, `update_note`, `move_note`, folders)
  following the device's `mcp.access`, through `NotesRepo` and `AuditLog` with provider
  "<client> (remote MCP)" (already wired: `RemoteExecutor` passes it).
- On-device confirmation for deletes and bulk changes (a dialog on the answering device; the call
  waits or fails with "confirm in FixNote"), never retried on another device.
- Attachments (`get_attachment` as image/resource content), size limits through the relay.
- Optional: `aud` = resource via a Supabase custom access token hook; per-client scope; CIMD;
  `tools/list_changed` when the access level changes; a device picker when several answer.
