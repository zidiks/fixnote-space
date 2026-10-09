---
title: 'Call transcription and summary on your computer with FixNote'
description: 'Record a Zoom, Meet or Telegram call and get a note with a summary, decisions and tasks. Transcription runs on your computer and no audio is kept.'
date: 2026-10-09
translationKey: call-notes
faq:
  - q: 'Does FixNote keep a recording of the call?'
    a: 'No. The sound stays in memory only while it is being transcribed. The note keeps the write-up and the text transcript.'
  - q: 'Can I record a call in the browser?'
    a: 'No. Call summary is only in the desktop app, on Windows and on macOS 14.2 or later. The app takes the other side from the system sound, which only a program on the computer can do.'
  - q: 'Can I get a call summary without the internet?'
    a: 'Yes, if you pick Ollama in Settings → AI. Then both the transcript and the summary are made on your computer.'
  - q: 'Do I need a virtual audio device to record the other people?'
    a: "No. On Windows FixNote reads the computer's sound through WASAPI loopback, on a Mac through a system Core Audio tap, with no drivers or extra apps."
---

How do you record a call so that afterwards you open a short note with what was agreed, without replaying the whole thing? This post covers how FixNote does it: where to start recording, what the app hears, what ends up in the note and what happens to the sound.

## Where to start recording a call

Call summaries are in the desktop app, on Windows and on macOS 14.2 or later. Next to the "Voice note" button there is a chevron; pick "Call summary" from its menu. You can also start and finish from the tray icon on Windows or the menu bar on a Mac ("Record a call" and "Finish the call"), so you don't need the FixNote window during the call.

When recording starts, the app reminds you to tell the others. It is polite, and in some countries the law requires it. On a Mac, the system asks for permission to record its sound the first time; allow it.

If you don't want to keep a call, press "Discard" and the recording and its transcript are gone. If you try to quit FixNote while a call is recording, the app asks first, because quitting would lose it.

## What FixNote hears during a call

The app listens to two sources. Your microphone is labeled "Me" in the transcript. The computer's sound, meaning the other people's voices from Zoom, Google Meet, Telegram or any other app, is labeled "Others". On Windows the computer's sound comes through WASAPI loopback, on a Mac through a system Core Audio tap. There are no drivers or virtual audio devices to install.

Headphones work best. Without them the microphone picks up the speakers and the other side's words get recorded twice. FixNote drops such echoes on its own, but with headphones they don't happen in the first place. If the computer's sound drops out mid-call, the app tells you and the microphone keeps recording.

## Transcription happens during the call

Speech is cut at pauses, and each piece is transcribed on your computer right away while the call goes on. It is the same Whisper model used for dictation, and you can switch models in Settings → Advanced. After you press "Finish" only the last pieces are left, so there is little to wait for. [Voice notes](/features/voice-notes/) explains the speech recognition in more detail.

FixNote never saves an audio file. The sound is held in memory while it is transcribed, and then only the text remains.

## What goes into the note

Once the transcript is ready, a language model writes up the call from the text, in the language the call was held in. The note can have three sections:

- "Summary" says in a few sentences what the call was about and where it ended.
- "Decisions" lists what was agreed.
- "Tasks" lists what people committed to do, each as a checkbox. When it's clear who took something on, the task starts with their name, for example "Me: send the draft by Friday".

A section only appears when the call had something for it. The model is told to write only what was actually said, with no advice or guesses, so you won't see empty headings. A long call is written up in parts that are then combined into one.

Below the write-up is the full transcript, folded into a "Transcript" block. Open it when you need the exact words.

## Which model writes the summary, and what it sees

The sound stays on your computer. The model only gets the text of the transcript. You choose the model in Settings → AI: FixNote AI (with Pro), your own key for any OpenAI-compatible provider, or Ollama on the same computer. With Ollama the whole conversation stays with you. The differences are covered in [which AI model to pick](/blog/which-ai-model-for-fixnote-assistant/).

If no model is available, FixNote saves the transcript alone and says why. The transcript is never lost.

## Finding the call later

The note is named "Call · date · duration", and regular search finds it by any word in the transcript. You can ask the assistant something like "what did we decide with Oleg about the beta dates?" and it answers with a link to that call. The [call summaries page](/features/call-summaries/) has the rest of the details.

Try it on your next short call: put on headphones, choose "Call summary" from the menu next to "Voice note", and after the call tick off what's done in the "Tasks" section.
