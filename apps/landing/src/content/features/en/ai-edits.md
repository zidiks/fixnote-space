---
title: Edit text with AI
metaTitle: 'Rewrite, shorten and fix text with AI right in your notes'
description: Select text in a note and ask AI to rewrite, shorten or fix it. FixNote shows the change word by word, and the text changes only when you press Accept.
eyebrow: AI edits
intro: Want a paragraph clearer, an email shorter or the typos gone without pasting text into a chatbot? Select it, pick an action, and FixNote shows the suggested edit right in the note.
card:
  title: AI text edits
  text: AI rewrites, shortens and fixes the text you select, and you accept the result.
problem: Editing with a chatbot means copying the text over, explaining the context and pasting the answer back. Along the way links and formatting get lost, and so do the words you never meant to change.
stepsTitle: How it works
steps:
  - title: Select the text
    text: An "Ask AI" button appears above the selection, and Ctrl+Shift+E (⌘⇧E on a Mac) opens it too. For a whole note, click "Edit with AI" in the note's header.
  - title: Pick an action
    text: Choose Rewrite, Shorten, Reformat or Fix mistakes, or type what you want in your own words.
  - title: Review the edit
    text: Removed words are struck through in red, new ones are green. Accept (Ctrl+Enter) replaces the text, Reject leaves it as it was.
privacy: The model receives the selected text, the note's title and a little of the text around it for context. It does not see your other notes. With Ollama in the desktop app, the text never leaves your computer.
faq:
  - q: Can AI change a note without my approval?
    a: By default the note changes only when you press Accept. In the "Accept edits" and "Auto" modes the edit applies right away, and a notification offers Undo.
  - q: Do I need Pro to edit text with AI?
    a: No. Edits work with your own key for any OpenAI-compatible provider, or with Ollama in the desktop app. Pro adds FixNote AI, which needs no key.
  - q: Can I undo an edit I already accepted?
    a: Yes. Right after the edit, the editor's normal undo works. Every edit is also recorded under "AI activity" in Settings → AI, where you can undo it as long as the note has not been edited since.
  - q: Will AI change the language, numbers or names?
    a: The model is told to keep the text's language, names, numbers and links and to add nothing of its own. It translates only when you ask, for example "translate into Spanish".
---

## How to ask AI to edit text

Select a passage and click "Ask AI" above it, press Ctrl+Shift+E (⌘⇧E on a Mac) or choose "Ask AI…" from the right-click menu. A box opens with the prompt "What should I do with this text?" and ready-made actions. Rewrite makes the text read more clearly at about the same length. Shorten drops filler and repetition while keeping every point that matters. Reformat splits the text into short paragraphs, lists or a checklist. Fix mistakes corrects spelling, grammar and punctuation and nothing else.

For anything else, type it in the box: "expand this into a paragraph", "make the tone softer", "translate into French". The same box has "New note from this", which turns the selection into a separate note.

With nothing selected, the edit applies to the whole note, and you also get "Tidy up the note", which turns a raw dump into a note with a title, paragraphs and a checklist for tasks.

While you review the suggestion, the note stays as it is. If you edited the text yourself in the meantime, FixNote leaves it alone and asks you to try again. How edits apply is set in Settings → AI → "AI modes": with "Ask every time" each one waits for Accept, with "Accept edits" and "Auto" it applies at once.

## When it helps

Dictated text comes out as one long stream with repeats and filler words. After you save a [voice note](/features/voice-notes/), FixNote offers "Tidy up", and the stream becomes a note with a task list.

An email drafted in a note is easy to shorten before you send it. Meeting notes read better after Reformat. Fix mistakes is handy for anything you typed on your phone while walking.

To change several notes at once, for example to gather the week's tasks into one, ask the [assistant in the chat](/features/ask-your-notes/). It also shows each change and lets you undo it.

## When another tool is better

If you write long documents with a team and want AI that works across a shared workspace, Notion is the better fit: Notion AI comes with its Business plan. See the [FixNote and Notion comparison](/vs/notion/). To check grammar everywhere at once, in email and chat apps too, a separate writing assistant such as Grammarly makes more sense. FixNote edits text inside your notes only.
