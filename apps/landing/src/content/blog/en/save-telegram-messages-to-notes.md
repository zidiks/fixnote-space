---
title: "Save Telegram messages to your notes with the FixNote bot"
description: "How to connect the FixNote bot in Telegram, what you can send it, why the bot can't read your messages, and what to check when a note doesn't show up."
date: 2026-10-06
translationKey: telegram-capture
faq:
  - q: "How do I save Telegram messages to my notes?"
    a: "Connect the bot in FixNote: Settings → Integrations → Telegram → Connect. Then send or forward text, voice messages and photos to the bot, and each message becomes a note in the app."
  - q: "Can the FixNote bot read my messages?"
    a: "No. The bot seals each message with your account's public key right away, and only your app can open it. Telegram itself sees your chat with the bot, as it sees any chat."
  - q: "Can I add the FixNote bot to a group?"
    a: "No. The bot works only in a private chat, so other people's messages from a group never end up in your notes."
  - q: "Is the Telegram bot free?"
    a: "The bot is part of Pro. Pro has a 7-day trial with no card, which you start yourself."
---

A lot of people send things to their Saved Messages in Telegram and then can never find them again. How do you send thoughts, links and voice messages straight into your notes instead? FixNote has a bot for that: whatever you send or forward to it becomes a note in the app. Here's how to connect it, what you can send, and why the bot can't read your messages.

## How to connect the bot

The bot is part of Pro and works through your FixNote account. Open Settings → Integrations → Telegram and press Connect. Telegram opens with the bot; press Start there. The link carries a one-time code that is valid for 15 minutes and ties your chat to your account. FixNote's settings then show Connected with your Telegram name.

The bot only works in a private chat. If you add it to a group, it stays silent, because otherwise other people's messages would land in your notes.

To disconnect, press Disconnect in the same settings or send `/stop` in the chat with the bot.

## What you can send the bot

The bot takes text, voice messages, audio files and photos, forwarded ones included:

- Text becomes a note. Links hidden behind words are kept, and a link on a line of its own turns into a card with the page's title and image.
- A voice message is transcribed on your device: the note has the text, with the recording below it.
- A photo becomes an image in the note, and its caption becomes the text.
- A forwarded message gets a line with its author, and a post from a public channel also gets a link back to the original.

Files over ten megabytes are refused, and the bot says so in the chat. Documents and videos aren't supported yet.

New notes arrive without a folder. If you'd rather collect everything in one place, turn on "Messages go to today’s note" in the same settings, and messages are added to [today's daily note](/blog/daily-note-and-recurring-tasks/) instead.

## Why the bot can't read your messages

Your account has a key pair. The public key is on the server; the private key exists only on your devices. When a message arrives, the bot immediately seals it with the public key and puts it in a queue. Only the private key, meaning your app, can open it. Neither the bot nor we can read it. The message is never stored on the server in readable form and never written to logs.

Voice messages are sealed whole, and there is no transcription on the server. Speech is recognized later in the app, on your computer or in your browser, the same way as [voice notes](/features/voice-notes/).

The app takes messages from the queue, turns them into notes and deletes them from the server. From then on they are encrypted and synced like any other note.

Telegram itself sees your chat with the bot, as it sees every chat in it. Those are Telegram's rules, and FixNote can't change them. More on the [Telegram bot page](/features/telegram/).

## Why you can't read notes through the bot

The bot only writes. Searching and asking questions happen in the app. That's on purpose: to show your notes in Telegram, the bot would have to read them, which means they would sit somewhere unencrypted.

## If a message doesn't show up

Messages turn into notes while the app is open. That usually happens almost at once: the server wakes the app as soon as the bot has queued a message. If the app was closed, the notes appear the next time you open it.

If the bot replied "This link has expired", press Connect again: the code in the link is valid for 15 minutes. In Only on this device mode the bot is off, because in that mode FixNote doesn't talk to our server at all.

Send the bot a short voice message, then open FixNote: a note with its text will be waiting for you.
