---
title: "FixNote vs Obsidian: which is better for your notes"
metaTitle: "Obsidian alternative with a built-in AI assistant: FixNote"
description: "Obsidian or FixNote: AI without plugins, end-to-end encrypted sync, a web version and price. Where each app is stronger and how to bring your vault over."
intro: "Obsidian keeps notes as plain Markdown files and grows through community plugins. FixNote writes Markdown too, but its assistant, dictation and sync work right after install, with nothing to set up. Here is how the two differ, including where Obsidian is the better pick."
steps:
  - title: "Decide how much you want to tinker"
    text: "If you enjoy building your tool from plugins, themes and scripts, Obsidian gives you more room. If you want everything to work the moment it is installed, FixNote is the easier fit."
  - title: "Check where you write"
    text: "Obsidian has apps for Linux, iPhone and Android but no browser version. FixNote runs on Windows, macOS and in the browser, phones included."
  - title: "Add up sync and AI"
    text: "Obsidian Sync costs $4 a month billed yearly or $5 monthly, and AI comes from community plugins. FixNote Pro at $7 covers sync and FixNote AI, and your own model key works on the free plan."
  - title: "Open your vault in FixNote"
    text: "FixNote's import reads the whole vault folder and keeps its structure. A week is usually enough to see whether you miss your plugins."
why:
  - "The assistant is built in: it searches by meaning, answers with links to your notes and edits them, showing each change as a diff."
  - "Your own model key or Ollama plug in from Settings, with no third-party plugins, and they work on the free plan."
  - "Dictation and call summaries are transcribed on your computer, and the Telegram bot turns forwarded messages into notes."
  - "FixNote opens in the browser on any computer or phone, while Obsidian has no web version."
  - "The built-in MCP server shows Claude and Cursor only the folders you choose, and every change they make lands in a log."
still:
  - "Obsidian has a large catalogue of plugins and themes, and FixNote can't be extended with plugins."
  - "Obsidian runs on Linux and has native iPhone and Android apps; FixNote has neither a Linux app nor phone apps."
  - "If you rely on links between notes, backlinks and the graph view, FixNote doesn't have them."
verdict: "Obsidian suits people who want to assemble their own system from plugins and keep the files at hand. FixNote suits people who want an assistant, dictation and end-to-end encrypted sync without any setup. Both keep notes in Markdown, so you are never locked in either way."
faq:
  - q: "Can I import from Obsidian?"
    a: "Yes. In Settings → Data → Import notes, click Choose folder and pick your vault. Folders are kept, images become attachments and tags from the front matter are added to the note text."
  - q: "Does Obsidian have built-in AI?"
    a: "No. AI in Obsidian comes from community plugins. FixNote has a built-in assistant that works with FixNote AI, your own key or Ollama."
  - q: "Is Obsidian Sync end-to-end encrypted?"
    a: "Yes, Obsidian Sync uses AES-256 end-to-end encryption. It protects what goes to Obsidian's servers; on your disk the notes stay plain Markdown files."
  - q: "Is there a web version of Obsidian?"
    a: "No. Obsidian ships apps for Windows, macOS, Linux, iPhone and Android, and only a Web Clipper extension for the browser. FixNote also runs in the browser."
  - q: "Do [[wiki links]] survive the move?"
    a: "Their text does, but you can't follow them in FixNote, since it has no links between notes or backlinks. Images embedded with ![[...]] are imported."
---

## AI without plugins

Obsidian has no built-in AI. Community plugins add it, and there are many of them, each with its own ideas, but choosing, configuring and updating them is up to you.

FixNote's [assistant](/features/ask-your-notes/) works out of the box. It searches by words and by meaning in English, Spanish and Russian, answers with links to your notes, writes new notes and moves them between folders. Deleting, or changing more than a few notes at once, always asks first, and any change can be undone from the log in Settings → AI. You pick the model: FixNote AI with Pro, your own key, or Ollama on your computer.

The [MCP server](/features/mcp/) is built in and free as well. Claude Desktop, Claude Code or Cursor see only the folders you allow. Obsidian has no official MCP server: since version 1.12 it has an official command-line tool, and MCP servers come from the community.

## Sync and encryption

Obsidian Sync encrypts notes end to end with AES-256 and costs $4 a month billed yearly or $5 monthly. It is a good service, and you pay for sync alone.

In FixNote, end-to-end encryption is always on: each note is encrypted on your device, with keys derived from a 12-word phrase. Sync is part of Pro at $7 a month, together with FixNote AI, [shared notes](/features/shared-notes/) and the Telegram bot. The [encryption page](/features/encryption/) lists exactly what the server sees.

## Platforms

Obsidian runs on Windows, macOS, Linux, iPhone and Android, and has no web version. FixNote runs on Windows, macOS and in the browser. On a phone it opens as a web app; there are no native iPhone or Android apps. If you write on Linux or want an app from the App Store, Obsidian is the better fit.

Storage differs too. An Obsidian vault is an ordinary folder that any cloud drive can sync. FixNote keeps notes in its own database on the device and exports them to Markdown with Export notes in Settings → Data.

## How to bring your Obsidian vault over

1. In FixNote, open Settings → Data → Import notes and click Choose folder.
2. Pick your vault folder. FixNote shows how many notes, folders and images it found.
3. Click Import. The folder structure is kept, and images from `![[...]]` embeds and regular links become attachments.

Tags from the front matter are added to the text as `#tag` lines so search finds them. Links like `[[note]]` stay as text. Files that aren't notes are skipped and counted. The import doesn't touch your vault, so you can use both apps side by side for a while. More on the [import and export page](/features/import-export/).
