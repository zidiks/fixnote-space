---
title: Tidy up your notes
metaTitle: 'Organize notes into folders with AI: Tidy up in FixNote'
description: FixNote suggests folders for loose notes, titles for untitled ones and finds duplicates. Nothing changes until you press Accept, and every change can be undone.
eyebrow: Organize
intro: Untitled notes, duplicates and notes that belong in your Work folder pile up on their own. Tidy up looks through the list and suggests where each note should go and what to call it.
card:
  title: Tidy up
  text: AI suggests folders and titles and finds duplicates, and you decide.
problem: When you write fast, there is no time to think about where a note goes or what to call it. A couple of months later half your notes have no folder, and the list is full of lines that start in the middle of a thought.
stepsTitle: How it works
steps:
  - title: Run it
    text: Click "Tidy up" in the sidebar, then "Find suggestions".
  - title: Look through the suggestions
    text: They come in three groups, Folders, Titles and Duplicates, and each one says exactly what will change.
  - title: Accept what you like
    text: Press Accept or Reject on each suggestion, or "Accept all" and "Reject all" to decide in one go.
privacy: For folders and titles the model receives note titles, the beginning of each note and your folder names. Duplicates are found on your device without a model. With Ollama in the desktop app, nothing goes online.
faq:
  - q: Will FixNote change anything without my approval?
    a: Not by default; every suggestion waits for Accept. Only the "Auto" mode applies them right away, and even then each one can be undone from the AI activity log.
  - q: What happens when two duplicates are merged?
    a: Lines from the second note that the first one lacks are added to the end of the first, and the second note is deleted. No text is lost, and the merge can be undone from the AI activity log.
  - q: Why doesn't FixNote suggest tags?
    a: 'FixNote has no tags; it keeps order with folders and search. A word with a # in your text stays plain text, and search finds it.'
  - q: Do I need Pro?
    a: No. Tidy up works with your own model key or with Ollama. With Pro you can use FixNote AI without a key.
---

## How to tidy up your notes

Click "Tidy up" in the sidebar, then "Find suggestions". Under Folders, FixNote suggests moving a note that has no folder into an existing folder or a new one; it proposes a new folder only when at least two notes clearly belong there. Under Titles you get names for notes whose first line is a long sentence rather than a title. Under Duplicates you see pairs of notes with the same title and nearly the same text.

You can also tidy a few notes at once. Pick them in the list with a long press or Ctrl+click (⌘+click on a Mac) and choose "Tidy up" in the selection bar.

It also works in the background. When you leave a new note that has no folder, FixNote suggests a folder and a title in a notification with Apply and Review buttons. Every few days it looks for suggestions on its own if several notes have no folder.

Every accepted suggestion goes into "AI activity" in Settings → AI, for example "Moved “Groceries” to “Home”". Undo puts things back as long as the note has not been edited since. In Settings → AI → "AI modes", "Auto" applies suggestions right away, while "Accept edits" still leaves them to you.

## When it helps

After an [import](/features/import-export/) from another app you may have hundreds of notes to sort, and one run puts most of them into folders. If you dictate a lot or forward messages from Telegram, notes arrive without names, and Titles gives them ones you can recognize in the list. For habits that keep notes easy to find, see [how to take notes you can actually find later](/blog/how-to-take-notes-you-can-find/).

## When another tool is better

If you organize with tags and links between notes, Obsidian suits you better: those are at the heart of that app, while FixNote relies on folders and [search](/features/search/). The [Obsidian comparison](/vs/obsidian/) covers the differences. If you stay with FixNote, accept only the title suggestions the first time: it is the easiest way to see how Tidy up works without moving anything.
