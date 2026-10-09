---
title: Shared notes and folders
metaTitle: 'Encrypted shared notes: edit together in real time in FixNote'
description: Invite people by email to a note or a whole folder, pick what they can do, and edit together live. The server stores ciphertext; only members read the text.
eyebrow: Together
intro: How do you keep a shopping list or a trip plan with someone else without your text sitting readable on a server? Invite them by email to a note or a whole folder, and you see each other's edits as they happen.
card:
  title: Shared notes
  text: Invite people by email to notes and folders and edit them together.
problem: A note pasted into a chat goes stale after the first edit, and soon everyone has their own version. Cloud editors fix that, but they keep your text readable on their servers.
stepsTitle: How it works
steps:
  - title: Invite by email
    text: Open a note, click Share and enter the email of someone with a FixNote account. For a folder, pick Share… in its menu.
  - title: Choose access
    text: Can edit lets them change the text with you; Can view lets them only read it.
  - title: They accept
    text: The invitation lands in their notification bell and they click Accept. An invitation nobody accepts expires after 30 days.
  - title: Edit together
    text: Other people's cursors carry their name and colour, and their fresh edits are briefly highlighted.
privacy: A shared note has its own key, and each member gets it sealed to their public key. Text, images and live edits pass through the server only in encrypted form. The server knows who is in a note and with what role, and it stores their email addresses.
faq:
  - q: Do the people I invite need Pro?
    a: No. The owner needs Pro to share a note or folder; members only need a free FixNote account.
  - q: Can I invite someone who has no FixNote account?
    a: No. The note's key is sealed to their account's public key, so they need an account. To just show someone the text, create a read-only link, which opens without one.
  - q: What happens when two people edit the same paragraph at once?
    a: The edits merge. A shared note is stored as a CRDT document (Yjs), which combines simultaneous changes without conflict copies.
  - q: What can a member with view access do?
    a: Only read. They can't change, move or delete the note, and in a shared folder they can't create notes or subfolders.
  - q: How do I stop sharing?
    a: The owner clicks Stop sharing in the Share dialog, and the note stays with them alone. A member can also leave a note or folder, and it disappears from their devices.
---

## How to share a note or a folder

Open the note and click Share at the top. In the Share note dialog, enter an email, choose Can edit or Can view and click Invite. Until the person answers, their address is marked "invited". If 30 days pass without an answer, you'll see "invitation expired" and an Invite again button.

To share a folder, open its menu in the sidebar and pick Share…. The member gets the folder with all its subfolders and notes, and any note you later put in it becomes shared too. You can change someone's role at any time; it applies at once, even if they have the note open.

When the assistant changes a shared note for someone, the note shows "FixNote AI · asked by …", so everyone can see where the edit came from.

## When it helps

On a family shopping list, one person adds items from a laptop while another ticks them off in the shop, using the web app on a phone. Friends planning a trip each fill in their part of the route and bookings. You and a colleague can keep a work folder of meeting notes and project tasks and give the client view-only access.

Images and files in a shared note are encrypted with the same key, and the space they take counts against the owner's storage. For a closer look at how the keys work, read about [end-to-end encryption](/features/encryption/).

## When another tool is a better fit

If your whole team needs a knowledge base with comments, databases and fine-grained permissions, Notion will serve you better. FixNote has two roles and no comments on text, and its server can't read your notes. See the [Notion comparison](/vs/notion/).

When you only need to show a note to someone who doesn't use FixNote, skip the invitation and send a [read-only link](/features/share-links/).
