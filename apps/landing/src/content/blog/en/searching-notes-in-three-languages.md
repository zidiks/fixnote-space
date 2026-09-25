---
title: 'Why “розыгрыш” finds “giveaway”: searching notes in three languages'
description: How FixNote searches notes that mix Russian, English and Spanish, and why keyword search and search by meaning work together.
date: 2026-09-22
translationKey: search
---

A typical notes app searches for exactly the letters you typed. But we write thoughts down however they come: "call with Oleg", "созвон с Олегом", "telegram bot", "телеграм-бот". A month later you can't remember which word you used, and exact-match search won't find it.

FixNote has two searches, and both run right on your device.

## Keyword search that forgives

The first is full-text search, built into the local SQLite database. On top of it FixNote does a few things:

- **Transliteration.** Every word is also searched in the other script, so "телеграм" finds "telegram" and "zametki" finds "заметки".
- **Word endings.** Russian word forms like "отпуска", "отпуском" and "отпуск" are reduced to a shared stem, so grammar doesn't get in the way.
- **Layout doesn't matter for shortcuts.** Mod+K opens search on a Russian or Spanish layout too, because keys are matched by physical position.

Matches are highlighted in the note, so you can see at a glance why it came up.

## Search by meaning

The second search finds notes that share no words with your query. Each note is split into passages, and a small multilingual model (multilingual-e5-small) turns each passage into a vector, a numeric description of its meaning. The model is downloaded once and runs on your computer; note text never leaves it.

Your question becomes a vector too, and FixNote looks for passages close in meaning. The model was trained on many languages, so a question in English finds a note written in Spanish.

## How the two work together

Results from both searches are fused by rank: a passage found both by keywords and by meaning moves up. Recent notes get a small boost, since "what did I decide about the vacation?" is more likely about this year than two years ago.

## Where the assistant helps

When you ask the assistant, it first adds keywords to the query: translations and synonyms. That's how "giveaways" finds a note about "розыгрыш". These words only go into keyword search; search by meaning always uses your question exactly as you typed it.

The assistant then gets the best few passages and answers from them alone, citing sources by number: `[1]`, `[2]`. Click a number to open the note the answer came from. If the answer isn't in your notes, the assistant says so instead of making something up.

## Why it matters

Good notes aren't the ones neatly filed into folders, they're the ones you find when you need them. Search that understands transliteration, word forms and meaning lets you write things down fast without deciding upfront where they belong. You can tidy up later, and the assistant helps with that too.

Try it yourself: [download FixNote](/en/download/) or open the web app.
