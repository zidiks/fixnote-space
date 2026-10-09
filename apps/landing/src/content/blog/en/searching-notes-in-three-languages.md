---
title: 'Search Notes in Several Languages: How FixNote Finds Them'
description: 'How to find a note when you forget which language you wrote it in: FixNote keyword search with transliteration, on-device search by meaning, and the assistant.'
date: 2026-09-22
updated: 2026-10-09
translationKey: search
faq:
  - q: Does search find a word written in Latin letters when I type it in Cyrillic?
    a: Yes. FixNote also looks for each word of the query in the other alphabet, so "телеграм" finds "Telegram" and "zametki" finds "заметки".
  - q: Can a question in one language find a note written in another?
    a: Yes, that is what search by meaning does. Its model is multilingual, so passages with a similar meaning are found in any of the languages it knows.
  - q: Are my notes sent to a server when I search?
    a: No. The full-text index and the search-by-meaning model run on your device. Only a question to the assistant and the passages found for it go out, and only if you use the assistant.
  - q: How big is the search-by-meaning model?
    a: About 120 MB. It downloads once and then works offline.
---

You wrote "созвон с Олегом" and now you search for "call with Oleg". The note says "sorteo" and you ask about "giveaways". How do you find a note when, a month later, you can't remember which language or which word you used? This article covers how FixNote searches by keywords, how search by meaning works, and what the assistant adds on top.

## Why ordinary search misses the note

Ordinary note search compares letters. If you wrote a thought in Spanish and search in English, nothing matches. Word forms trip it up too: a note about "planning" may not show up for "planned". In notes that mix English, Spanish and Russian these misses add up, and the note seems to have vanished.

FixNote has two searches, and both run right on your device without an internet connection.

## Keyword search: word starts and transliteration

Search opens with Ctrl+K (⌘K on a Mac). The shortcut also works with a Russian or Spanish keyboard layout, because FixNote looks at the physical key. Underneath is a SQLite full-text index kept in the local database.

Each word of the query matches the start of a word, so "plan" finds "plans", "planned" and "planning". Each word is also searched in the other alphabet: "телеграм" finds "Telegram" and "zametki" finds "заметки". When the query has several words, the note has to contain all of them.

Under the title of each result, FixNote shows a snippet with the matched words highlighted, so you can see at once why the note came up.

Words in images count as well. FixNote reads the text in screenshots and photos on your device, so a note with a picture is found by the words written in it. This is free; see [text in images](/features/text-in-images/).

## Search by meaning

The second search finds notes that share no words with the query. Each note is split into passages, and for each passage a small multilingual model (multilingual-e5-small) computes a vector, a numeric description of its meaning. The query becomes a vector too, and FixNote looks for passages with a similar meaning.

The model was trained on many languages, so a question in English can find a note written in Spanish or Russian. It is about 120 MB and downloads once: on a computer the first time you open the assistant, on a phone when you tap the button. You can download or remove it in Settings → Advanced → "Models on this device". The model runs on your device, and the text of your notes is not sent anywhere for search.

In the Ctrl+K window, results by meaning appear under "Similar in meaning", next to the keyword matches.

## How the assistant searches

When you ask the [assistant](/features/ask-your-notes/) a question, FixNote first asks the model for extra keywords: translations and synonyms. That is how a question about "giveaways" finds a note about "sorteos". These words go only into keyword search. Search by meaning always uses your question exactly as you typed it.

For the assistant, FixNote also trims common word endings, so a Russian or Spanish word in an inflected form still matches its other forms. The results of both searches are then merged by rank: a passage found both by keywords and by meaning rises higher. Recently edited notes get a small boost that fades over about a month, because "what did I decide about the trip?" is more often about this year.

The assistant receives the best passages and answers from them, numbering its sources: `[1]`, `[2]`. Click a number to open the note a fact came from. When the passages are not enough, the assistant can search again with other words or read a whole note. When the answer is not in your notes, the label under it says "Not found in your notes".

## Try it on your own notes

Open search with Ctrl+K and type a word in the other alphabet from the one your note uses, or the start of a word instead of the full form. Then ask the assistant a question in one language about a note you wrote in another, and look at the sources it cites. [Download FixNote](/download/) or open the web app at app.fixnote.space. For habits that make notes easier to find in the first place, read [how to take notes you can find later](/blog/how-to-take-notes-you-can-find/).
