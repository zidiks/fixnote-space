---
title: Search your notes
metaTitle: 'Note search by words and by meaning, in three languages: FixNote'
description: FixNote searches your notes on the device by word beginnings, across Cyrillic and Latin, in the text of images and by meaning, even in another language.
eyebrow: Search
intro: You remember writing something about the holiday, but not which word you used or in which language? FixNote search finds the note by the start of a word, across Cyrillic and Latin spellings, by the text in its images and by meaning.
card:
  title: Note search
  text: Finds notes by words, transliteration and meaning.
problem: Notes get written however they come out, "call" one day and "созвон" the next, "Telegram" or "телеграм". A plain search looks for exactly the letters you typed and misses the note that says the same thing differently.
stepsTitle: How it works
steps:
  - title: Open search
    text: Press Ctrl+K on Windows or ⌘K on a Mac, or click "Search" in the sidebar. The shortcut works in any keyboard layout.
  - title: Type a word or two
    text: Each word is matched by its beginning and in the other script too, so "telegram" also finds "телеграм". Each result shows the passage with the words it found.
  - title: Check similar notes
    text: Below the word matches, "Similar in meaning" lists notes that share none of your words but talk about the same thing. A search for "giveaway" can turn up a Russian note about a "розыгрыш".
privacy: Both kinds of search run on your device and work offline. The model for search by meaning downloads once and runs locally, and the text of your notes is not sent anywhere for search.
faq:
  - q: Does search work offline?
    a: Yes. Word search is built into the local database, and the model for search by meaning works without a connection after the first download.
  - q: How do I turn on search by meaning?
    a: It starts the first time you open the assistant on a computer. FixNote downloads the model (about 120 MB) and indexes your notes in the background. On a phone, tap "Download" in the assistant panel.
  - q: Will an English query find a note in Spanish or Russian?
    a: By meaning, yes. The model is multilingual and links English, Russian and Spanish, so a question in one language finds a close note in another.
  - q: Does FixNote search the text in images?
    a: Yes. Words FixNote has read in screenshots and photos are searched too; those notes come after the ones that contain the words in their text.
  - q: Do I need Pro for search?
    a: No. All of search works on the Free plan.
---

## How to search so you find things

Open search with Ctrl+K (⌘K on a Mac). Type the start of a word: "travel" also finds "traveling" and "travelled". Every word of the query has to appear in the note, so two precise words narrow the results better than one general one. Accents don't get in the way: "cafe" finds "café" and "telefono" finds "teléfono".

Search by meaning works once its model is downloaded. That happens the first time you open the assistant on a computer, and you can see its state in Settings → Advanced → "Models on this device", under "Search by meaning". From then on, up to four notes close in meaning appear under the word matches.

The same window creates a new note or opens today's note. On a computer you can also open search from the tray icon or the Mac menu bar with "Search…", even while the FixNote window is hidden.

## When it helps

If you write in a mix of languages, you don't have to remember how exactly you spelled a word. Months later you can find the wardrobe measurements from your renovation notes even if you describe them differently now. A screenshot with a booking number turns up by that number, because FixNote reads [text in images](/features/text-in-images/). Before a meeting, type the person's name and you get every note that mentions them, transcripts of past calls included.

When you want a direct answer, ask the [assistant](/features/ask-your-notes/): it searches the same ways and replies with links. How both kinds of search work is explained in [searching notes in three languages](/blog/searching-notes-in-three-languages/).

## When another tool is better

FixNote searches your notes, the text in their images and notes others have shared with you. It does not look inside attached PDFs or other files. If you need one search across a knowledge base for a team of dozens, with permissions and sections, Notion fits better ([FixNote vs Notion](/vs/notion/)).
