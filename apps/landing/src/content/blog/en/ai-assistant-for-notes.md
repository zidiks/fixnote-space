---
title: 'AI Assistant for Notes: How FixNote Searches, Answers and Edits'
description: 'What the FixNote assistant does with your notes: how it searches and cites sources, what it can change, when it asks first and how to undo its edits.'
date: 2026-10-08
translationKey: assistant-agent
faq:
  - q: Can the AI delete a note without asking?
    a: No. In every mode, deleting a note or a folder waits for your confirmation. Anything the assistant deleted can be restored from the AI activity log.
  - q: How do I undo changes the assistant made?
    a: Click "Undo all" under the answer. A single change can be undone later in Settings → AI → "AI activity", as long as the note has not been edited since.
  - q: Do I need a subscription to use the assistant?
    a: FixNote AI is part of Pro. On the free plan you can connect your own key for an OpenAI-compatible provider, or Ollama in the desktop app.
  - q: Does the model see all my notes?
    a: No. Search runs on your device, and the model receives your question, the passages found for it and the notes the assistant reads while answering.
---

Can you let an AI into your notes without worrying that it will break something? The FixNote assistant answers questions about what you wrote and changes notes when you ask: it creates a note, adds to a list, moves an entry into a folder. Here is how it searches, what it can change, when it asks for permission and how to put everything back.

## How the assistant answers a question

Open the chat with Ctrl+J (⌘J on a Mac) and ask in your own words. You can also dictate the question: the recording stays on your device and is transcribed there.

First, FixNote looks for matching passages on your device, by keywords and by meaning, and adds translations and synonyms to the query. That is why a question in English finds a note written in Spanish. The article on [searching notes in three languages](/blog/searching-notes-in-three-languages/) explains the details. When the passages are not enough, the assistant searches again with other words or reads a whole note. Every step shows in the chat: "Searching «trip»", "Reading «Trip 2026»".

The answer carries numbered sources. Click a number to open the note a fact came from. Under the answer FixNote shows how well it is grounded: "Grounded in your notes", "Partly grounded" or "Not found in your notes".

## Where it looks

Above the input there is a "Where the assistant looks" switch: all notes, one folder, one note or a selection inside it. "Follow what I open" changes the context to whatever is on screen. With every question the assistant gets the list of your folders, so "look in my Work folder" needs no clarification.

## What the assistant can change

The assistant creates notes, adds to them, edits and rewrites text, moves notes between folders, creates and renames folders, and adds to the daily note. It can also delete notes and folders; when a folder is deleted, its notes stay.

When the assistant changes a note that is open on your screen, the text types itself into the editor as one step, and Ctrl+Z (⌘Z) puts it back. In a shared note the edit goes into the live document, and the other members see "FixNote AI" with the name of the person who asked.

## When it asks for permission

You decide how much freedom it gets in Settings → AI → "AI modes":

- In "Ask every time" mode each change waits for your "Allow", and "Allow all" stops the questions for the rest of that answer.
- In "Accept edits" mode edits in a note and requests in the chat apply right away, while "Tidy up" waits for your approval.
- In "Auto" mode everything applies right away, "Tidy up" included.

In every mode, deleting waits for confirmation. If one answer adds up to more than five changes, the assistant asks once whether to go on.

## How to undo changes

Every answer that changed something has a "Changes: N" line under it. Click it to see the list, or click "Undo all" to roll back the whole answer at once.

On top of that, every change made by AI goes into "AI activity" in Settings → AI. You can undo it from there later, as long as the note has not been edited since. The same log records changes from apps connected through [MCP](/features/mcp/): Claude Desktop, Cursor and others use the same tools as the assistant.

## How much it remembers

The chat remembers the conversation until you start a new one, so you can follow up with "now move that to my Home folder". The "Chat memory" indicator shows how full it is. When memory fills up, older messages are condensed into a short summary. "Clear conversation" removes only the chat history and leaves your notes as they are.

## Which model answers

FixNote AI is part of Pro and works with no setup. It has two levels in Settings → AI → "Thinking": "Standard" for most questions and "Deep" for big tasks across many notes. "Deep" takes longer and uses up the AI allowance about four times faster.

Instead of FixNote AI you can connect your own key for any OpenAI-compatible provider, or Ollama in the desktop app; both work on the free plan as well. The model has to support tool calls, otherwise the assistant can only answer from the passages it found.

## Where to start

Ask something you already know the answer to, such as "when did I last see the dentist?", and check the sources under the answer. Then, in "Ask every time" mode, ask for a small edit, allow it and undo it with "Undo all" to see how it works. The [assistant page](/features/ask-your-notes/) has more on what it can do.
