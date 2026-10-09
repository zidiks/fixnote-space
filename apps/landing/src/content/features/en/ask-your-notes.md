---
title: Ask your notes
metaTitle: 'Ask your notes with AI: an assistant that cites its sources'
description: The FixNote assistant finds answers in your notes, links to the notes it used and can create and edit notes. Works with FixNote AI, your own key or Ollama.
eyebrow: Assistant
intro: Ask in plain words what you agreed with the contractor or where you wrote down the router password. The assistant finds the right notes, answers and shows where the answer came from.
card:
  title: Ask your notes
  text: The assistant answers from your notes and links to them.
problem: After six months of notes you no longer remember which note holds the thought you need or what words you used. Keyword search turns up dozens of matches, and you still end up opening them one by one.
stepsTitle: How it works
steps:
  - title: Ask a question
    text: Open the assistant with Ctrl+J (⌘J on a Mac) and ask the way you would ask a colleague. You can ask by voice, too.
  - title: The assistant searches
    text: It searches by words and by meaning, opens the notes that fit and tries other words if the first search falls short.
  - title: An answer with sources
    text: The answer lists the notes it was built from. Click one to check the original.
privacy: Search by words and by meaning runs on your device. The model receives your question, your folder names, fragments of matching notes and the notes the assistant opens, never the whole collection. With Ollama on your computer, nothing leaves it at all.
faq:
  - q: Do I need Pro to ask questions about my notes?
    a: No. On the Free plan the assistant works with your own model key, or with Ollama in the desktop app. Pro adds FixNote AI, which needs no key.
  - q: Can the assistant change a note without asking?
    a: By default every change waits for your approval. Deleting and many changes at once always ask first, and anything it does can be undone.
  - q: Does the assistant remember earlier questions?
    a: Yes, it remembers the conversation until you clear it. When a long thread fills its memory, older messages are condensed into a summary.
  - q: Can I ask in one language about notes written in another?
    a: Yes. Before searching, the assistant adds translations and synonyms to the query, so a question in English can find a note written in Spanish or Russian.
---

## How to ask for a better answer

Name what you remember: a person, a place, a rough date. "What did Oleg and I agree about the deadline in September" works better than "deadline". If the answer is incomplete, ask it to look in one folder: the assistant gets your folder list with every question and can search inside a single folder. Above the input there is also a switch for "Where the assistant looks": all notes, a folder, the open note or a selection.

Each answer shows how it got there ("Searching…", "Reading…") and lists its sources. A line under the answer tells you whether it is "Grounded in your notes" or "Not found in your notes", so a made-up answer is easy to spot.

The assistant can also act. Ask it to collect the week's tasks into one note, move drafts into a folder or fix a shopping list. Every change is listed under the answer with an "Undo all" button, and how much it may do without asking is set in Settings → AI → "AI modes".

## When it helps

Before a meeting, ask what was discussed last time and get a short recap with links to the call notes. In your renovation notes it finds the measurement you wrote down half a year ago. If you keep a daily note, it can pull together everything you wrote about a project over the month. Searching across languages is covered in [searching notes in three languages](/blog/searching-notes-in-three-languages/), and plain [search](/features/search/) still works when you know the exact words.

## When another tool is better

If you need to search a shared knowledge base for a company of hundreds, a team wiki with its own search, such as Notion, is the better fit. FixNote answers from your own notes and the notes shared with you. See the [FixNote and Notion comparison](/vs/notion/). To try the assistant, start with a question you already know the answer to and check the sources under the reply.
