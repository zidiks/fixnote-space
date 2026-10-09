---
title: Call summaries
metaTitle: 'Record a call and get a summary on your computer: FixNote'
description: FixNote records calls on Windows and Mac, transcribes them on your computer and writes a summary with decisions and tasks. No audio file is kept.
eyebrow: Calls
intro: How do you come out of a Zoom or Telegram call with a short summary instead of a recording you will never replay? FixNote listens to you and the other side, transcribes on your computer and saves a note with decisions and tasks.
card:
  title: Call summaries
  text: The transcript of a call and a summary with tasks, in one note.
problem: During a call there is no time to take notes, and afterwards the details of what was agreed fade quickly. Nobody wants to replay an hour of audio to find one sentence.
stepsTitle: How it works
steps:
  - title: Start recording
    text: Click the arrow next to "Voice note" and choose "Call summary". You can also start from the tray icon on Windows or the menu bar on a Mac.
  - title: Talk as usual
    text: FixNote records your microphone ("Me") and what your computer plays ("Others"). Speech is transcribed on your computer while the call goes on, piece by piece between pauses.
  - title: Click "Finish"
    text: The last piece is transcribed and a language model writes the Summary, Decisions and Tasks sections. The full transcript sits below them, folded.
privacy: Sound is recognized on your computer and never saved; once it is transcribed, only the text is left. For the summary, the model you picked receives the transcript text. With Ollama on the same computer, the conversation never leaves it.
faq:
  - q: Can I record a call in the browser?
    a: No. Call summaries are in the desktop app only, on Windows and on macOS 14.2 or later. The web app does not have this option.
  - q: Do I need Pro for call summaries?
    a: No. Transcription always runs on your device, and the summary can come from your own API key or Ollama. With Pro, FixNote AI writes it with nothing to set up.
  - q: What happens if the model is not available?
    a: FixNote saves the note with the transcript only and tells you why the summary is missing.
  - q: Does a bot join the call, or do I need to install drivers?
    a: Neither. FixNote takes the computer's sound through the system itself, WASAPI on Windows and Core Audio on a Mac. Nothing is added to the call.
  - q: Is there a length limit?
    a: Recording stops by itself after four hours, and the note is saved as usual. A long transcript is written up in parts that are then combined.
---

## How to record a call

Open FixNote on your computer before the call starts. Next to the "Voice note" button there is an arrow, "More ways to record"; choose "Call summary" in its menu. You don't need to keep the window open: the tray icon on Windows and the menu bar icon on a Mac have "Record a call" and "Finish the call".

When recording starts, FixNote reminds you to tell the others. Wear headphones if you can. Without them your microphone hears the speakers, and the other side's words can end up in the transcript twice. FixNote drops such echoes itself, but with headphones they hardly happen.

Pick the model for summaries in Settings → AI: FixNote AI, your own key or Ollama. Speech is recognized by the same Whisper model as [voice notes](/features/voice-notes/), which you can change in Settings → Advanced. The summary is written in the language the call was held in.

## When it helps

After a weekly team call, tasks are already checkboxes, and when someone said who would do what, the name is in the line too. After a call with a client or a contractor, the Decisions section keeps what you agreed on dates and price, and the exact wording is in the transcript. If nothing was decided, the note simply has no Decisions section.

The note is named "Call · date · duration", and [search](/features/search/) finds it by any word from the transcript. A month later you can ask the assistant what was decided about the beta deadline, and it answers with a link to that call.

## When another tool is better

FixNote records calls only on a computer. For a meeting in person with just an iPhone at hand, recording in Apple Notes is handier: on supported devices it gets a transcript and a summary from Apple Intelligence ([FixNote vs Apple Notes](/vs/apple-notes/)). A team that already works in Notion on the Business plan may prefer AI Meeting Notes, which put the summary straight into the shared workspace. And if you need the audio file itself for an archive, use a separate recorder, because FixNote does not keep sound.
