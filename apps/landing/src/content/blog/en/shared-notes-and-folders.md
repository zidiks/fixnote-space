---
title: 'Shared notes with end-to-end encryption: shared folders in FixNote'
description: 'How to invite someone to a FixNote note or folder, how edit and view access differ, how live edits show up, and what the server knows without seeing the text.'
date: 2026-10-04
translationKey: shared-notes
faq:
  - q: 'Does the person I invite need FixNote Pro?'
    a: 'No. Pro is needed by the person who shares the note or folder. The people invited only need a free FixNote account.'
  - q: 'Can the FixNote server read a shared note?'
    a: 'No. The text, live edits and files of a shared note are encrypted with its key, and each member gets that key sealed so only they can open it. The server knows the members, their email addresses and their access.'
  - q: 'What happens when two people type in the same paragraph at once?'
    a: 'The edits are merged. A shared note keeps its changes as a CRDT (Yjs), which combines simultaneous edits without conflicts.'
  - q: 'How long is an invitation to a shared note valid?'
    a: '30 days. If it isn’t accepted by then, the owner sees "Invite again" next to the address.'
---

How do you keep one note together with someone: a shopping list, a trip plan, notes for a project? In FixNote you can share a note or a whole folder with people by email, and the server still can't read the text. This post covers invitations, access levels, editing together and how shared notes are encrypted.

## How to invite someone to a note

Open the note, click "Share" and enter an email address. The person needs a FixNote account; if they don't have one, the app tells you. Then choose the access. With "Can edit" they write in the note with you, with "Can view" they only read it.

You can also share a whole folder with "Share…" in its menu. The member gets the folder with all its subfolders and notes, and new notes in it show up for everyone.

Shared notes and folders are part of Pro. Pro is needed by the person who shares; the people invited only need a free account.

## The invitation has to be accepted

The invitation arrives in the person's notification bell, and they click "Accept" or "Decline". Until then the note doesn't appear for them. If an invitation isn't accepted within 30 days it expires: next to the address you'll see "invitation expired" and an "Invite again" button.

## What editing together looks like

When you are both in the note, you see each other's edits right away. The other person's cursor is shown in its own color with their name, and their new text is briefly highlighted so you can see what changed. If the assistant changes a shared note at someone's request, "FixNote AI · asked by …" appears above the text and its writing types in for everyone.

Two people can write in the same paragraph at the same time. A shared note keeps its changes as a CRDT (we use Yjs), which merges simultaneous edits without conflicts. While you are offline, your edits are kept on the device and merged at the next sync.

## What "Can view" means

With view access nothing in the note can change: not the text, not its place in folders, and it can't be deleted. In a shared folder with view access you can't create notes or subfolders. If you drop a file or dictate something while such a folder is open, it goes into your own notes without a folder.

The owner can change someone's access at any time, and it applies immediately, even if the note is open on their screen.

## What the server knows about shared notes

The content of a shared note is encrypted with that note's key. Each member gets the key sealed with their public key, so only that member can open it. Live edits travel through the server encrypted as well. In a shared folder, its name and the keys of its notes are encrypted the same way. The [encryption page](/features/encryption/) and the post on [end-to-end encrypted notes](/blog/end-to-end-encrypted-notes/) explain how regular notes are protected.

The server knows who is in a note and with what access, and it stores email addresses. Members see each other's addresses.

Images and files in a shared note are stored on the server under that note and encrypted with the same key. The space they take counts against the note owner's storage.

## How to leave or stop sharing

A member can leave a note or a folder, and it disappears from their devices. The owner can remove one person or use "Stop sharing", and then the note stays only with them. The [shared notes page](/features/shared-notes/) has the rest of the details.

If you only want to show a note to someone who doesn't use FixNote, a read-only [share link](/features/share-links/) is enough. To try editing together, invite someone close to you to a shopping list with "Can edit", and each of you tick off an item from your own device.
