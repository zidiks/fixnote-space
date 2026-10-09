---
title: Voice notes that stay on your device
metaTitle: 'Offline voice notes: on-device speech to text in FixNote'
description: Dictate a note and FixNote turns speech into text on your device as you talk. The audio never leaves it, and after a one-time model download it works offline.
eyebrow: Dictation
intro: Want to dictate a thought or a to-do list without sending your voice to someone else's server? FixNote recognizes speech on your computer or in your browser and turns it straight into a note.
card:
  title: Voice notes
  text: Speech is recognized on your device, and the audio never goes online.
problem: Talking is faster than typing, but many dictation services send your recording to their servers. For work thoughts and personal plans that is a risk you don't need, and without internet that kind of dictation stops working.
stepsTitle: How it works
steps:
  - title: Start recording
    text: Click "Voice note" on Home or press Ctrl+Shift+Space (⌘⇧Space on a Mac).
  - title: Talk
    text: FixNote cuts the recording at pauses and transcribes each piece while you keep talking.
  - title: Press Done
    text: Only the last phrase is left to transcribe, so the note appears almost at once. Esc cancels the recording.
privacy: Speech is recognized by a Whisper model running inside the app, and the audio goes neither to us nor to anyone else. A voice note keeps only the text, not the recording. The model downloads once, and after that dictation works offline.
faq:
  - q: Does dictation work without internet?
    a: Yes, once the speech model has downloaded. That happens once, on your first recording, and after that dictation needs no connection.
  - q: Which languages can I dictate in?
    a: FixNote recognizes English, Russian and Spanish and detects the language on its own. If you mix languages within a sentence, the Accurate model handles it better.
  - q: Do I need an account or Pro?
    a: No. Dictation is part of the Free plan and works without an account, including in "Only on this device" mode.
  - q: How long can one recording be?
    a: Up to 10 minutes; then FixNote stops and transcribes it on its own. For long conversations there is a separate call summary feature.
---

## How to dictate a note

You can start from several places. "Voice note" on Home creates a new note. The "Dictate" microphone in an open note inserts the text where the cursor is. The microphone in the assistant chat sends your question as a voice message, and the recording stays on this device. Ctrl+Shift+Space (⌘⇧Space on a Mac) starts and stops recording, and in the desktop app you can also start a voice note from the tray icon's menu.

Turn on "Voice notes go to today’s note" in Settings → General, and dictated text is added to today's note instead of a new one.

The model is chosen in Settings → Advanced → "Models on this device". Light (about 41 MB) suits slower computers but makes more mistakes. Standard (about 77 MB) is the default. Accurate (about 245 MB) is better with mixed languages and about twice as slow. If two dictations out of three are slow, FixNote offers a lighter model once.

## When it helps

A thought on the go, a shopping list, a plan for tomorrow: saying it is quicker than opening a note and typing. The raw text is saved as spoken, repeats included. Press "Tidy up" in the notification after recording, and [AI suggests an edit](/features/ai-edits/) with paragraphs and a checklist that applies only when you accept it.

Voice messages you send to the [Telegram bot](/features/telegram/) on Pro are transcribed by the same model on your device. For calls, the desktop app has [call summaries](/features/call-summaries/): FixNote records both sides and writes up what was said.

## When another tool is better

If you need the audio itself to listen to later, FixNote is the wrong tool: it keeps only the text. On supported Apple devices, Apple Notes records audio with a transcript; see the [FixNote and Apple Notes comparison](/vs/apple-notes/). If text is what you need, start simple: press Ctrl+Shift+Space and dictate tomorrow's to-do list.
