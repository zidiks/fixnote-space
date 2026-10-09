---
title: "How to share a note by link the server can't read: FixNote"
description: "FixNote's read-only links: how to create and update one, why the key lives after the # so the server never sees your text, and how to stop sharing a note."
date: 2026-09-29
translationKey: share-links
faq:
  - q: "Does the person I send the link to need a FixNote account?"
    a: "No. The link opens in any browser, with no account and nothing to install. Creating a link takes FixNote Pro."
  - q: "Can the FixNote server read a note shared by link?"
    a: "No. The copy is encrypted with a key from the part of the link after the #, and browsers never send that part to a server. The server only stores ciphertext."
  - q: "If I edit the note, does the link show the new text?"
    a: "The link shows a copy from when it was created. After editing, press Update in the Share window and the same link shows the new text."
  - q: "How do I stop sharing a note?"
    a: "Press Stop sharing in the Share window. The server deletes the copy and the link stops working. All your links are listed in Settings → Account & sync → Shared links."
---

How do you send a note to someone who doesn't use your notes app, without putting the text on somebody's server in plain view? FixNote has read-only links for that. Here is how to create and update one, where the key to the text lives, and how to turn a link off.

## How to create a link to a note

Open the note, press Share, and under Read-only link choose Create link. FixNote encrypts a copy of the note, stores it on the server and copies the link to your clipboard right away. Paste it into any chat or email.

Links are part of Pro, so you need to be signed in. The person you send it to needs nothing: the page opens in any browser, on a computer or a phone.

## What the reader sees

The page shows the note's text with its images and the date it was shared. It doesn't open your account or the reader's, and it doesn't touch their notes even if they use FixNote. A line at the bottom says the note was shared from FixNote with end-to-end encryption.

Images are included as long as together they stay within three megabytes. If some don't fit, the page says how many were left out.

## How to update a link after editing

A link shows a copy of the note as it was when you created it. If you change the text later, the Share window says "The note has changed since." Press Update and the same link shows the new copy. There's no need to send the link again.

## Why the server can't read the note

A link looks like this: `app.fixnote.space/?s=<id>#<key>`. The part after `#` is called the fragment. Browsers never send the fragment to a server with any request; that's how the web works. The copy is encrypted with the key from the fragment, so what the server holds is ciphertext we can't open. Decryption happens in the reader's browser.

Two things follow from this. Anyone with the full link can read the copy, so treat it like a door key. And if the part after `#` gets lost, say a chat app cut the link short, the page says "This link is incomplete". The key can't be recovered, so copy the link again. How the rest of your notes are encrypted is covered in [end-to-end encryption in FixNote](/blog/end-to-end-encrypted-notes/).

## How to stop sharing

In the same Share window, press Stop sharing. The server deletes the copy, and the link now shows "This link no longer works". If you create a link for the note again later, it gets a new address; the old one stays closed.

All your links are listed in Settings → Account & sync → Shared links. You can copy or turn off any of them there, including links to notes you have since deleted.

## A link or a shared note?

A link fits when someone without FixNote just needs to see the text: a recipe, a packing list, a meeting plan. The reader can't change anything. If you want to edit together, invite the person to a [shared note](/features/shared-notes/) by email instead: it has live editing and two roles, Can edit and Can view, but everyone needs a FixNote account. Everything about links is on the [share links page](/features/share-links/).

Pick the note you most often paste into chats as plain text, create a link for it, and next time you edit it just press Update.
