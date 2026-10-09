---
title: 'End-to-End Encrypted Notes: How Encryption Works in FixNote'
description: 'A 12-word phrase, a fresh key for every version of a note and a server that stores only ciphertext: what FixNote sees and what happens if you lose the phrase.'
date: 2026-09-18
updated: 2026-10-09
translationKey: e2ee
faq:
  - q: Can FixNote read my notes?
    a: No. The server stores only ciphertext, and the keys exist only on your devices. Passages of notes reach a model only when you ask the assistant a question.
  - q: What happens if I lose my recovery phrase?
    a: Your notes stay available on the devices where you are signed in, and you can show the phrase again there after an email code. If you lose the phrase and every device, nobody can recover the notes.
  - q: Which encryption does FixNote use?
    a: XChaCha20-Poly1305 from the libsodium library. Keys are derived on your device from a 128-bit random secret, written down as a 12-word BIP39 phrase.
  - q: Do I need encryption if I don't use sync?
    a: Without an account, notes never leave your device at all. Encryption comes into play when you sign in and your notes start to sync.
---

Notes hold things you would rather keep to yourself: plans, money, health, drafts of emails. Can you sync them through the cloud without the service being able to read them? In FixNote a note is encrypted on your device, and the server only receives what it cannot read. This article walks through where the keys come from, how a note is encrypted, what the server still sees, and what to do if you lose your recovery phrase.

## What end-to-end encryption means for notes

End-to-end encryption means a note stays encrypted on its way to the server, while it is stored there and on its way to your other device. Only your devices can decrypt it, because only they have the keys. The server holds bytes that mean nothing without a key.

In FixNote this applies to sync. Without an account, notes never leave the device. Sync between devices is part of Pro; on the free plan with an account, sync only downloads.

## It all starts with 12 words

When you create an account, the app generates 16 random bytes (128 bits) and shows them as a phrase of 12 English words using the BIP39 standard. The words are easy to write on paper, and the last word carries a checksum, so the app catches a typo right away. After showing the phrase, FixNote asks you to type a few of the words by their numbers to make sure you wrote it down.

All other keys are derived from this secret on your device: for notes, for folder names, for checking the phrase, for links, and a key pair for incoming data. Neither the phrase nor the keys are ever sent to the server. In the desktop app the secret lives in the system credential store (Windows Credential Manager, macOS Keychain). In the browser it sits in browser storage, encrypted with a key that scripts can use but cannot read.

## How a note is encrypted

Every time a note goes to the server, FixNote encrypts it with a fresh random key using XChaCha20-Poly1305 from the libsodium library. This cipher checks integrity: change a single byte of the ciphertext and decryption fails.

The note's key is in turn encrypted with your account key and stored next to the ciphertext. The ciphertext is also bound to the note's ID. So the server cannot put one note's content in place of another's, because decrypting such a swap fails too.

Folder names are encrypted with a separate key. Images and other files are each encrypted with their own key and are stored only as ciphertext as well.

## What the server can see

The server exists for sync, so it does see some things. About your notes and folders it knows the following:

- It stores the ciphertext of each note and the note's encrypted key.
- It sees the IDs of notes and folders and which folder sits inside which.
- It knows creation and edit times, the version number, and whether a note was deleted or pinned.
- It sees whether a note is a regular note or a daily note, and the date of a daily note.
- It knows your email address, to send sign-in codes, and the size of your encrypted files.

The text of your notes, their titles, folder names and the contents of images are not on the server in readable form. If the database were stolen, the thief would get bytes that look random.

## How to add a new device

On the new device, sign in with the code from your email. Then you can either type the 12 words or choose "Confirm on another device". In that case the device where you are already signed in shows the request "A new device wants access to your notes" with a six-digit code, and the new device shows the same code. If the codes match, press "Allow": the old device encrypts the secret for a one-time key of the new one, and only the new device can read it. If the codes differ, someone swapped the key on the way, and you should decline.

## Shared notes, links and Telegram

A shared note (Pro) has its own key, sealed separately for each member with that member's public key. Live edits between members travel encrypted too. A public link to a note keeps its key in the address after the # sign, and browsers never send that part of the address to the server.

Messages to the Telegram bot pass through Telegram unencrypted, which is how the messenger works. Our bot immediately encrypts them with your account's public key and queues them, and your device turns them into notes.

## What goes to the model when you ask the assistant

Searching your notes, including search by meaning, happens on your device. The model receives your question, the passages found for it and any notes the assistant reads while answering. It never gets your whole database. If you'd rather not send even that, connect your own key for an OpenAI-compatible provider, or Ollama in the desktop app. In "Only on this device" mode FixNote does not contact our server at all: there is no sync, Telegram, sharing or FixNote AI.

## What happens if you lose the phrase

On the devices where you are already signed in, your notes stay available. From there you can add a new device without the phrase and show the phrase itself again. If you lose both the phrase and every device, nobody can recover the notes, including us, because we don't have the key.

So do it today: open Settings → "Account & sync", click "Show recovery phrase", enter the code from your email and copy the 12 words onto paper. Keep it with your important documents. More details are on the [Encryption](/features/encryption/) and [Security](/security/) pages.
