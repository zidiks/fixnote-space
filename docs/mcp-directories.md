# MCP directories

Where Fixnote's MCP servers are listed, in the order to do it (quick ones first), and the text to
paste. Two servers:

- **Remote** `https://mcp.fixnote.space/mcp` (`apps/relay`, docs/remote-mcp.md): for claude.ai,
  ChatGPT and any client that takes a URL. Needs Pro and one of the person's devices open with
  Settings → Integrations → Remote access on. 11 tools: search, read, list, daily note, create,
  append, edit, rewrite, move notes, create folders. Never deletes or renames.
- **Local** `fixnote-mcp` (`apps/mcp`), bundled with the desktop app, which connects Claude
  Desktop, Cursor and Codex itself (Settings → AI → Connected apps). Not a package anyone installs
  on its own, so directories list the remote server and mention the local one in the text.

Only claim what the server does. Keep names plain: "Fixnote", never "Fixnote MCP" or "Fixnote
Plugin" (ChatGPT's rules forbid it, the others look better without it).

## 1. Official MCP Registry (no review)

`apps/relay/server.json`, name `space.fixnote/fixnote`. A test keeps its `version` equal to the
relay's `SERVER_VERSION`; publish again whenever that changes.

The namespace `space.fixnote` is proven over HTTP: `https://fixnote.space/.well-known/mcp-registry-auth`
(`apps/landing/public/.well-known/`, served as text/plain without redirects) holds the public key.
The private key is on the publisher's computer in `%USERPROFILE%\.mcp-registry\` (`key.pem`, and
`key.hex` for the CLI), never in the repository. Losing it is not fatal: make a new pair, put the
new line in the file next to the old one, log in with the new key, then drop the old line.

```bash
# mcp-publisher.exe from github.com/modelcontextprotocol/registry/releases (1.8.9 used; it takes
# the key only as --private-key, not from a file or MCP_PRIVATE_KEY)
mcp-publisher login http --domain fixnote.space --private-key "$(cat "$USERPROFILE/.mcp-registry/key.hex")"
cd apps/relay && mcp-publisher publish
```

Published 2026-11-16: `space.fixnote/fixnote` 0.2.0.

Check: `https://registry.modelcontextprotocol.io/v0/servers?search=space.fixnote`. Other
directories (PulseMCP, Glama, VS Code, GitHub) read the registry, so this one goes first.

## 2. Web directories (a form, a few minutes each)

| Directory | How | Notes |
|---|---|---|
| Glama (glama.ai/mcp/servers) | "Add server" → remote URL | Also reads the registry |
| Smithery (smithery.ai) | "Publish" → URL of an existing server | Runs `tools/list`: answers 401 until signed in, which is expected for OAuth |
| mcp.so | "Submit" form | Plain listing |
| PulseMCP (pulsemcp.com) | Submit form, or picked up from the registry | |

### Listing text (EN)

**Name:** Fixnote

**Short (≤ 100 chars):** Search, read and add to your Fixnote notes. End-to-end encrypted: read on your own device.

**Description:**

> Fixnote is a private notes app for Windows, macOS and the web, with an assistant that helps you
> remember. This server lets Claude, ChatGPT and other AI apps search and read your notes, and,
> where you allow it, create notes, add to them, edit them, move them and create folders. It never
> deletes or renames anything.
>
> Notes are end-to-end encrypted. The server stores no note content and no keys: each request goes
> to your own device (the desktop app, or app.fixnote.space in a browser) with Remote access turned
> on, which reads the notes and answers. In Fixnote you choose which folders and notes AI apps can
> see and whether they may change anything, and every change can be undone there.
>
> Connect: add `https://mcp.fixnote.space/mcp` as a connector and sign in with your Fixnote
> account (OAuth). Remote access is part of Fixnote Pro. On a computer, the desktop app also
> includes a local MCP server that connects Claude Desktop, Cursor and Codex from Settings → AI.

**Tags:** notes, knowledge base, personal knowledge, productivity, encrypted, end-to-end encryption, daily notes

**Links:** site `https://fixnote.space/`, privacy `https://fixnote.space/privacy/`, icon
`https://fixnote.space/apple-touch-icon.png` (180×180) or `https://fixnote.space/favicon.svg`.

## 3. Claude and ChatGPT directories (review)

Both want what we have (public HTTPS, OAuth with PKCE and DCR, `title` and
`readOnlyHint`/`destructiveHint` on every tool, a privacy policy) plus things to set up first:

- **A demo account for reviewers** (one for every directory, see "Reviewer account" below).
- **Claude** (claude.com/docs/connectors/building/submission): submitted from the directory portal
  in claude.ai; automated scan, then listed as a community connector. Run the review criteria
  checklist (claude.com/docs/connectors/building/review-criteria) first.
- **ChatGPT** (platform.openai.com, plugins): needs a verified OpenAI organization; a ZIP with
  `plugin.json` and `mcp.json` pointing at the remote server, icon 64×64 under 5 KB, name up to
  30 characters, screenshots. The server URL cannot change after approval.

Both change their rules often: read the current pages before submitting.

## Reviewer account

One account for all reviewers (OpenAI, Anthropic's Verified review, anyone else who asks): they all
need the same thing. Not a real person's account. Ours: `review@fixnote.space`, user id in
`DEMO_ACCOUNTS` (`apps/relay/wrangler.jsonc`; made again → put the new id there and deploy).

- **Mailbox we own** (Cloudflare Email Routing to our inbox), so we can sign it in with the usual
  email code.
- **Fixed sign-in code** for reviewers (none of them can read our mailbox): secrets of the
  `review-login` edge function, never in the repository. `REVIEW_ACCOUNTS` (emails,
  comma-separated) and `REVIEW_CODE` (8–10 digits, so it never looks like an emailed 6-digit code):

  ```bash
  pnpm sb secrets set REVIEW_ACCOUNTS=review@fixnote.space REVIEW_CODE=<8-10 digits>
  pnpm sb functions deploy review-login
  ```

  In the app and on the connect page (`/oauth/consent`), a code of 8–10 digits goes to
  `review-login` (`verifySignInCode`, `lib/account/review-code.ts`), which answers a one-time
  magic-link token hash for those accounts only (10 tries a minute per email); the app signs in
  with it like with an emailed code. Without both secrets nothing signs in this way. Change the
  code after each review round. OpenAI asks for "login and password": the email and this code.
- **Pro**: a `subscriptions` row by hand (Table Editor): `status` active, `current_period_end`
  2030-01-01, `provider` manual. No trial (7 days, once).
- **Demo device**: the relay answers for an account in `DEMO_ACCOUNTS` itself when none of its
  devices is online (`apps/relay/src/demo.ts`, Durable Object `DemoDevice`): core's
  `RemoteExecutor` and `NoteTools` over the object's SQLite (`demo-sql.ts`), with the notes of
  `demo-notes.ts`. No computer has to stay on. The notes start over when `DEMO_VERSION` changes,
  or once they are a day old and nobody used them for an hour. A real device of that account,
  when online, answers instead (its own notes). The only place the relay keeps note content, and
  only demo notes.

Reviewer instructions (OpenAI "Review details", or the email to Anthropic):

> Connect the app, then on the Fixnote page choose "Sign in with an email code instead", enter
> `<email>` and press "Send code". Enter the code `<code>` (it does not come by email) and press
> "Sign in", then "Allow". The account has Pro and demo notes and works at any
> time; every tool can be tried, changes included (the notes start over daily).

Never commit the code; it goes only into the review forms. The same email and code sign in to the
Fixnote app itself (web or desktop), e.g. for Microsoft Store testers; on a new device the app
then asks for the account's recovery phrase (notes are end-to-end encrypted), so give them that too.
The connect page never asks for it.
