---
title: 'How to tidy up your notes with AI: folders and titles in FixNote'
description: 'How Tidy up in FixNote suggests folders, titles and duplicates to merge, what the model sees, and how to accept, reject or undo every single change.'
date: 2026-09-30
translationKey: tidy
faq:
  - q: 'What does FixNote send to the model when tidying up?'
    a: 'Your folder names and, for notes without a folder or a title, each note’s title and the start of its text, up to 280 characters. Duplicates are found on your device without a model.'
  - q: 'Can I undo a move or a merge?'
    a: 'Yes. Every accepted suggestion is recorded in the AI activity log in Settings → AI, where you can undo it as long as the note hasn’t been edited since.'
  - q: 'Does Tidy up work without Pro?'
    a: 'Yes, if you connect your own API key or Ollama in Settings → AI. With FixNote AI it is part of Pro.'
  - q: 'Does FixNote delete duplicates on its own?'
    a: 'No, it only suggests merging them. If you accept, lines missing from the newer note are added to it and the older one is deleted. That can be undone from the log too.'
---

How do you sort out notes that piled up for months with no folder and no title? FixNote has Tidy up for that: the AI suggests folders and titles, the app finds duplicates, and you decide what to accept. This post shows how to run it, what the model sees and how to undo any change.

## How to run Tidy up

Click "Tidy up" in the sidebar, then "Find suggestions". FixNote looks through your notes and shows suggestions in three groups:

- "Folders" suggests moving a note into an existing folder or a new one.
- "Titles" suggests a name for a note whose first line turned out to be a long sentence.
- "Duplicates" shows near-identical notes that you can merge.

Each suggestion has "Accept" and "Reject", and "Accept all" and "Reject all" handle the whole list. The model only proposes a new folder when at least two notes clearly belong in it, and names it in the notes' language. If there is nothing to suggest, FixNote says "No suggestions: everything looks tidy."

You can also tidy just a few notes: pick them in a list with Ctrl+click (⌘+click on a Mac) and press "Tidy up" on the selection bar.

## What FixNote does without being asked

Every few days the app looks for suggestions in the background if at least three notes have no folder. What it finds waits on the Tidy up page; nothing is applied.

There is one more hint. When you leave a fresh note without a folder that has a few lines of text, FixNote offers a folder and a title for it in a notification with "Apply" and "Review".

## What the model sees

For folders and titles, FixNote sends the model your folder names and up to 40 notes that need a folder or a title. From each note the model gets only its title and the start of its text, up to 280 characters. Duplicates are found on your device without a model: FixNote compares words and suggests a pair when two notes share a title and most of their words, or when almost all of the text matches.

You choose which model answers in Settings → AI: FixNote AI, your own key or Ollama. With your own key or Ollama, Tidy up works on the free plan too; [which AI model to pick](/blog/which-ai-model-for-fixnote-assistant/) compares them. Notes shared with you to view only are never part of the suggestions.

## What happens when you accept

A move puts the note in the chosen folder and creates the folder if it doesn't exist yet. A title is added as the first line of the note. A merge adds the lines the newer note is missing and deletes the other note, so no text is lost.

An accepted suggestion applies at once and goes into the AI activity log in Settings → AI. The log shows what changed and when, for example "Moved “Groceries” to “Home”". "Undo" puts things back as long as the note hasn't been edited since; if it has, the log says the change can no longer be undone.

## Auto mode

By default suggestions wait for you. Settings → AI → "AI modes" has an "Auto" mode in which suggestions, including the ones found in the background, apply right away and a notification offers Undo. The log and Undo work the same way. In "Accept edits" mode, Tidy up suggestions still wait for your approval.

## Why there are no tags

FixNote has no tags. Order comes from [folders](/features/folders/) and search, which is why Tidy up only suggests folders and titles. A word with `#` stays plain text, and search finds it. Tags in the front matter of imported Markdown files are kept as a last line of such words.

## When to run it

It is most useful right after a big import from another app, and later whenever notes without a folder pile up again. The [Tidy up page](/features/tidy-up/) has more on the feature.

The first time, accept only the suggestions in the "Titles" group, then open the AI activity log and undo one of them. That shows how the feature works without moving anything between folders.
