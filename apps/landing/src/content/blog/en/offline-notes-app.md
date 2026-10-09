---
title: 'Offline notes app with no account: how FixNote works offline'
description: 'What FixNote does without a connection or sign-up, what Only on this device mode switches off, and how to connect the assistant to a local model with Ollama.'
date: 2026-09-27
translationKey: offline
faq:
  - q: 'Can I use FixNote without signing up?'
    a: 'Yes. The Free plan works without an account and has no time limit: notes, folders, search, dictation and text in images all stay on your device.'
  - q: 'Does FixNote work without the internet?'
    a: 'The Windows and macOS apps work fully offline. You need a connection once to download the models for search by meaning, speech recognition and text in images.'
  - q: 'What does Only on this device mode turn off?'
    a: 'Sync, the Telegram bot, sharing notes, share links and FixNote AI. In this mode the assistant works only through Ollama.'
  - q: 'Can I use AI in FixNote offline?'
    a: 'Yes, through Ollama in the desktop app. The model runs on your computer, and your questions to the assistant stay there.'
---

Can you keep notes in FixNote without signing up and without sending anything to the cloud? Yes. The app works without an account and without a connection, and Only on this device mode keeps your notes off our server even when you are signed in. Here's what works, what doesn't, and how to point the assistant at a model on your own computer.

## FixNote without an account

Install the app and start writing; there's nothing to sign up for. On your device you get notes and folders, the daily note and repeating tasks, checklists and tables, images and files, search by words and by meaning, dictation, text in images, and Markdown import and export. That is the Free plan, and it has no time limit.

Search by meaning, speech recognition and text in images run on models that download once, the first time you use them. After that they don't need the internet. Settings → Advanced → Models on this device lists them with their sizes and buttons to download or remove each one.

The Windows and macOS apps work fully offline. The web app also keeps your notes in the browser on your device, but you need a connection to open it.

## When the connection drops

If you are signed in and lose the connection, nothing stops. Changes pile up on the device, and on Pro sync sends them once you're back online. Meanwhile the sync status reads "Offline. Changes will sync when you are back online." If the same lines were changed on another device in the meantime, FixNote keeps the server version, saves your edit as a copy and offers to compare the two.

## Only on this device mode

This mode is in the desktop app, under Settings → AI, below the model choice. While it's on, your notes don't go to our server:

- Sync neither sends nor fetches anything, even if you are signed in.
- The Telegram bot is off, and you can't share a note or create a link to it.
- FixNote AI and your own API key are unavailable, so the assistant works only through Ollama.

Everything else works as usual, and the sidebar shows "Only on this device" where the sync status would be. The MCP server for Claude, Cursor and Codex keeps working too, since it reads the local database; see [MCP server for your notes](/blog/mcp-server-for-notes/).

## The assistant with Ollama

Ollama runs language models on your own computer. Install it, download a model with a command such as `ollama pull llama3.1`, and choose Ollama in Settings → AI → Model. FixNote finds the installed models by itself, and the Check button tells you whether the selected one answers.

Ollama works in the desktop app. Answer quality depends on the model and on your hardware: small models reply faster but get long questions wrong more often. The [assistant page](/features/ask-your-notes/) covers the assistant's other options.

## What else the app connects to

Apart from our server, the app reaches a few addresses on the internet:

- The desktop app checks for updates on fixnote.space and downloads the update files from GitHub. You can turn this off with "Check for updates automatically" in Settings → General; the Microsoft Store version updates through the Store.
- The models for search by meaning and speech recognition come from Hugging Face, and the language data for text in images comes from jsDelivr.
- When you paste a link, the desktop app fetches its preview card directly from the linked site.

## Who local-only mode is for

Local-only mode suits work notes under an NDA, a computer that is often offline, and anyone who doesn't want their notes in the cloud, even encrypted. If you need sync later, turn the mode off and sign in: your notes stay where they are and start syncing. The [offline feature page](/features/offline/) has the details.

To try it all at once, install Ollama, turn on Only on this device, switch off Wi-Fi and ask the assistant a question about your notes.
