---
title: Share a note by link
metaTitle: 'Share a note with a link the server cannot read | FixNote'
description: Create a read-only link and send a note to anyone. The key lives in the part of the link after #, so the server keeps a copy it has no way to read.
eyebrow: Links
intro: How do you send a recipe or a packing list to someone who doesn't use FixNote? Create a read-only link. It opens in any browser, and the server only ever holds an encrypted copy of the note.
card:
  title: Read-only links
  text: Send a note as a link the server cannot read.
problem: Text pasted into a chat loses its images and formatting, and every edit means sending it again. Public pages in other apps show your text to the app's own servers too.
stepsTitle: How it works
steps:
  - title: Create the link
    text: Open a note, click Share and choose Create link.
  - title: Send it
    text: Click Copy and send the link to anyone. The reader needs no account and no app.
  - title: Update after edits
    text: The link shows a copy from the moment you made it. When the note changes, click Update and the same link opens the new copy.
  - title: Turn it off
    text: Stop sharing deletes the copy from the server, and the link stops working.
privacy: The copy is encrypted on your device with a key that lives only in the part of the link after #. Browsers never send that part to a server, so we hold ciphertext without its key. The link's page opens neither your account nor the reader's.
faq:
  - q: Does the reader need a FixNote account?
    a: No, the link opens in any browser. Creating one takes Pro on the note owner's side.
  - q: Does the link change when I edit the note?
    a: Not by itself; it shows the copy from when it was made. The Share dialog then says "The note has changed since." with an Update button, and the link's address stays the same.
  - q: What if a messenger cuts the link short?
    a: If the part after # is lost, the page says "This link is incomplete". The key can't be recovered from a cut link, so copy it again.
  - q: Are images included?
    a: Yes, along with the text, up to 3 MB of images in total. The page counts and mentions any that didn't fit.
  - q: Where can I see all my links?
    a: In Settings → Account & sync → Shared links. You can turn any of them off from there.
---

## How to create a link and turn it off

Links are part of Pro and need you to be signed in. Open the note, click Share at the top and, under Read-only link, choose Create link. A link looks like `app.fixnote.space/?s=<id>#<key>`, and below it you'll see the time the copy was taken. The copy holds the text and up to 3 MB of images.

If you edit the note later, the same dialog says "The note has changed since." Click Update, and anyone with the old link sees the new version. To turn the link off, click Stop sharing: the server deletes the copy, and the link opens "This link no longer works". Every open link is listed in Settings → Account & sync → Shared links.

## When it helps

A link works well for a recipe you send to relatives, a packing list for a group trip, lecture notes for classmates or instructions for a babysitter on where the keys are and what's for dinner. You send it once and update it as the note changes. The reader sees the note with its images and the date it was shared, and if they use FixNote too, the page leaves their account and notes alone.

Treat the link like a house key: anyone who has it can read the copy. The [encryption page](/features/encryption/) explains how the keys work across FixNote.

## When another tool is a better fit

A link shows one note, read-only. If the other person should edit with you, invite them to a [shared note](/features/shared-notes/); they will need a FixNote account.

If you want a public site with many pages, your own domain and search, Obsidian Publish or Notion's public pages fit better. See the [Obsidian comparison](/vs/obsidian/).
