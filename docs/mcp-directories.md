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
need the same thing, and only one device has to stay online. Not a real person's account.

- **Mailbox we own**, e.g. `review@fixnote.space` (a Resend/Cloudflare route to our inbox), so we can
  sign it in on our own devices with the usual email code.
- **Password** for reviewers: OpenAI accepts only a login and password, no email codes. Supabase
  dashboard → Authentication → the user → set a password (30+ random characters). On the connect
  page (`/oauth/consent`) anything typed into the code field that is not 6 digits is tried as a
  password (`isEmailCode`, `connect-backend.ts`). Normal accounts have no password, so this opens
  nothing else. Change it after each review round.
- **Pro**: a `subscriptions` row by hand (SQL editor), with a period end far ahead.
- **Demo notes**: a few dozen English notes in folders (work, travel, reading, a few daily notes
  with tasks, a link or two), so search and every tool return something.
- **A device that stays online**: the desktop app on a spare computer or a small Windows VM, signed
  in, Remote access on, "Read and write", window hidden to the tray, sleep off. Without it every
  call answers "Fixnote is not open on any of your devices" and the review fails. Check it each
  morning while a review is open (`fixnoteRemote` or a call from claude.ai).

Reviewer instructions (OpenAI "Review details", or the email to Anthropic):

> Connect the app, then on the Fixnote page choose "Sign in with an email code instead", enter
> `<email>` and press "Send code". Instead of the code, type the password `<password>` into the code
> field and press "Sign in", then "Allow". The account has Pro and demo notes; its device is kept
> online, so every tool works.

Never commit the password; it goes only into the review forms.
