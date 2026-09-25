---
title: How end-to-end encryption works in FixNote
description: A 12-word phrase, a key for every note, and a server that stores only ciphertext. A step-by-step look at what happens to a note before it is synced.
date: 2026-09-18
translationKey: e2ee
---

Notes are probably the most personal thing people keep in the cloud: plans, money, health, drafts of emails you never sent. So FixNote is built so that you don't have to trust us. A note is encrypted on your device, and the server only gets what it cannot read.

## It starts with 12 words

When you create an account, the app generates 16 random bytes (128 bits) and shows them as a 12-word phrase using the BIP39 standard, the same format crypto wallets use. The words are easy to write down on paper, and the last word carries a checksum, so the app catches a typo right away.

Every other key is derived from that phrase on your device: one for notes, one for folder names, one to check the phrase, and a key pair for incoming messages. Neither the phrase nor the keys are ever sent to the server. On a computer the key is kept in the system keychain (Windows Credential Manager, macOS Keychain); in the browser it stays in that browser's storage on this device.

## Every note has its own key

Each note is encrypted with its own random key using XChaCha20-Poly1305, a modern cipher with built-in integrity checks: if anyone changes a single byte, decryption simply fails.

The note's key is in turn encrypted ("wrapped") with your account key and stored next to the ciphertext. The ciphertext is also bound to the note's ID, so the server cannot quietly swap one note for another or pass off an old version as a new one.

Folder names are encrypted the same way. Images and other attachments are encrypted file by file and are stored only as ciphertext too.

## What the server sees

The honest answer is not "nothing", but only what sync cannot work without:

- the note's ciphertext and wrapped key;
- the note and folder IDs;
- created and edited dates, a version number and a deleted flag;
- the note type: a regular note or a daily note (and its date);
- your email address, to send sign-in codes.

Note text, folder names and images are never on the server in readable form. If the database were ever stolen, the attacker would get a pile of random-looking bytes.

## Adding a new device

You can type the 12 words, but there is an easier way. On a device where you are already signed in, start adding a new device: both screens show the same six-digit code. If the codes match, the key is sent to the new device encrypted so that only it can read it.

## What about the assistant?

Search runs right on your device, including search by meaning. The language model only receives the passages found for a specific question, never your whole library. If you'd rather not send even those out, plug in your own OpenAI, OpenRouter, Groq or DeepSeek key, or Ollama on your own computer. In local-only mode FixNote doesn't contact our server at all.

## If you lose the phrase

On devices where you are already signed in, your notes stay available, and you can add a new device from there without the phrase. But if you lose both the phrase and every device, nobody can recover your notes, us included. That is the flip side of encryption you don't have to trust. Write the phrase down on paper and keep it with your important documents.

More on all of this on the [Security](/en/security/) page.
