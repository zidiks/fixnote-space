---
title: 'Offline speech to text: how dictation works in FixNote'
description: 'How to dictate notes in FixNote, which speech recognition model suits your computer, and why the recording of your voice never leaves your device.'
date: 2026-10-07
translationKey: voice-on-device
faq:
  - q: 'Does FixNote dictation need an internet connection?'
    a: 'Only once, to download the speech recognition model. After that, dictation works offline.'
  - q: 'Where does the recording of my voice go?'
    a: 'Nowhere. Speech is recognized on your device, and the audio of a dictated note is not kept. A spoken question to the assistant stays on the device so you can play it back.'
  - q: 'Does dictation work in the browser?'
    a: 'Yes. The Whisper model runs inside the app both in the web app and in the Windows and macOS apps.'
  - q: 'Which model is the most accurate?'
    a: 'Accurate, about 245 MB. It handles mixed languages better but is about twice as slow as Standard.'
---

Can you dictate notes without sending your voice to someone else's server? In FixNote you can: speech is recognized on your computer or in your browser. Below: how to start recording, where the text goes, what happens to the audio and which model to choose for your machine.

## How to start dictating

There are several ways to start a recording:

- The Voice note button on Home turns what you say into a new note.
- The microphone in an open note inserts the text where the cursor is.
- The microphone in the assistant chat sends your question straight away as a voice message, and the assistant answers the recognized text.
- In the desktop app, Voice note is also in the tray icon's menu.

Ctrl+Shift+Space (⌘⇧Space on a Mac) starts and stops a recording from anywhere. With a note open, the text goes into it; with the cursor in the chat box, it becomes a question to the assistant; otherwise you get a new note. Esc cancels the recording and Done finishes it. A single recording can run for up to ten minutes.

Turn on "Voice notes go to today’s note" in Settings → General, and new dictations are added to today's note instead of becoming separate notes.

## What happens while you speak

FixNote cuts the recording at pauses and transcribes each piece right away, without waiting for you to finish. The language is detected from the first piece and kept for the rest. When you press Done, only the last phrase is left to process, so the text appears almost at once, even after a long dictation.

## Where speech is recognized and what happens to the audio

Speech is recognized by the Whisper model. It runs inside the app on every platform, the web app included, and the audio is not sent anywhere. The model downloads once, the first time you record (FixNote shows the progress); after that, dictation doesn't need the internet.

When you dictate into a note, the audio is not kept: the note gets only the text. A question you ask the assistant by voice is stored on this device so you can play it back in the chat.

## Which model to choose

Settings → Advanced → Models on this device lists three speech recognition models:

| Model | Size | Good for |
|---|---|---|
| Light | about 41 MB | Slower computers; makes more mistakes |
| Standard | about 77 MB | Most recordings; the default |
| Accurate | about 245 MB | Speech that mixes two languages; about twice as slow |

The same list shows which models are downloaded and how much space they take, and you can remove any of them.

If recognition is slow on your computer, FixNote notices. After two slow dictations out of three, it offers a lighter model, once. You can switch back in the same settings.

## Cleaning up dictated text

Dictated text is saved as spoken, with every "um" and repetition. After a new voice note, FixNote shows a Tidy up button: AI suggests paragraphs and bullet points and shows the changes word by word. The edit applies when you click Accept, and Reject leaves the text as it was. You can tidy up any other note the same way with Ask AI → Tidy up the note.

This needs a language model: FixNote AI on Pro, your own API key, or Ollama on your computer. If Settings → AI is set to a mode that applies edits right away, FixNote shows a notice with an Undo button instead.

## Telegram voice messages and calls

Voice messages you send to the FixNote bot in Telegram are transcribed by the same model on your device; the bot passes them on encrypted. See the [Telegram feature page](/features/telegram/) for how it works.

In the Windows and macOS apps (macOS 14.2 or later), speech can also be recognized during a call: FixNote records your microphone and the other side's audio, transcribes both on the device and writes a summary of the meeting. More on the [call summaries page](/features/call-summaries/), and everything about voice notes is on the [voice notes page](/features/voice-notes/).

Open today's note, press Ctrl+Shift+Space and dictate your to-do list for tomorrow. The first recording takes a little longer while the model downloads; the ones after that start without waiting.
